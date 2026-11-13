import * as React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useBlocker } from '../src/useBlocker.native'
import {
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
} from '../src/route'
import { Outlet } from '../src/Match'
import { Router, createRouter } from '../src/router.native'
import { RouterProvider } from '../src/RouterProvider.native'
import { getNativeNavigation } from '../src/native/controller'
import { useParams } from '../src/useParams'
import { useNavigate } from '../src/useNavigate.native'
import { Platform, modalInstances } from './native-host'

afterEach(() => {
  cleanup()
  Platform.OS = 'ios'
})

it('releases closed Android modal hosts without waiting for an iOS-only dismissal event', async () => {
  Platform.OS = 'android'
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Home</p>,
  })
  const modal = createRoute({
    getParentRoute: () => root,
    path: '/modal',
    staticData: { native: { presentation: 'modal' } },
    component: () => <p>Modal</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, modal]),
    native: {
      initialContainer: 'main',
      containers: {
        main: { initialHref: '/' },
        modal: { initialHref: '/modal', overlay: true },
      },
    },
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  await act(() => navigation.navigate({ href: '/modal', target: 'modal' }))
  await screen.findByText('Modal')
  expect(modalInstances.size).toBe(1)
  await act(() => navigation.back())
  await waitFor(() => expect(modalInstances.size).toBe(0))
})

it('uses provider context overrides for native route loading', async () => {
  const root = createRootRouteWithContext<{ actor: string }>()({
    component: Outlet,
  })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    loader: ({ context }) => context.actor,
    component: () => <p>{home.useLoaderData()}</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home]),
    context: { actor: 'initial' },
  })
  render(<RouterProvider router={router} context={{ actor: 'provider' }} />)
  await screen.findByText('provider')
})

it('asks a dirty sheet blocker before handling a prevented native dismissal', async () => {
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Home</p>,
  })
  function Draft() {
    const blocker = useBlocker({
      shouldBlockFn: () => true,
      withResolver: true,
    })
    return <p>{blocker.status === 'blocked' ? 'Keep draft?' : 'Draft'}</p>
  }
  const draft = createRoute({
    getParentRoute: () => root,
    path: '/draft',
    component: Draft,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, draft]),
    native: {
      initialContainer: 'main',
      containers: {
        main: { initialHref: '/' },
        composer: { initialHref: '/draft', overlay: true },
      },
    },
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  await act(() => navigation.navigate({ href: '/draft', target: 'composer' }))
  await screen.findByText('Draft')
  fireEvent.click(screen.getByTestId('native-sheet-close'))
  await screen.findByText('Keep draft?')
  expect(navigation.getActiveEntry()?.href).toBe('/draft')
})

it('runs lifecycle callbacks only after a native visit is accepted', async () => {
  const enter = vi.fn()
  const leave = vi.fn()
  const root = createRootRoute()
  const home = createRoute({ getParentRoute: () => root, path: '/' })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/detail',
    onEnter: enter,
    onLeave: leave,
  })
  const router = createRouter({ routeTree: root.addChildren([home, detail]) })
  const navigation = getNativeNavigation(router)
  await navigation.initialize()
  const unblock = navigation.block(navigation.getActiveEntry()!.key, () => true)
  expect(
    await navigation.navigate({ href: '/detail', behavior: 'replace' }),
  ).toBe(false)
  expect(enter).not.toHaveBeenCalled()
  expect(leave).not.toHaveBeenCalled()
  unblock()
  await navigation.navigate({ href: '/detail' })
  expect(enter).toHaveBeenCalledTimes(1)
  await navigation.back()
  expect(leave).toHaveBeenCalledTimes(1)
})

it('stops stale child lifecycle callbacks when a parent redirects during activation', async () => {
  const enterChild = vi.fn()
  const root = createRootRoute()
  const home = createRoute({ getParentRoute: () => root, path: '/' })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/redirect',
    onEnter: () => {
      void router.navigate({ to: '/settled' } as never)
    },
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: '/',
    onEnter: enterChild,
  })
  const settled = createRoute({ getParentRoute: () => root, path: '/settled' })
  const router = createRouter({
    routeTree: root.addChildren([home, parent.addChildren([child]), settled]),
  })
  const navigation = getNativeNavigation(router)
  await navigation.initialize()
  await navigation.navigate({ href: '/redirect' })
  await waitFor(() =>
    expect(navigation.getActiveEntry()?.href).toBe('/settled'),
  )
  expect(enterChild).not.toHaveBeenCalled()
})

