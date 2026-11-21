import { expect, it, vi } from 'vitest'
import { createRootRoute } from '../src/route'
import { createRouter } from '../src/router.native'
import { getNativeNavigation } from '../src/native/controller'

it('starts fresh when both reading and removing persisted state fail', async () => {
  const onError = vi.fn()
  const router = createRouter({
    routeTree: createRootRoute(),
    native: {
      initialContainer: 'main',
      containers: { main: { initialHref: '/' } },
      persistence: {
        key: 'navigation',
        storage: {
          getItem: async () => {
            throw new Error('Storage unavailable')
          },
          setItem: async () => {},
          removeItem: async () => {
            throw new Error('Cleanup unavailable')
          },
        },
        onError,
      },
    },
  })
  const navigation = getNativeNavigation(router)
  await expect(navigation.initialize()).resolves.toBe(true)
  expect(navigation.getActiveEntry()?.href).toBe('/')
  expect(onError).toHaveBeenCalledTimes(2)
})

it('forwards inactive branch initialization after restoring persisted navigation', async () => {
  const { createRoute } = await import('../src/route')
  const root = createRootRoute()
  const home = createRoute({ getParentRoute: () => root, path: '/' })
  const other = createRoute({ getParentRoute: () => root, path: '/other' })
  const getItem = vi.fn(async () => null)
  const router = createRouter({
    routeTree: root.addChildren([home, other]),
    native: {
      rootKind: 'tabs',
      initialContainer: 'home',
      containers: {
        home: { initialHref: '/' },
        other: { initialHref: '/other' },
      },
      persistence: {
        key: 'navigation',
        storage: { getItem, setItem: async () => {} },
      },
    },
  })
  const navigation = getNativeNavigation(router)
  await navigation.initialize()
  const first = navigation.getActiveEntry()
  await navigation.initialize('other')
  expect(navigation.getSnapshot().stacks.other).toHaveLength(1)
  expect(navigation.getActiveEntry()).toBe(first)
  expect(getItem).toHaveBeenCalledTimes(1)
  router.history.destroy()
})
