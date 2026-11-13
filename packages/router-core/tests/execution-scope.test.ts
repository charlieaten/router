import { createMemoryHistory } from '@tanstack/history'
import { expect, it, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import {
  createRouterDataCache,
  createRouterExecutionScope,
} from '../src/execution-scope'
import { createTestRouter } from './routerTestUtils'

it('aborts an active loader and settles a disposed execution scope', async () => {
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const aborted = vi.fn()
  const root = new BaseRootRoute({})
  const slow = new BaseRoute({
    getParentRoute: () => root,
    path: '/slow',
    loader: ({ abortController }) =>
      new Promise<void>((resolve) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            aborted()
            resolve()
          },
          { once: true },
        )
        started()
      }),
  })
  const scope = createRouterExecutionScope(() =>
    createTestRouter({
      routeTree: root.addChildren([slow]),
      history: createMemoryHistory({ initialEntries: ['/slow'] }),
      isServer: false,
    }),
  )
  const loaded = scope.load()
  await ready
  scope.dispose()
  await loaded
  expect(aborted).toHaveBeenCalledTimes(1)
  expect(scope.isDisposed).toBe(true)
  await expect(scope.load()).rejects.toThrow('disposed')
})

it('runs leave callbacks exactly once when a committed scope is disposed', async () => {
  const leave = vi.fn()
  const root = new BaseRootRoute({ onLeave: leave })
  const scope = createRouterExecutionScope(() =>
    createTestRouter({
      routeTree: root,
      isServer: false,
      history: createMemoryHistory(),
    }),
  )
  await scope.load()
  scope.dispose()
  scope.dispose()
  expect(leave).toHaveBeenCalledTimes(1)
})

it('cancels preparation through its public signal without cancelling another scope', async () => {
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const abort = new AbortController()
  const root = new BaseRootRoute({})
  const page = new BaseRoute({
    getParentRoute: () => root,
    path: '/$id',
    loader: ({ params, abortController }) =>
      params.id === 'slow'
        ? new Promise<string>((resolve) => {
            started()
            abortController.signal.addEventListener(
              'abort',
              () => resolve('cancelled'),
              { once: true },
            )
          })
        : params.id,
  })
  const tree = root.addChildren([page])
  const make = (id: string) =>
    createRouterExecutionScope(() =>
      createTestRouter({
        routeTree: tree,
        isServer: false,
        history: createMemoryHistory({ initialEntries: [`/${id}`] }),
      }),
    )
  const slow = make('slow')
  const fast = make('fast')
  const pending = slow.load(abort.signal)
  await ready
  await fast.load()
  abort.abort()
  await pending
  expect(slow.isDisposed).toBe(true)
  expect(fast.router.state.matches.at(-1)?.loaderData).toBe('fast')
  fast.dispose()
})

it('defers callbacks until presentation commits and transfers reuse lifecycle ownership', async () => {
  const enter = vi.fn()
  const stay = vi.fn()
  const leave = vi.fn()
  const root = new BaseRootRoute({
    onEnter: enter,
    onStay: stay,
    onLeave: leave,
  })
  const make = () =>
    createRouterExecutionScope(
      () =>
        createTestRouter({
          routeTree: root,
          isServer: false,
          history: createMemoryHistory(),
        }),
      { deferLifecycle: true },
    )
  const first = make()
  await first.load()
  expect(enter).not.toHaveBeenCalled()
  first.activate()
  expect(enter).toHaveBeenCalledTimes(1)
  const second = make()
  await second.load()
  second.activate(first.router)
  first.dispose()
  expect(stay).toHaveBeenCalledTimes(1)
  expect(leave).not.toHaveBeenCalled()
  second.dispose()
  expect(leave).toHaveBeenCalledTimes(1)
})

it('reuses settled data while rerunning beforeLoad with the new scope context', async () => {
  const loader = vi.fn(() => ({ name: 'Venue' }))
  const beforeLoad = vi.fn(({ context }: { context: { visit: string } }) => ({
    visit: context.visit,
  }))
  const root = new BaseRootRoute<{ visit: string }>({})
  const page = new BaseRoute({
    getParentRoute: () => root,
    path: '/',
    beforeLoad,
    context: ({ context, abortController }) => ({
      inheritedVisit: context.visit,
      signal: abortController.signal,
    }),
    loader,
    staleTime: Infinity,
  })
  const routeTree = root.addChildren([page])
  const make = (visit: string) =>
    createRouterExecutionScope(() =>
      createTestRouter({
        routeTree,
        context: { visit },
        isServer: false,
        history: createMemoryHistory(),
      }),
    )
  const cache = createRouterDataCache()
  const first = make('first')
  await first.load()
  cache.publish(first.router)
  first.dispose()
  const second = make('second')
  cache.hydrate(second.router)
  await second.load()
  expect(loader).toHaveBeenCalledTimes(1)
  expect(beforeLoad).toHaveBeenCalledTimes(2)
  expect(second.router.state.matches.at(-1)?.context.visit).toBe('second')
  expect(second.router.state.matches.at(-1)?.context.inheritedVisit).toBe(
    'second',
  )
  expect(second.router.state.matches.at(-1)?.context.signal.aborted).toBe(false)
  expect(second.router.state.matches.at(-1)?.loaderData).toEqual({
    name: 'Venue',
  })
  second.dispose()
})

it('stops activation callbacks when an earlier callback disposes the scope', async () => {
  const enterChild = vi.fn()
  let dispose!: () => void
  const root = new BaseRootRoute({ onEnter: () => dispose() })
  const child = new BaseRoute({
    getParentRoute: () => root,
    path: '/',
    onEnter: enterChild,
  })
  const scope = createRouterExecutionScope(
    () =>
      createTestRouter({
        routeTree: root.addChildren([child]),
        isServer: false,
        history: createMemoryHistory(),
      }),
    { deferLifecycle: true },
  )
  dispose = scope.dispose
  await scope.load()
  scope.activate()
  expect(scope.isDisposed).toBe(true)
  expect(enterChild).not.toHaveBeenCalled()
})
