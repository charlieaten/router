import { describe, expect, it, vi } from 'vitest'
import { createNavigation } from '../src/navigation'
import type { NavigationChange, NavigationDefinition } from '../src/navigation'

function setup() {
  let sequence = 0
  const dispose = vi.fn()
  const navigation = createNavigation<{ visit: number; href: string }>({
    initialContainer: 'feed',
    containers: {
      feed: { initialHref: '/' },
      search: { initialHref: '/search' },
      modal: { initialHref: '/compose', overlay: true },
    },
    prepare: async (entry) => ({
      value: { visit: ++sequence, href: entry.href },
    }),
    dispose,
  })
  return { navigation, dispose }
}

describe('presentation histories', () => {
  it('keeps independent visits to a shared destination in separate tab stacks', async () => {
    const { navigation } = setup()
    await navigation.initialize()
    await navigation.navigate({ href: '/venues/123' })
    const feedVisit = navigation.getActiveEntry()
    await navigation.select('search')
    await navigation.navigate({ href: '/venues/123' })
    const searchVisit = navigation.getActiveEntry()
    expect(searchVisit?.key).not.toBe(feedVisit?.key)
    await navigation.select('feed')
    expect(navigation.getActiveEntry()).toBe(feedVisit)
    expect(navigation.getSnapshot().stacks.search).toHaveLength(2)
  })

  it('pushes duplicates and reuses nearest or oldest visit explicitly', async () => {
    const { navigation } = setup()
    await navigation.initialize()
    await navigation.navigate({ href: '/venues/123' })
    const first = navigation.getActiveEntry()
    await navigation.navigate({ href: '/venues/456' })
    await navigation.navigate({ href: '/venues/123' })
    const second = navigation.getActiveEntry()
    await navigation.navigate({ href: '/reviews' })
    await navigation.navigate({ href: '/venues/123', behavior: 'reuse' })
    expect(navigation.getActiveEntry()).toBe(second)
    await navigation.navigate({
      href: '/venues/123',
      behavior: 'reuse',
      match: 'oldest',
    })
    expect(navigation.getActiveEntry()).toBe(first)
    expect(navigation.getSnapshot().stacks.feed).toHaveLength(2)
  })

  it('reuses identity while validating and loading changed search parameters', async () => {
    const { navigation, dispose } = setup()
    await navigation.initialize()
    await navigation.navigate({ href: '/venues/123?section=menu' })
    const before = navigation.getActiveEntry()!
    await navigation.navigate({
      href: '/venues/123?section=reviews',
      behavior: 'reuse',
    })
    const after = navigation.getActiveEntry()!
    expect(after.key).toBe(before.key)
    expect(after.href).toBe('/venues/123?section=reviews')
    expect(after.value.href).toBe(after.href)
    expect(dispose).toHaveBeenCalledWith(before)
    expect(dispose).not.toHaveBeenCalledWith(after)
    expect(navigation.getSnapshot().stacks.feed).toHaveLength(2)
  })

  it('dismisses overlays before changing the selected tab history', async () => {
    const { navigation } = setup()
    await navigation.initialize()
    await navigation.navigate({ href: '/venues/123' })
    const background = navigation.getActiveEntry()
    await navigation.navigate({ href: '/compose', target: 'modal' })
    expect(navigation.getSnapshot().selected).toBe('feed')
    expect(navigation.getActiveEntry()?.container).toBe('modal')
    await navigation.back()
    expect(navigation.getActiveEntry()).toBe(background)
  })

  it('blocks every removed entry during reset and releases the new resources', async () => {
    const { navigation, dispose } = setup()
    await navigation.initialize()
    await navigation.navigate({ href: '/compose' })
    const current = navigation.getActiveEntry()!
    const unblock = navigation.block(current.key, () => true)
    expect(await navigation.reset('feed', ['/signed-out'])).toBe(false)
    expect(navigation.getActiveEntry()).toBe(current)
    expect(
      dispose.mock.calls.some(([entry]) => entry.href === '/signed-out'),
    ).toBe(true)
    unblock()
    expect(await navigation.reset('feed', ['/signed-out'])).toBe(true)
    expect(navigation.getActiveEntry()?.href).toBe('/signed-out')
  })

  it('does not double-pop an acknowledged native dismissal', async () => {
    const { navigation } = setup()
    await navigation.initialize()
    await navigation.navigate({ href: '/venues/123' })
    const key = navigation.getActiveEntry()!.key
    expect(await navigation.acknowledgeNativeDismiss(key)).toBe(true)
    expect(await navigation.acknowledgeNativeDismiss(key)).toBe(false)
    expect(navigation.getActiveEntry()?.href).toBe('/')
  })

  it('rejects a late load after a newer navigation commits and disposes its resource', async () => {
    let finish!: (value: { value: string }) => void
    const dispose = vi.fn()
    const navigation = createNavigation({
      initialContainer: 'main',
      containers: { main: { initialHref: '/' } },
      prepare: async (entry) =>
        entry.href === '/slow'
          ? new Promise<{ value: string }>((resolve) => {
              finish = resolve
            })
          : { value: entry.href },
      dispose,
    })
    await navigation.initialize()
    const slow = navigation.navigate({ href: '/slow' })
    await navigation.navigate({ href: '/fast' })
    finish({ value: 'slow result' })
    expect(await slow).toBe(false)
    expect(navigation.getActiveEntry()?.href).toBe('/fast')
    expect(dispose.mock.calls.some(([entry]) => entry.href === '/slow')).toBe(
      true,
    )
  })

  it('restores destination histories through prepare rather than serializing user data', async () => {
    const { navigation } = setup()
    await navigation.initialize()
    await navigation.navigate({ href: '/venues/123' })
    await navigation.select('search')
    await navigation.navigate({ href: '/venues/456' })
    const serialized = navigation.serialize()
    const restored = setup().navigation
    await restored.restore(serialized)
    expect(restored.getSnapshot().selected).toBe('search')
    expect(
      restored.getSnapshot().stacks.feed!.map((entry) => entry.href),
    ).toEqual(['/', '/venues/123'])
    expect(restored.getActiveEntry()?.href).toBe('/venues/456')
    expect(JSON.parse(serialized).stacks.feed[1]).toEqual({
      href: '/venues/123',
      identity: '/venues/123',
    })
  })

  it('validates restored containers and does not replace current state on failure', async () => {
    const { navigation } = setup()
    await navigation.initialize()
    const before = navigation.getSnapshot()
    expect(() =>
      navigation.restore(
        '{"version":1,"selected":"feed","stacks":{"feed":[]}}',
      ),
    ).toThrow()
    expect(() =>
      navigation.restore('{"version":1,"selected":"__proto__","stacks":{}}'),
    ).toThrow()
    expect(navigation.getSnapshot()).toBe(before)
  })
  it('preserves newer navigation started by an abort callback', async () => {
    let finish!: () => void
    let nested!: Promise<boolean>
    const navigation = createNavigation<string>({
      initialContainer: 'main',
      containers: { main: { initialHref: '/' } },
      prepare: async (entry, signal) => {
        if (entry.href === '/slow') {
          signal.addEventListener(
            'abort',
            () => {
              nested = navigation.navigate({ href: '/newer' })
            },
            { once: true },
          )
          await new Promise<void>((resolve) => {
            finish = resolve
          })
        }
        return { value: entry.href }
      },
    })
    await navigation.initialize()
    const slow = navigation.navigate({ href: '/slow' })
    expect(await navigation.navigate({ href: '/outer' })).toBe(false)
    expect(await nested).toBe(true)
    finish()
    expect(await slow).toBe(false)
    expect(navigation.getActiveEntry()?.href).toBe('/newer')
  })

  it('uses pathname identity consistently for initialization and reset', async () => {
    const navigation = createNavigation<string>({
      initialContainer: 'main',
      containers: { main: { initialHref: '/items?tab=a' } },
      prepare: async (entry) => ({ value: entry.href }),
    })
    await navigation.initialize()
    const key = navigation.getActiveEntry()!.key
    await navigation.navigate({ href: '/items?tab=b', behavior: 'reuse' })
    expect(navigation.getActiveEntry()!.key).toBe(key)
    await navigation.reset('main', ['/items?tab=c'])
    await navigation.navigate({ href: '/items?tab=d', behavior: 'reuse' })
    expect(navigation.getSnapshot().stacks.main).toHaveLength(1)
  })

  it('disposes committed acquisitions exactly once if a subscriber disposes navigation', async () => {
    const { navigation, dispose } = setup()
    await navigation.initialize()
    navigation.subscribe(() => navigation.dispose())
    await navigation.navigate({ href: '/next' })
    expect(
      dispose.mock.calls.filter(([entry]) => entry.href === '/next'),
    ).toHaveLength(1)
  })

  it('releases a replacement acquisition when reuse is blocked by a removed visit', async () => {
    const { navigation, dispose } = setup()
    await navigation.initialize()
    await navigation.navigate({ href: '/items?tab=a' })
    const original = navigation.getActiveEntry()!
    await navigation.navigate({ href: '/draft' })
    navigation.block(navigation.getActiveEntry()!.key, () => true)
    expect(
      await navigation.navigate({ href: '/items?tab=b', behavior: 'reuse' }),
    ).toBe(false)
    expect(
      dispose.mock.calls.filter(([entry]) => entry.href === '/items?tab=b'),
    ).toHaveLength(1)
    expect(dispose).not.toHaveBeenCalledWith(original)
  })

  it('checks multiple blockers on the same entry', async () => {
    const { navigation } = setup()
    await navigation.initialize()
    await navigation.navigate({ href: '/draft' })
    const key = navigation.getActiveEntry()!.key
    navigation.block(key, () => false)
    const unregister = navigation.block(key, () => true)
    expect(await navigation.back()).toBe(false)
    unregister()
    expect(await navigation.back()).toBe(true)
  })

  it('releases all partial restore acquisitions after one container fails', async () => {
    const dispose = vi.fn()
    let release!: () => void
    const navigation = createNavigation<string>({
      initialContainer: 'main',
      containers: {
        main: { initialHref: '/' },
        other: { initialHref: '/other' },
      },
      prepare: async (entry) => {
        if (entry.href === '/fail') {
          throw new Error('Load failed')
        }
        if (entry.href === '/slow') {
          await new Promise<void>((resolve) => {
            release = resolve
          })
        }
        return { value: entry.href }
      },
      dispose,
    })
    await navigation.initialize()
    const restored = navigation.restore(
      JSON.stringify({
        version: 1,
        selected: 'main',
        stacks: {
          main: [{ href: '/fail', identity: '/fail' }],
          other: [{ href: '/slow', identity: '/slow' }],
        },
      }),
    )
    release()
    await expect(restored).rejects.toThrow('Load failed')
    expect(
      dispose.mock.calls.filter(([entry]) => entry.href === '/slow'),
    ).toHaveLength(1)
    expect(navigation.getActiveEntry()?.href).toBe('/')
  })
})