it('acknowledges native back without asking the host to pop the same screen again', async () => {
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Home</p>,
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/detail',
    component: () => <p>Detail</p>,
  })
  const router = createRouter({ routeTree: root.addChildren([home, detail]) })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  await act(() => router.navigate({ to: '/detail' } as never))
  await screen.findByText('Detail')
  await act(async () =>
    fireEvent.click(screen.getAllByTestId('native-back').at(-1)!),
  )
  await waitFor(() => expect(navigation.getActiveEntry()?.href).toBe('/'))
  expect(screen.queryByText('Detail')).toBeNull()
})

it('refreshes retained visits even when their React Activity is hidden', async () => {
  let value = 'before'
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Home</p>,
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/$id',
    loader: () => value,
    component: () => <p>{detail.useLoaderData()}</p>,
  })
  const router = createRouter({ routeTree: root.addChildren([home, detail]) })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  await act(() =>
    router.navigate({ to: '/$id', params: { id: 'one' } } as never),
  )
  const first = navigation.getActiveEntry()!
  await act(() =>
    router.navigate({ to: '/$id', params: { id: 'two' } } as never),
  )
  await act(() =>
    router.navigate({ to: '/$id', params: { id: 'three' } } as never),
  )
  value = 'after'
  let refreshed = false
  await act(async () => {
    void router.invalidate().then(() => {
      refreshed = true
    })
  })
  await waitFor(() => expect(refreshed).toBe(true))
  expect(first.value.state.matches.at(-1)?.loaderData).toBe('after')
  await act(() => navigation.back({ count: 2 }))
  await screen.findByText('after')
})

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

it('does not echo the old tab with new provenance while the selected tab loads', async () => {
  let release!: () => void
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <div>Home</div>,
  })
  const search = createRoute({
    getParentRoute: () => root,
    path: '/search',
    loader: () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
    component: () => <div>Search content</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, search]),
    native: {
      initialContainer: 'feed',
      containers: {
        feed: { initialHref: '/' },
        search: { initialHref: '/search' },
      },
    },
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  fireEvent.click(screen.getByTestId('select-search'))
  await waitFor(() => expect(release).toBeTypeOf('function'))
  expect(screen.getByTestId('native-tabs').getAttribute('data-request')).toBe(
    'feed:0',
  )
  await act(async () => {
    release()
  })
  await screen.findByText('Search content')
  expect(screen.getByTestId('native-tabs').getAttribute('data-request')).toBe(
    'search:1',
  )
})

it('renders repeated parent visits with independent child stacks and one ancestor execution per visit', async () => {
  const parentLoader = vi.fn(() => 'shared parent data')
  const parentMount = vi.fn()
  const parentLeave = vi.fn()
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Home</p>,
  })
  function Workspace() {
    const [count, setCount] = React.useState(0)
    React.useEffect(() => {
      parentMount()
    }, [])
    return (
      <div>
        <button onClick={() => setCount((value) => value + 1)}>
          Parent count {count}
        </button>
        <Outlet />
      </div>
    )
  }
  const workspace = createRoute({
    getParentRoute: () => root,
    path: '/workspace/$id',
    component: Workspace,
    loader: parentLoader,
    onLeave: parentLeave,
    staticData: {
      native: {
        navigator: ({ params }) => ({
          initialContainer: 'feed',
          backBehavior: 'none',
          containers: {
            feed: { initialHref: `/workspace/${params.id}/feed/one` },
            search: { initialHref: `/workspace/${params.id}/search/one` },
          },
        }),
      },
    },
  })
  const feed = createRoute({
    getParentRoute: () => workspace,
    path: '/feed/$item',
    component: () => (
      <p>
        Feed {feed.useParams().item} {workspace.useLoaderData()}
      </p>
    ),
  })
  const search = createRoute({
    getParentRoute: () => workspace,
    path: '/search/$item',
    component: () => <p>Search {search.useParams().item}</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, workspace.addChildren([feed, search])]),
  })
  const nav = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  await act(() =>
    router.navigate({ to: '/workspace/$id', params: { id: 'a' } }),
  )
  await screen.findByText('Feed one shared parent data')
  const a = nav.getSnapshot().stacks.main!.at(-1)!
  fireEvent.click(screen.getByText('Parent count 0'))
  await act(() => a.navigator!.navigate({ href: '/workspace/a/feed/two' }))
  await act(() => a.navigator!.select('search'))
  await act(() => a.navigator!.navigate({ href: '/workspace/a/search/three' }))
  await act(() =>
    router.navigate({
      to: '/workspace/$id',
      params: { id: 'a' },
      target: 'main',
    }),
  )
  const b = nav.getSnapshot().stacks.main!.at(-1)!
  expect(a.key).not.toBe(b.key)
  expect(b.navigator!.getSnapshot().selected).toBe('feed')
  expect(parentLoader).toHaveBeenCalledTimes(2)
  expect(parentMount).toHaveBeenCalledTimes(2)
  await act(() => nav.back({ target: 'main' }))
  await screen.findByText('Parent count 1')
  expect(nav.getActiveEntry()?.href).toBe('/workspace/a/search/three')
  expect(parentLeave).toHaveBeenCalledTimes(1)
  await act(() => nav.back())
  expect(nav.getActiveEntry()?.href).toBe('/workspace/a/search/one')
  await act(() => a.navigator!.select('feed'))
  expect(nav.getActiveEntry()?.href).toBe('/workspace/a/feed/two')
  router.history.destroy()
})

