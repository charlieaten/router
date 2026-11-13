import { expect, it, vi } from 'vitest'
import { createNavigation } from '../src/navigation'

function setup(
  prepare = async (entry: { href: string }, _signal: AbortSignal) => ({
    value: entry.href,
  }),
) {
  const dispose = vi.fn()
  const navigation = createNavigation<string>({
    initialContainer: 'main',
    containers: { main: { initialHref: '/' } },
    prepare,
    dispose,
    getNavigator: (entry) =>
      entry.href === '/workspace'
        ? {
            initialContainer: 'feed',
            backBehavior: 'none',
            containers: {
              feed: { initialHref: `${entry.href}/feed` },
              search: { initialHref: `${entry.href}/search` },
            },
          }
        : undefined,
  })
  return { navigation, dispose }
}

it('owns independent nested histories per parent visit and bubbles back to its owner', async () => {
  const { navigation } = setup()
  await navigation.initialize()
  await navigation.navigate({ href: '/workspace' })
  const a = navigation.getSnapshot().stacks.main!.at(-1)!
  await a.navigator!.navigate({ href: '/workspace/feed/one' })
  await a.navigator!.select('search')
  await a.navigator!.navigate({ href: '/workspace/search/two' })
  await navigation.navigate({ href: '/workspace' })
  const b = navigation.getSnapshot().stacks.main!.at(-1)!
  expect(a.key).not.toBe(b.key)
  expect(b.navigator!.getSnapshot().selected).toBe('feed')
  expect(b.navigator!.getActiveEntry()?.href).toBe('/workspace/feed')
  await b.navigator!.navigate({ href: '/workspace/feed/three' })
  await navigation.back()
  expect(navigation.getActiveEntry()?.href).toBe('/workspace/feed')
  await navigation.back()
  expect(navigation.getActiveEntry()?.href).toBe('/workspace/search/two')
  expect(a.navigator!.getSnapshot().selected).toBe('search')
  expect(a.navigator!.getSnapshot().stacks.feed).toHaveLength(2)
})

it('publishes parent and initial child atomically and retires a rejected child preparation', async () => {
  const { navigation, dispose } = setup(async (entry) => {
    if (entry.href.endsWith('/feed')) {
      throw new Error('child failed')
    }
    return { value: entry.href }
  })
  await navigation.initialize()
  const changes = vi.fn()
  navigation.subscribe(changes)
  await expect(navigation.navigate({ href: '/workspace' })).rejects.toThrow(
    'child failed',
  )
  expect(navigation.getActiveEntry()?.href).toBe('/')
  expect(changes).not.toHaveBeenCalled()
  expect(dispose.mock.calls.map(([entry]) => entry.href)).toEqual([
    '/workspace',
  ])
})

it('checks descendant blockers before removing a parent and disposes child before parent', async () => {
  const { navigation, dispose } = setup()
  await navigation.initialize()
  await navigation.navigate({ href: '/workspace' })
  const parent = navigation.getSnapshot().stacks.main!.at(-1)!
  const child = parent.navigator!.getActiveEntry()!
  const unblock = parent.navigator!.block(child.key, () => true)
  expect(navigation.isRemovalBlocked(parent.key)).toBe(true)
  expect(await navigation.back({ target: 'main' })).toBe(false)
  unblock()
  await navigation.back({ target: 'main' })
  expect(dispose.mock.calls.map(([entry]) => entry.href)).toEqual([
    '/workspace/feed',
    '/workspace',
  ])
  expect(
    await parent.navigator!.navigate({ href: '/workspace/feed/stale' }),
  ).toBe(false)
})

it('restores separate nested snapshots for duplicate parent visits', async () => {
  const { navigation } = setup()
  await navigation.initialize()
  await navigation.navigate({ href: '/workspace' })
  await navigation
    .getSnapshot()
    .stacks.main!.at(-1)!
    .navigator!.select('search')
  await navigation.navigate({ href: '/workspace' })
  const restored = setup().navigation
  await restored.restore(navigation.serialize())
  const entries = restored.getSnapshot().stacks.main!
  expect(entries[1]!.navigator!.getSnapshot().selected).toBe('search')
  expect(entries[2]!.navigator!.getSnapshot().selected).toBe('feed')
})

it('keeps blockers owned by another retained parent when disposing a child navigator', async () => {
  const { navigation } = setup()
  await navigation.initialize()
  await navigation.navigate({ href: '/workspace' })
  const a = navigation.getSnapshot().stacks.main!.at(-1)!
  a.navigator!.block(a.navigator!.getActiveEntry()!.key, () => true)
  await navigation.navigate({ href: '/workspace' })
  await navigation.back({ target: 'main' })
  expect(navigation.isRemovalBlocked(a.key)).toBe(true)
  expect(await navigation.back({ target: 'main' })).toBe(false)
})