it('initializes an inactive branch without changing selection, history or its owner', async () => {
  const { navigation, dispose } = setup()
  await navigation.initialize()
  const first = navigation.getActiveEntry()
  const before = navigation.getSnapshot()
  await navigation.initialize('search')
  expect(navigation.getSnapshot().stacks.search).toHaveLength(1)
  expect(navigation.getActiveEntry()).toBe(first)
  expect(navigation.getSnapshot().selected).toBe(before.selected)
  expect(navigation.getSnapshot().history).toEqual(before.history)
  const search = navigation.getSnapshot().stacks.search![0]
  await navigation.initialize('search')
  expect(navigation.getSnapshot().stacks.search).toEqual([search])
  expect(dispose).not.toHaveBeenCalled()
  navigation.dispose()
})

it('atomically activates a nested owner path and preserves it when a covering page blocks', async () => {
  const dispose = vi.fn()
  const navigation = createNavigation<{ href: string }>({
    initialContainer: 'app',
    containers: { app: { initialHref: '/' } },
    prepare: async (entry) => ({ value: { href: entry.href } }),
    dispose,
    getNavigator: (entry): NavigationDefinition | undefined =>
      entry.container === 'app' && entry.href === '/'
        ? {
            rootKind: 'tabs',
            initialContainer: 'map',
            containers: {
              map: { initialHref: '/map' },
              saved: { initialHref: '/saved' },
            },
          }
        : entry.container === 'saved'
          ? {
              rootKind: 'tabs',
              initialContainer: 'archive',
              containers: {
                archive: { initialHref: '/saved/archive' },
                buds: { initialHref: '/saved/buds' },
              },
            }
          : undefined,
  })
  await navigation.initialize()
  const owner = navigation.getSnapshot().stacks.app![0]!
  const tabs = owner.navigator!
  await navigation.navigate({ href: '/cover' })
  const covering = navigation.getActiveEntry()!
  const block = vi.fn((_change: NavigationChange<{ href: string }>) => true)
  const unblock = navigation.block(covering.key, block)
  const rootBefore = navigation.getSnapshot()
  const tabsBefore = tabs.getSnapshot()
  const resolve: Parameters<typeof navigation.activate>[0] = (node) =>
    !node.getOwner()
      ? { target: 'app', key: owner.key, descend: true }
      : node.getOwner()!.entry.container === 'app'
        ? { target: 'saved', descend: true }
        : { target: 'buds' }
  const observed: string[] = []
  navigation.onTreeChange(() =>
    observed.push(navigation.getActiveEntry()!.href),
  )
  expect(await navigation.activate(resolve)).toBe(false)
  expect(navigation.getSnapshot()).toBe(rootBefore)
  expect(tabs.getSnapshot()).toBe(tabsBefore)
  expect(block).toHaveBeenCalledTimes(1)
  expect(block.mock.calls[0]![0].destination?.href).toBe('/saved/buds')
  expect(observed).toEqual([])
  expect(dispose.mock.calls.map(([entry]) => entry.href).sort()).toEqual(
    ['/saved', '/saved/archive', '/saved/buds'].sort(),
  )
  unblock()
  expect(await navigation.activate(resolve)).toBe(true)
  expect(navigation.getSnapshot().stacks.app).toEqual([owner])
  expect(tabs.getFocusedContainer()).toBe('saved')
  expect(navigation.getActiveEntry()!.href).toBe('/saved/buds')
  expect(observed).toEqual(['/saved/buds'])
  navigation.dispose()
})

