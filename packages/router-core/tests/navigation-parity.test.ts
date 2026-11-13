import { expect, it, vi } from 'vitest'
import { createNavigation } from '../src/navigation'

function create() {
  return createNavigation<string>({
    initialContainer: 'app',
    backBehavior: 'history',
    containers: {
      app: { kind: 'tabs', initialChild: 'feed' },
      feed: { parent: 'app', initialHref: '/' },
      account: { parent: 'app', kind: 'tabs', initialChild: 'profile' },
      profile: { parent: 'account', initialHref: '/profile' },
      settings: { parent: 'account', initialHref: '/settings' },
      first: { initialHref: '/first', overlay: true },
      second: { initialHref: '/second', overlay: true },
    },
    prepare: async (entry) => ({ value: entry.href }),
  })
}

it('targets a nested stack and focuses its complete ancestor path', async () => {
  const nav = create()
  await nav.initialize()
  expect(nav.getActiveEntry()?.href).toBe('/')
  await nav.navigate({ target: 'settings', href: '/settings/security' })
  expect(nav.getSnapshot().selected).toBe('app')
  expect(nav.getSnapshot().selectedChildren.app).toBe('account')
  expect(nav.getSnapshot().selectedChildren.account).toBe('settings')
  expect(nav.getActiveEntry()?.href).toBe('/settings/security')
  await nav.select('feed')
  expect(nav.getActiveEntry()?.href).toBe('/')
  await nav.select('account')
  expect(nav.getActiveEntry()?.href).toBe('/settings/security')
})

it('presents overlays in navigation order and dismisses the last one first', async () => {
  const nav = create()
  await nav.initialize()
  await nav.navigate({ target: 'second', href: '/second' })
  await nav.navigate({ target: 'first', href: '/first' })
  expect(nav.getActiveEntry()?.container).toBe('first')
  await nav.back()
  expect(nav.getActiveEntry()?.container).toBe('second')
  const serialized = nav.serialize()
  const restored = create()
  await restored.restore(serialized)
  expect(restored.getActiveEntry()?.container).toBe('second')
  await restored.back()
  expect(restored.getActiveEntry()?.href).toBe('/')
})

it('preserves navigation state for independent visits and restoration', async () => {
  const nav = create()
  await nav.initialize()
  await nav.navigate({ href: '/venue/1', state: { source: 'feed' } })
  const first = nav.getActiveEntry()!
  await nav.navigate({ href: '/venue/1', state: { source: 'notification' } })
  expect(nav.getActiveEntry()?.state).toEqual({ source: 'notification' })
  await nav.back()
  expect(nav.getActiveEntry()).toBe(first)
  const restored = create()
  await restored.restore(nav.serialize())
  expect(restored.getActiveEntry()?.state).toEqual({ source: 'feed' })
})

it('pops to a visit key and falls back explicitly for missing destinations', async () => {
  const nav = create()
  await nav.initialize()
  await nav.navigate({ href: '/venue/1' })
  const first = nav.getActiveEntry()!
  await nav.navigate({ href: '/venue/2' })
  await nav.navigate({ href: '/venue/1' })
  expect(await nav.popTo({ key: first.key })).toBe(true)
  expect(nav.getActiveEntry()).toBe(first)
  expect(await nav.popTo({ href: '/missing', fallback: 'none' })).toBe(false)
  expect(await nav.popTo({ href: '/missing', fallback: 'replace' })).toBe(true)
  expect(nav.getActiveEntry()?.href).toBe('/missing')
  await nav.popToTop()
  expect(nav.getActiveEntry()?.href).toBe('/')
})

it('bubbles back from a nested stack root to the last selected sibling', async () => {
  const nav = create()
  await nav.initialize()
  await nav.select('settings')
  expect(nav.canGoBack()).toBe(true)
  await nav.back()
  expect(nav.getActiveEntry()?.href).toBe('/')
  expect(nav.canGoBack()).toBe(false)
})

it('publishes and disposes despite a failing subscriber', async () => {
  const error = vi.fn()
  const dispose = vi.fn()
  const nav = createNavigation({
    initialContainer: 'main',
    containers: { main: { initialHref: '/' } },
    prepare: async (entry) => ({ value: entry.href }),
    dispose,
    onError: error,
  })
  await nav.initialize()
  nav.subscribe(() => {
    throw new Error('observer')
  })
  await nav.navigate({ href: '/next', behavior: 'replace' })
  expect(nav.getActiveEntry()?.href).toBe('/next')
  expect(dispose).toHaveBeenCalledTimes(1)
  expect(error).toHaveBeenCalledTimes(1)
})

it('reopens a dismissed nested overlay at its initial child', async () => {
  const nav = createNavigation({
    initialContainer: 'main',
    containers: {
      main: { initialHref: '/' },
      editor: { overlay: true, kind: 'tabs', initialChild: 'details' },
      details: { parent: 'editor', initialHref: '/details' },
      preview: { parent: 'editor', initialHref: '/preview' },
    },
    prepare: async (entry) => ({ value: entry.href }),
  })
  await nav.initialize()
  await nav.navigate({ target: 'preview', href: '/preview' })
  await nav.back()
  await nav.navigate({ target: 'editor', href: '/details' })
  expect(nav.getActiveEntry()?.container).toBe('details')
  expect(nav.getSnapshot().childHistory.editor).toEqual(['details'])
})

it('restores omitted child histories using the restored selections', async () => {
  const nav = create()
  await nav.initialize()
  const snapshot = JSON.parse(nav.serialize())
  snapshot.childHistory = {}
  const restored = create()
  await restored.restore(JSON.stringify(snapshot))
  await restored.select('settings')
  expect(restored.getActiveEntry()?.href).toBe('/settings')
})

it('honors a nested tab navigator back behavior before bubbling to its parent', async () => {
  const nav = createNavigation({
    initialContainer: 'app',
    backBehavior: 'none',
    containers: {
      app: { kind: 'tabs', initialChild: 'feed', backBehavior: 'history' },
      feed: { parent: 'app', initialHref: '/' },
      saved: { parent: 'app', initialHref: '/saved' },
    },
    prepare: async (entry) => ({ value: entry.href }),
  })
  await nav.initialize()
  await nav.select('saved')
  expect(await nav.back()).toBe(true)
  expect(nav.getActiveEntry()?.href).toBe('/')
  expect(nav.canGoBack()).toBe(false)
})

it('does not reinterpret a nested none back behavior as root leaf history', async () => {
  const nav = createNavigation({
    initialContainer: 'app',
    backBehavior: 'history',
    containers: {
      app: { kind: 'tabs', initialChild: 'feed', backBehavior: 'none' },
      feed: { parent: 'app', initialHref: '/' },
      saved: { parent: 'app', initialHref: '/saved' },
    },
    prepare: async (entry) => ({ value: entry.href }),
  })
  await nav.initialize()
  await nav.select('saved')
  expect(nav.canGoBack()).toBe(false)
})

it('restores flat legacy tab back history without childHistory metadata', async () => {
  const options = {
    initialContainer: 'feed',
    backBehavior: 'history' as const,
    containers: {
      feed: { initialHref: '/' },
      search: { initialHref: '/search' },
    },
    prepare: async (entry: { href: string }) => ({ value: entry.href }),
  }
  const nav = createNavigation(options)
  await nav.initialize()
  await nav.select('search')
  const data = JSON.parse(nav.serialize())
  data.version = 2
  delete data.childHistory
  const restored = createNavigation(options)
  await restored.restore(JSON.stringify(data))
  expect(await restored.back()).toBe(true)
  expect(restored.getActiveEntry()?.href).toBe('/')
})
