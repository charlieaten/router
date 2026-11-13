import * as React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useBlocker } from '../src/useBlocker.native'
import { createRootRoute, createRoute } from '../src/route'
import { Outlet } from '../src/Match'
import { Router, createRouter } from '../src/router.native'
import { RouterProvider } from '../src/RouterProvider.native'
import { getNativeNavigation } from '../src/native/controller'
import { useParams } from '../src/useParams'
import { useNavigate } from '../src/useNavigate.native'

afterEach(cleanup)

it('retains two visits to the same typed route with independent local state and params', async () => {
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <div>Home</div>,
  })
  const venue = createRoute({
    getParentRoute: () => root,
    path: 'venues/$id',
    component: Venue,
  })
  function Venue() {
    const { id } = useParams({ strict: false })
    const [note, setNote] = React.useState('')
    const navigate = useNavigate()
    return (
      <div>
        <p>Venue {id}</p>
        <input
          aria-label={`Note ${id}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <button
          onClick={() =>
            void navigate({ to: '/venues/$id', params: { id: '456' } } as never)
          }
        >
          Open 456
        </button>
      </div>
    )
  }
  const router = createRouter({ routeTree: root.addChildren([home, venue]) })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  await act(() =>
    router.navigate({ to: '/venues/$id', params: { id: '123' } } as never),
  )
  fireEvent.change(screen.getByLabelText('Note 123'), {
    target: { value: 'Keep this draft' },
  })
  fireEvent.click(screen.getByText('Open 456'))
  await screen.findByText('Venue 456')
  await act(() => navigation.back())
  await waitFor(() =>
    expect(screen.getByLabelText('Note 123').value).toBe('Keep this draft'),
  )
  expect(navigation.getActiveEntry()?.href).toBe('/venues/123')
})

it('runs ordinary TanStack loaders and validates search for each native entry', async () => {
  const root = createRootRoute()
  const home = createRoute({ getParentRoute: () => root, path: '/' })
  const venue = createRoute({
    getParentRoute: () => root,
    path: 'venues/$id',
    validateSearch: (search: Record<string, unknown>) => ({
      section: search.section === 'reviews' ? 'reviews' : 'menu',
    }),
    loaderDeps: ({ search }) => ({ section: search.section }),
    loader: ({ params, deps }) => `${params.id}:${deps.section}`,
  })
  const router = createRouter({ routeTree: root.addChildren([home, venue]) })
  const navigation = getNativeNavigation(router)
  await navigation.initialize()
  await router.navigate({
    to: '/venues/$id',
    params: { id: '123' },
    search: { section: 'reviews' },
  } as never)
  const entry = navigation.getActiveEntry()!
  expect(entry.value.state.matches.at(-1)?.loaderData).toBe('123:reviews')
  expect(entry.href).toBe('/venues/123?section=reviews')
})

it('supports the public Router constructor and per-entry InnerWrap context', async () => {
  const Context = React.createContext('missing')
  const root = createRootRoute({
    component: function Wrapped() {
      return <div>{React.useContext(Context)}</div>
    },
  })
  const router = new Router({
    routeTree: root,
    InnerWrap: ({ children }) => (
      <Context.Provider value="provided">{children}</Context.Provider>
    ),
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('provided')
})

it('keeps removal blockers alive for a draft beneath two newer visits', async () => {
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <div>Home</div>,
  })
  const draft = createRoute({
    getParentRoute: () => root,
    path: '/draft',
    component: Draft,
  })
  function Draft() {
    useBlocker({ shouldBlockFn: () => true })
    return <div>Draft</div>
  }
  const other = createRoute({
    getParentRoute: () => root,
    path: '/other',
    component: () => <div>Other</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, draft, other]),
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  await act(() => router.navigate({ to: '/draft' } as never))
  await screen.findByText('Draft')
  await act(() => router.navigate({ to: '/other' } as never))
  await act(() => router.navigate({ to: '/other' } as never))
  expect(await navigation.back({ count: 3 })).toBe(false)
  expect(navigation.getActiveEntry()?.href).toBe('/other')
})

it('does not publish a blocker prompt after its async predicate was superseded', async () => {
  let release!: (value: boolean) => void
  let pending = false
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <div>Home</div>,
  })
  const draft = createRoute({
    getParentRoute: () => root,
    path: '/draft',
    component: Draft,
  })
  function Draft() {
    const blocker = useBlocker({
      withResolver: true,
      shouldBlockFn: () =>
        new Promise<boolean>((resolve) => {
          pending = true
          release = resolve
        }),
    })
    return <div>Prompt: {blocker.status}</div>
  }
  const router = createRouter({ routeTree: root.addChildren([home, draft]) })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  await act(() => router.navigate({ to: '/draft' } as never))
  let back!: Promise<boolean>
  await act(async () => {
    back = navigation.back()
    await Promise.resolve()
  })
  await waitFor(() => expect(pending).toBe(true))
  await act(() => navigation.navigate({ href: '/draft' }))
  await act(async () => {
    release(true)
    await back
  })
  expect(screen.queryByText('Prompt: blocked')).toBeNull()
})