it('superseding an owner activation releases abandoned preparations exactly once', async () => {
  let finish!: () => void
  let started!: () => void
  const waiting = new Promise<void>((resolve) => {
    started = resolve
  })
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const dispose = vi.fn()
  const navigation = createNavigation<{ href: string }>({
    initialContainer: 'main',
    containers: { main: { initialHref: '/' } },
    prepare: async (entry) => {
      if (entry.href === '/slow') {
        started()
        await gate
      }
      return { value: { href: entry.href } }
    },
    dispose,
  })
  await navigation.initialize()
  const pending = navigation.activate(() => ({ request: { href: '/slow' } }))
  await waiting
  await navigation.navigate({ href: '/winner' })
  finish()
  expect(await pending).toBe(false)
  expect(navigation.getActiveEntry()!.href).toBe('/winner')
  expect(dispose.mock.calls.map(([entry]) => entry.href)).toEqual(['/slow'])
  navigation.dispose()
})

it('owner activation reports pushes to blockers and survives synchronous observer disposal', async () => {
  const navigation = createNavigation<{ href: string }>({
    initialContainer: 'main',
    containers: { main: { initialHref: '/' } },
    prepare: async (entry) => ({ value: { href: entry.href } }),
    getNavigator: (entry) =>
      entry.href === '/'
        ? {
            initialContainer: 'child',
            containers: { child: { initialHref: '/child' } },
          }
        : undefined,
  })
  await navigation.initialize()
  const child = navigation.getActivePath()[0]!.navigator!
  const blocked = vi.fn((_change: NavigationChange<{ href: string }>) => true)
  const unbind = child.block(child.getActiveEntry()!.key, blocked)
  expect(
    await child.activate(() => ({
      request: { href: '/next', behavior: 'replace' },
    })),
  ).toBe(false)
  expect(blocked.mock.calls.length).toBe(1)
  expect(blocked.mock.calls[0]![0].historyAction).toBe('REPLACE')
  unbind()
  const changes: NavigationChange<{ href: string }>[] = []
  child.onChange((change) => changes.push(change))
  await child.activate(() => ({ request: { href: '/pushed' } }))
  expect(changes.at(-1)!.historyAction).toBe('PUSH')
  child.subscribe(() => navigation.dispose())
  await expect(
    child.activate(() => ({ request: { href: '/next' } })),
  ).resolves.toBe(true)
})
