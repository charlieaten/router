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