it('preserves child entry identities and histories when reusing an updated parent visit', async () => {
  const { navigation } = setup()
  await navigation.initialize()
  await navigation.navigate({ href: '/workspace' })
  const before = navigation.getSnapshot().stacks.main!.at(-1)!
  await before.navigator!.navigate({ href: '/workspace/feed/two' })
  const child = before.navigator!.getActiveEntry()!
  before.navigator!.block(child.key, () => true)
  await navigation.navigate({
    href: '/workspace',
    state: { refreshed: true },
    behavior: 'reuse',
  })
  const after = navigation.getSnapshot().stacks.main!.at(-1)!
  expect(after.key).toBe(before.key)
  expect(after.navigator!.getActiveEntry()?.key).toBe(child.key)
  expect(after.navigator!.getSnapshot().stacks.feed).toHaveLength(2)
  expect(navigation.isRemovalBlocked(after.key)).toBe(true)
})

it('ignores stale Back and cancel handles after their owning parent was removed', async () => {
  const { navigation } = setup()
  await navigation.initialize()
  await navigation.navigate({ href: '/workspace' })
  const stale = navigation.getSnapshot().stacks.main!.at(-1)!.navigator!
  await navigation.back({ target: 'main' })
  await navigation.navigate({ href: '/other' })
  expect(stale.canGoBack()).toBe(false)
  expect(await stale.back()).toBe(false)
  expect(stale.cancelPending()).toBe(false)
  expect(navigation.getActiveEntry()?.href).toBe('/other')
})

it('uses child namespace defaults independently of its owning root navigator', async () => {
  const navigation = createNavigation<string>({
    initialContainer: 'main',
    rootKind: 'stack',
    containers: { main: { initialHref: '/' } },
    prepare: async (entry) => ({ value: entry.href }),
    getNavigator: (entry) =>
      entry.href === '/workspace'
        ? {
            initialContainer: 'feed',
            containers: {
              feed: { initialHref: '/feed' },
              search: { initialHref: '/search' },
            },
          }
        : undefined,
  })
  await navigation.initialize()
  await navigation.navigate({ href: '/workspace' })
  const nested = navigation.getSnapshot().stacks.main!.at(-1)!.navigator!
  await nested.select('search')
  await nested.back()
  expect(nested.getSnapshot().stacks.search).toHaveLength(1)
  expect(nested.getSnapshot().selected).toBe('feed')
})

it('cancels preparation of an initial child without publishing a partial parent', async () => {
  let entered!: () => void
  const pending = new Promise<void>((resolve) => {
    entered = resolve
  })
  const { navigation, dispose } = setup(async (entry, signal) => {
    if (entry.href.endsWith('/feed')) {
      entered()
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      )
    }
    return { value: entry.href }
  })
  await navigation.initialize()
  const navigating = navigation.navigate({ href: '/workspace' })
  await pending
  navigation.cancelPending()
  expect(await navigating).toBe(false)
  expect(navigation.getActiveEntry()?.href).toBe('/')
  expect(dispose.mock.calls.map(([entry]) => entry.href).sort()).toEqual([
    '/workspace',
    '/workspace/feed',
  ])
})

it('serializes deeply nested ownership as objects with linear snapshot growth', async () => {
  const create = (maxRestoreEntries = 1000) =>
    createNavigation<string>({
      maxRestoreEntries,
      initialContainer: 'main',
      containers: { main: { initialHref: '/' } },
      prepare: async (entry) => ({ value: entry.href }),
      getNavigator: (entry) => {
        const depth = Number(entry.href.slice(7))
        return entry.href.startsWith('/level/') && depth < 15
          ? {
              initialContainer: 'child',
              containers: { child: { initialHref: `/level/${depth + 1}` } },
            }
          : undefined
      },
    })
  const navigation = create()
  await navigation.initialize()
  await navigation.navigate({ href: '/level/0' })
  const serialized = navigation.serialize()
  expect(serialized.length).toBeLessThan(10000)
  const restored = create()
  await restored.restore(serialized)
  expect(restored.getActiveEntry()?.href).toBe('/level/15')
  const bounded = create(5)
  await bounded.initialize()
  await expect(bounded.restore(serialized)).rejects.toThrow('entry limit')
  expect(bounded.getActiveEntry()?.href).toBe('/')
})