it('mounts a componentless navigator route and keeps its accepted factory definition', async () => {
  const factory = vi.fn(() => ({
    initialContainer: 'child',
    containers: { child: { initialHref: '/parent/child' } },
  }))
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Home</p>,
  })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/parent',
    staticData: { native: { navigator: factory } },
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: '/child',
    component: () => <p>Componentless child</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, parent.addChildren([child])]),
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  await act(() => router.navigate({ to: '/parent' }))
  await screen.findByText('Componentless child')
  await act(() => router.invalidate())
  expect(factory).toHaveBeenCalledTimes(1)
  router.history.destroy()
})

it('retargets an initial child redirect outside its parent without publishing the rejected parent', async () => {
  const { redirect } = await import('@tanstack/router-core')
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Home</p>,
  })
  const login = createRoute({
    getParentRoute: () => root,
    path: '/login',
    component: () => <p>Log in</p>,
  })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/private',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          initialContainer: 'child',
          containers: { child: { initialHref: '/private/child' } },
        },
      },
    },
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: '/child',
    beforeLoad: () => {
      throw redirect({ to: '/login' })
    },
    component: () => <p>Secret child</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, login, parent.addChildren([child])]),
  })
  const nav = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Home')
  await act(() => router.navigate({ to: '/private' }))
  await screen.findByText('Log in')
  expect(
    nav.getSnapshot().stacks.main!.some((entry) => entry.href === '/private'),
  ).toBe(false)
  router.history.destroy()
})

it('shows a parent loader error without preparing its child navigator', async () => {
  const factory = vi.fn(() => ({
    initialContainer: 'child',
    containers: { child: { initialHref: '/parent/child' } },
  }))
  const root = createRootRoute({ component: Outlet })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/parent',
    loader: () => {
      throw new Error('unavailable')
    },
    errorComponent: () => <p>Parent unavailable</p>,
    staticData: { native: { navigator: factory } },
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: '/child',
    component: () => <p>Child</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([child])]),
    native: {
      initialContainer: 'main',
      containers: { main: { initialHref: '/parent' } },
    },
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('Parent unavailable')
  expect(factory).not.toHaveBeenCalled()
  router.history.destroy()
})

it('renders a borrowed ancestor not-found fallback in the child viewport', async () => {
  const { notFound } = await import('@tanstack/router-core')
  const root = createRootRoute({ component: Outlet })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/parent',
    component: () => (
      <div>
        <p>Parent shell</p>
        <Outlet />
      </div>
    ),
    notFoundComponent: () => <p>Missing child</p>,
    staticData: {
      native: {
        navigator: {
          initialContainer: 'child',
          containers: { child: { initialHref: '/parent/child' } },
        },
      },
    },
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: '/child',
    loader: () => {
      throw notFound()
    },
    component: () => <p>Child</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([child])]),
    native: {
      initialContainer: 'main',
      containers: { main: { initialHref: '/parent' } },
    },
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('Parent shell')
  await screen.findByText('Missing child')
  router.history.destroy()
})

it('tracks retained child focus across ancestor tab changes and resolves a named owning navigator', async () => {
  const { useIsFocused, useNavigation } = await import('../src/native/context')
  function Child() {
    const focused = useIsFocused()
    const navigation = useNavigation()
    return (
      <p>
        {focused ? 'Child focused' : 'Child blurred'}{' '}
        {navigation.getParent('main') ? 'with owner' : 'missing owner'}
      </p>
    )
  }
  const root = createRootRoute({ component: Outlet })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/parent',
    component: Outlet,
    staticData: {
      native: {
        keepActive: true,
        navigator: {
          initialContainer: 'feed',
          containers: { feed: { initialHref: '/parent/child' } },
        },
      },
    },
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: '/child',
    component: Child,
    staticData: { native: { keepActive: true } },
  })
  const other = createRoute({
    getParentRoute: () => root,
    path: '/other',
    component: () => <p>Other tab</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([child]), other]),
    native: {
      initialContainer: 'main',
      containers: {
        main: { initialHref: '/parent' },
        other: { initialHref: '/other' },
      },
    },
  })
  const nav = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Child focused with owner')
  await act(() => nav.select('other'))
  await screen.findByText('Child blurred with owner')
  await act(() => nav.select('main'))
  await screen.findByText('Child focused with owner')
  router.history.destroy()
})
