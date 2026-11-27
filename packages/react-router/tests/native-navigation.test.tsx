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
import {
  Outlet,
  Router,
  RouterProvider,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useBlocker,
  useNavigate,
  useNavigation,
  useParams,
} from '../dist/native/esm/index.native.js'
import { getNativeNavigation } from '../dist/native/esm/native/controller.js'
import { stack } from '../dist/native/esm/stack.native.js'
import { Platform, modalInstances } from './native-host'
import type { NativeScreenOptions } from '../dist/native/esm/index.native.js'

afterEach(() => {
  cleanup()
  Platform.OS = 'ios'
})

it('renders Android stack header configs after the screen content', async () => {
  Platform.OS = 'android'
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Stack home</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home]),
    native: {
      rootKind: 'stack',
      initialContainer: 'main',
      containers: { main: { kind: 'stack', initialHref: '/' } },
    },
  })
  const { container } = render(<RouterProvider router={router} />)
  await screen.findByText('Stack home')

  const headers = container.querySelectorAll('header')
  expect(headers).toHaveLength(2)
  for (const header of headers) {
    expect(header.parentElement?.lastElementChild).toBe(header)
  }
  router.history.destroy()
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

it.each([
  ['ios', 'modal', 'native-page-sheet'],
  ['android', 'pageSheet', 'native-page-sheet'],
  ['ios', 'containedModalReplacingContent', 'native-contained-replacing'],
] as const)(
  'presents %s %s with the matching Screens host',
  async (platform, presentation, host) => {
    Platform.OS = platform
    const root = createRootRoute({ component: Outlet })
    const home = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => <p>Home</p>,
    })
    const overlay = createRoute({
      getParentRoute: () => root,
      path: '/overlay',
      staticData: { native: { presentation } satisfies NativeScreenOptions },
      component: () => <p>Overlay content</p>,
    })
    const router = createRouter({
      routeTree: root.addChildren([home, overlay]),
      native: {
        ...stack({
          initialRoute: '/',
          stackHost: { colorScheme: 'dark', direction: 'rtl' },
        }),
        containers: {
          main: { initialHref: '/', kind: 'stack' },
          overlay: { initialHref: '/overlay', overlay: true },
        },
      },
    })
    const navigation = getNativeNavigation(router)
    render(<RouterProvider router={router} />)
    await screen.findByText('Home')
    expect(
      screen.getByTestId('native-stack').getAttribute('data-color-scheme'),
    ).toBe('dark')
    expect(screen.getByTestId('native-stack').getAttribute('dir')).toBe('rtl')

    await act(() =>
      navigation.navigate({ href: '/overlay', target: 'overlay' }),
    )
    expect(screen.getByTestId(host).textContent).toContain('Overlay content')
    expect(modalInstances.size).toBe(0)
    if (host === 'native-page-sheet') {
      await act(async () =>
        fireEvent.click(screen.getByText('Dismiss native sheet')),
      )
    } else {
      await act(() => navigation.back())
      fireEvent.click(screen.getByText('Finish contained dismissal'))
    }
    await waitFor(() => expect(screen.queryByTestId(host)).toBeNull())
    expect(navigation.getActiveEntry()?.href).toBe('/')
  },
)

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

it('renders direct routes without a navigator and keeps Back available', async () => {
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
  expect(screen.queryByTestId('native-stack')).toBeNull()
  expect(screen.queryByTestId('native-tabs')).toBeNull()
  await act(() => navigation.back())
  await screen.findByText('Home')
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
  const router = createRouter({
    routeTree: root.addChildren([home, detail]),
    native: stack({ initialRoute: '/' }),
  })
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
  const { useIsFocused, useNavigation } =
    await import('../dist/native/esm/index.native.js')
  function Child() {
    const focused = useIsFocused()
    const navigation = useNavigation()
    expect(navigation.getParent()?.getState().stacks.feed).toBeDefined()
    expect(
      navigation.getParent()?.getParent()?.getState().stacks.main,
    ).toBeDefined()
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

it('uses a route-owned tabs host independently of the owning root stack kind', async () => {
  const root = createRootRoute({ component: Outlet })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/parent',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          initialContainer: 'feed',
          containers: {
            feed: { initialHref: '/parent/feed' },
            search: { initialHref: '/parent/search' },
          },
        },
      },
    },
  })
  const feed = createRoute({
    getParentRoute: () => parent,
    path: '/feed',
    component: () => <p>Nested feed</p>,
  })
  const search = createRoute({
    getParentRoute: () => parent,
    path: '/search',
    component: () => <p>Nested search</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([feed, search])]),
    native: {
      rootKind: 'stack',
      initialContainer: 'main',
      containers: { main: { initialHref: '/parent' } },
    },
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('Nested feed')
  expect(screen.getAllByTestId('native-tabs')).toHaveLength(1)
  router.history.destroy()
})

it('retargets a child navigation when any borrowed ancestor dependency changes', async () => {
  const rootLoader = vi.fn(
    ({ deps }: { deps: { tenant: string } }) => deps.tenant,
  )
  const root = createRootRoute({
    component: Outlet,
    validateSearch: (search) => ({ tenant: String(search.tenant ?? 'one') }),
    loaderDeps: ({ search }) => ({ tenant: search.tenant }),
    loader: rootLoader,
  })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/parent',
    component: Outlet,
    staticData: {
      native: {
        navigator: (_match, location) => ({
          initialContainer: 'child',
          containers: {
            child: { initialHref: `/parent/child${location.searchStr}` },
          },
        }),
      },
    },
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: '/child',
    component: () => <p>Tenant {root.useLoaderData()}</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([child])]),
    native: {
      initialContainer: 'main',
      containers: { main: { initialHref: '/parent?tenant=one' } },
    },
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('Tenant one')
  await act(() =>
    router.navigate({ to: '/parent/child', search: { tenant: 'two' } }),
  )
  await screen.findByText('Tenant two')
  expect(rootLoader).toHaveBeenCalledTimes(2)
  router.history.destroy()
})

it('reports Back availability for the owning visit rather than a deeper child navigator', async () => {
  const { useCanGoBack } = await import('../dist/native/esm/index.native.js')
  const root = createRootRoute({ component: Outlet })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/parent',
    component: function BackParent() {
      return (
        <div>
          <p>Parent back {String(useCanGoBack())}</p>
          <Outlet />
        </div>
      )
    },
    staticData: {
      native: {
        navigator: {
          initialContainer: 'child',
          containers: { child: { initialHref: '/parent/1' } },
        },
      },
    },
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: '/$page',
    component: function BackChild() {
      return <p>Child back {String(useCanGoBack())}</p>
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([child])]),
    native: {
      initialContainer: 'main',
      containers: { main: { initialHref: '/parent' } },
    },
  })
  const nav = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Parent back false')
  const nested = nav.getSnapshot().stacks.main![0]!.navigator!
  await act(() => nested.navigate({ href: '/parent/2' }))
  await screen.findAllByText('Child back true')
  await screen.findByText('Parent back false')
  router.history.destroy()
})

it('hosts a standard navigator with cancellable events and visit-owned child stacks', async () => {
  const { createStandardNavigator } = await import('standard-navigation')
  const { integrateStandardNavigator } =
    await import('../dist/native/esm/index.native.js')
  const events: Array<string> = []
  let lastEmitter: {
    emit: (input: {
      type: 'tabPress'
      target: string
      canPreventDefault: true
      data: { isAlreadyFocused: boolean }
    }) => unknown
  }
  const standard = createStandardNavigator<
    { title?: string },
    {
      tabPress: { data: { isAlreadyFocused: boolean }; canPreventDefault: true }
    }
  >(({ state, descriptors, actions, emitter }) => {
    lastEmitter = emitter
    return (
      <div>
        <p>Standard selected {state.routes[state.index]?.name}</p>
        {state.routes.map((route, index) => (
          <button
            key={route.key}
            onClick={() => {
              const event = emitter.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
                data: { isAlreadyFocused: state.index === index },
              })
              if (!event.defaultPrevented) {
                actions.navigate(route.name, route.params)
              }
            }}
          >
            Select {descriptors[route.key]!.options.title}
          </button>
        ))}
        {state.routes.map((route) => (
          <React.Fragment key={route.key}>
            {descriptors[route.key]!.render()}
          </React.Fragment>
        ))}
        <button onClick={() => actions.back()}>Standard back</button>
      </div>
    )
  })
  const renderer = integrateStandardNavigator(standard, {
    screenOptions: ({ route }) => ({ title: route.name }),
    listeners: {
      tabPress: (event) => {
        events.push(event.target!)
        if (event.target === 'post') {
          event.preventDefault()
        }
      },
    },
  })
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Home standard</p>,
  })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/standard',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          initialContainer: 'feed',
          renderContainer: renderer,
          containers: {
            feed: { initialHref: '/standard/feed/1' },
            saved: { initialHref: '/standard/saved/1' },
            post: { initialHref: '/standard/post/1' },
          },
        },
      },
    },
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: '/$section/$page',
    component: function StandardDraft() {
      const { section, page } = child.useParams()
      const [draft, setDraft] = React.useState('')
      return (
        <div>
          <p>
            {section} page {page}
          </p>
          <input
            aria-label="Standard draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
      )
    },
  })
  const router = createRouter({
    native: stack({ initialRoute: '/' }),
    routeTree: root.addChildren([home, parent.addChildren([child])]),
  })
  const nav = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Home standard')
  await act(() => router.navigate({ to: '/standard' }))
  await screen.findByText('Standard selected feed')
  fireEvent.click(screen.getByText('Select post'))
  expect(events).toEqual(['post'])
  expect(screen.getByText('Standard selected feed')).toBeTruthy()
  fireEvent.click(screen.getByText('Select saved'))
  await screen.findByText('Standard selected saved')
  const a = nav.getSnapshot().stacks.main!.at(-1)!
  await act(() => a.navigator!.navigate({ href: '/standard/saved/2' }))
  fireEvent.click(screen.getByText('Select saved'))
  expect(a.navigator!.getActiveEntry()?.href).toBe('/standard/saved/2')
  fireEvent.change(screen.getAllByLabelText('Standard draft').at(-1)!, {
    target: { value: 'A draft' },
  })
  await act(() => router.navigate({ to: '/standard', target: 'main' }))
  const b = nav.getSnapshot().stacks.main!.at(-1)!
  expect(b.navigator!.getSnapshot().selected).toBe('feed')
  const staleEmitter = lastEmitter!
  const eventCount = events.length
  await act(() => nav.back({ target: 'main' }))
  staleEmitter.emit({
    type: 'tabPress',
    target: 'post',
    canPreventDefault: true,
    data: { isAlreadyFocused: false },
  })
  expect(events).toHaveLength(eventCount)
  await screen.findByText('Standard selected saved')
  expect(a.navigator!.getActiveEntry()?.href).toBe('/standard/saved/2')
  expect(screen.getAllByDisplayValue('A draft').length).toBe(1)
  fireEvent.click(screen.getByText('Standard back'))
  await waitFor(() =>
    expect(a.navigator!.getActiveEntry()?.href).toBe('/standard/saved/1'),
  )
  router.history.destroy()
})

it('projects standard stack visit keys and routes params/search through scoped transactions and blockers', async () => {
  const { createStandardNavigator } = await import('standard-navigation')
  const { integrateStandardNavigator } =
    await import('../dist/native/esm/index.native.js')
  const renderedKeys: Array<Array<string>> = []
  const standard = createStandardNavigator<
    { title: string; blocked?: boolean },
    {}
  >(({ state, descriptors, actions }) => {
    renderedKeys.push(state.routes.map((route) => route.key))
    return (
      <div>
        <button
          onClick={() =>
            actions.navigate('/item/$id', { id: 'b', filter: 'new' })
          }
        >
          Standard push
        </button>
        <button onClick={() => actions.back()}>Stack back</button>
        {state.routes.map((route) => (
          <div key={route.key}>{descriptors[route.key]!.render()}</div>
        ))}
      </div>
    )
  })
  let dirty = true
  const root = createRootRoute({ component: Outlet })
  const item = createRoute({
    getParentRoute: () => root,
    path: '/item/$id',
    validateSearch: (search: Record<string, unknown>) => ({
      filter: typeof search.filter === 'string' ? search.filter : 'initial',
    }),
    component: function Item() {
      const { id } = item.useParams()
      const { filter } = item.useSearch()
      useBlocker({ shouldBlockFn: () => dirty })
      return (
        <p>
          Item {id} {filter}
        </p>
      )
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([item]),
    native: {
      initialContainer: 'main',
      rootKind: 'stack',
      renderStack: integrateStandardNavigator(standard, {
        screenOptions: ({ item }) => ({
          title: item.title,
          blocked: item.preventDismiss,
        }),
      }),
      containers: { main: { initialHref: '/item/a' } },
    },
  })
  const nav = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Item a initial')
  fireEvent.click(screen.getByText('Standard push'))
  await screen.findByText('Item b new')
  await act(() => nav.navigate({ href: '/item/b?filter=new' }))
  const stack = nav.getSnapshot().stacks.main!
  expect(new Set(stack.map((entry) => entry.key)).size).toBe(3)
  expect(renderedKeys.at(-1)).toEqual(stack.map((entry) => entry.key))
  fireEvent.click(screen.getByText('Stack back'))
  await act(async () => {
    await Promise.resolve()
  })
  expect(nav.getSnapshot().stacks.main).toHaveLength(3)
  dirty = false
  fireEvent.click(screen.getByText('Stack back'))
  await waitFor(() => expect(nav.getSnapshot().stacks.main).toHaveLength(2))
  router.history.destroy()
})

it('keeps an outgoing sheet renderable until native dismissal completes', async () => {
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Sheet return home</p>,
  })
  const sheet = createRoute({
    getParentRoute: () => root,
    path: '/sheet',
    staticData: { native: { presentation: 'formSheet' } },
    component: () => <p>Retained outgoing sheet</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, sheet]),
    native: {
      initialContainer: 'main',
      containers: {
        main: { initialHref: '/' },
        sheet: { initialHref: '/sheet', overlay: true },
      },
    },
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Sheet return home')
  await act(() => navigation.navigate({ href: '/sheet', target: 'sheet' }))
  await screen.findByText('Retained outgoing sheet')
  await act(() => navigation.back({ target: 'sheet' }))
  fireEvent.click(await screen.findByText('Finish native sheet dismissal'))
  await screen.findByText('Sheet return home')
  expect(navigation.getSnapshot().overlays).toEqual([])
  router.history.destroy()
})

it('preloads a sibling destination from a child of a pathless navigator without crossing its execution boundary', async () => {
  const root = createRootRoute({ component: Outlet })
  const tabs = createRoute({
    getParentRoute: () => root,
    id: '_tabs',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          initialContainer: 'feed',
          containers: { feed: { initialHref: '/' } },
        },
      },
    },
  })
  const home = createRoute({
    getParentRoute: () => tabs,
    path: '/',
    component: () => <p>Pathless home</p>,
  })
  const loader = vi.fn(() => 'Preloaded sibling data')
  const sibling = createRoute({
    getParentRoute: () => root,
    path: '/sibling',
    staleTime: 60000,
    loader,
    component: () => <p>{sibling.useLoaderData()}</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([tabs.addChildren([home]), sibling]),
    native: {
      rootKind: 'stack',
      initialContainer: 'main',
      containers: { main: { initialHref: '/' } },
    },
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Pathless home')
  const result = await router.preloadRoute({ to: '/sibling' })
  expect(result?.at(-1)?.loaderData).toBe('Preloaded sibling data')
  expect(navigation.getActiveEntry()?.href).toBe('/')
  expect(navigation.getSnapshot().stacks.main).toHaveLength(1)
  await act(() => router.navigate({ to: '/sibling' }))
  await screen.findByText('Preloaded sibling data')
  expect(loader).toHaveBeenCalledTimes(1)
  router.history.destroy()
})

it('keeps the background page of a sheet active across normal pushes without keeping older pages active', async () => {
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <h1>Home page</h1>,
  })
  const review = createRoute({
    getParentRoute: () => root,
    path: '/reviews/$id',
    component: () => <h1>Review page</h1>,
  })
  function Comments() {
    const [draft, setDraft] = React.useState('')
    return (
      <label>
        Comments draft
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
    )
  }
  const comments = createRoute({
    getParentRoute: () => root,
    path: '/reviews/$id/comments',
    staticData: { native: { presentation: 'formSheet' } },
    component: Comments,
  })
  const author = createRoute({
    getParentRoute: () => root,
    path: '/users/$id',
    component: () => <p>Author page</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, review, comments, author]),
    native: {
      initialContainer: 'main',
      containers: { main: { initialHref: '/' } },
      // A custom presenter attaches sheet content to the preceding native page.
      // Both must remain renderable while the next native page is pushed.
      renderStack: ({ children }) => (
        <>
          {children.map((item) => (
            <section key={item.key}>{item.content}</section>
          ))}
        </>
      ),
    },
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Home page')
  await act(() =>
    router.navigate({ to: '/reviews/$id', params: { id: 'one' } }),
  )
  await act(() =>
    router.navigate({ to: '/reviews/$id/comments', params: { id: 'one' } }),
  )
  fireEvent.change(screen.getByLabelText('Comments draft'), {
    target: { value: 'Unsent draft' },
  })
  await act(() =>
    router.navigate({ to: '/users/$id', params: { id: 'author' } }),
  )
  expect(screen.getByRole('heading', { name: 'Review page' })).toBeTruthy()
  expect(screen.getByLabelText('Comments draft')).toHaveProperty(
    'value',
    'Unsent draft',
  )
  expect(screen.queryByRole('heading', { name: 'Home page' })).toBeNull()
  await act(() =>
    router.navigate({ to: '/users/$id', params: { id: 'another' } }),
  )
  expect(screen.queryByRole('heading', { name: 'Review page' })).toBeNull()
  await act(() => navigation.back())
  await act(() => navigation.back())
  expect(screen.getByRole('heading', { name: 'Review page' })).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'Comments draft' })).toBeTruthy()
  expect(screen.getByLabelText('Comments draft')).toHaveProperty(
    'value',
    'Unsent draft',
  )
  await act(() => navigation.back())
  expect(screen.queryByLabelText('Comments draft')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Review page' })).toBeTruthy()
  router.history.destroy()
})

it('groups consecutive sheet visits with their page and restores each independent draft', async () => {
  const root = createRootRoute({ component: Outlet })
  const review = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <h1>Review owner</h1>,
  })
  const sheet = createRoute({
    getParentRoute: () => root,
    path: '/comments/$id',
    staticData: { native: { presentation: 'formSheet' } },
    component: function Comments() {
      const { id } = useParams({ strict: false })
      const [draft, setDraft] = React.useState('')
      return (
        <label>
          Draft {id}
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
      )
    },
  })
  const author = createRoute({
    getParentRoute: () => root,
    path: '/users/$id',
    component: () => <p>Author</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([review, sheet, author]),
    native: {
      initialContainer: 'main',
      containers: { main: { initialHref: '/' } },
      renderStack: ({ children }) => (
        <>
          {children.map((item) => (
            <section key={item.key}>{item.content}</section>
          ))}
        </>
      ),
    },
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Review owner')
  await act(() =>
    router.navigate({ to: '/comments/$id', params: { id: 'one' } }),
  )
  fireEvent.change(screen.getByLabelText('Draft one'), {
    target: { value: 'First draft' },
  })
  await act(() =>
    router.navigate({ to: '/comments/$id', params: { id: 'two' } }),
  )
  fireEvent.change(screen.getByLabelText('Draft two'), {
    target: { value: 'Second draft' },
  })
  await act(() => router.navigate({ to: '/users/$id', params: { id: 'one' } }))
  expect(screen.getByRole('heading', { name: 'Review owner' })).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'Draft one' })).toHaveProperty(
    'value',
    'First draft',
  )
  expect(screen.getByRole('textbox', { name: 'Draft two' })).toHaveProperty(
    'value',
    'Second draft',
  )
  await act(() => router.navigate({ to: '/users/$id', params: { id: 'two' } }))
  expect(screen.queryByRole('textbox', { name: 'Draft one' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Review owner' })).toBeNull()
  await act(() => navigation.back({ count: 2 }))
  expect(screen.getByRole('textbox', { name: 'Draft two' })).toHaveProperty(
    'value',
    'Second draft',
  )
  await act(() => navigation.back())
  expect(screen.queryByLabelText('Draft two')).toBeNull()
  expect(screen.getByRole('textbox', { name: 'Draft one' })).toHaveProperty(
    'value',
    'First draft',
  )
  await act(() => navigation.reset('main', ['/']))
  expect(screen.queryByLabelText('Draft one')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Review owner' })).toBeTruthy()
  router.history.destroy()
})

it('renders a standalone initial sheet in a custom stack', async () => {
  const root = createRootRoute({ component: Outlet })
  const sheet = createRoute({
    getParentRoute: () => root,
    path: '/',
    staticData: { native: { presentation: 'formSheet' } },
    component: () => <h1>Initial sheet</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([sheet]),
    native: {
      initialContainer: 'main',
      containers: { main: { initialHref: '/' } },
      renderStack: ({ children }) => (
        <>
          {children.map((item) => (
            <section key={item.key}>{item.content}</section>
          ))}
        </>
      ),
    },
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { name: 'Initial sheet' })
  router.history.destroy()
})

it.each([
  ['default', 'ios'],
  ['default', 'android'],
  ['shared', 'ios'],
  ['shared', 'android'],
] as const)(
  'scopes %s %s header slots to duplicate visits across nested stacks and Suspense',
  async (presenter, platform) => {
    let version = 0
    let ready = false
    let resume!: () => void
    const pending = new Promise<void>((resolve) => {
      resume = resolve
    })
    function Title() {
      const params = useParams({ strict: false })
      const navigation = useNavigation()
      const loaded = detail.useLoaderData()
      const explicit = detail.useParams()
      const [count, setCount] = React.useState(0)
      if (params.id === 'b' && !ready) {
        throw pending
      }
      return (
        <>
          <span data-loader={loaded} data-param={explicit.id}>
            Header {params.id}
          </span>
          <button onClick={() => setCount(count + 1)}>
            Count {params.id}: {count}
          </button>
          <button onClick={() => void navigation.back()}>
            Back from {params.id}
          </button>
        </>
      )
    }
    const title = () => (
      <React.Suspense fallback={<span>Loading title</span>}>
        <Title />
      </React.Suspense>
    )
    const root = createRootRoute({ component: Outlet })
    const home = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => <p>Home</p>,
    })
    const parent = createRoute({
      getParentRoute: () => root,
      path: '/nested',
      component: Outlet,
      staticData: {
        native: {
          navigator: stack({
            id: 'inner',
            initialRoute: '/nested/item/a',
          }),
        },
      },
    })
    const detail = createRoute({
      getParentRoute: () => parent,
      path: 'item/$id',
      loader: ({ params }) => `${params.id}:${version}`,
      staticData: {
        native: {
          header:
            platform === 'ios'
              ? { ios: { titleItem: { id: 'title', render: title } } }
              : { android: { centerSubview: { render: title } } },
        },
      },
      component: function Body() {
        const { id } = detail.useParams()
        const [count, setCount] = React.useState(0)
        return (
          <>
            <p>Body {id}</p>
            <button onClick={() => setCount(count + 1)}>
              Body count {id}: {count}
            </button>
          </>
        )
      },
    })
    const custom = ({ children }: any) => (
      <>
        {children.map((item: any) => {
          const content = (
            <section>
              <header>
                {item.options?.header?.ios?.titleItem?.render()}
                {item.options?.header?.android?.centerSubview?.render()}
              </header>
              {item.content}
            </section>
          )
          return (
            <React.Fragment key={item.key}>{item.wrap(content)}</React.Fragment>
          )
        })}
      </>
    )
    if (presenter !== 'default') {
      parent.options.staticData!.native!.navigator = stack({
        id: 'inner',
        initialRoute: '/nested/item/a',
        presenter: custom,
      })
    }
    const router = createRouter({
      native: stack({ initialRoute: '/' }),
      routeTree: root.addChildren([home, parent.addChildren([detail])]),
      Wrap: ({ children }) => (
        <div data-testid="application-wrap">{children}</div>
      ),
    })
    const navigation = getNativeNavigation(router)
    render(<RouterProvider router={router} />)
    await screen.findByText('Home')
    await act(() => navigation.navigate({ href: '/nested' }))
    await screen.findByText('Header a')
    expect(screen.getByText('Header a').getAttribute('data-loader')).toBe('a:0')
    expect(screen.getByText('Header a').getAttribute('data-param')).toBe('a')
    const outerWrap = screen.getAllByTestId('application-wrap')[0]
    for (const back of screen.getAllByTestId('native-back')) {
      expect(back.closest('[data-testid=application-wrap]')).toBe(outerWrap)
    }
    fireEvent.click(screen.getByText('Body count a: 0'))
    fireEvent.click(screen.getByText('Count a: 0'))
    const child = navigation
      .getActivePath()
      .find((entry) => entry.navigator)!.navigator!
    const originalKey = child.getActiveEntry()!.key
    await act(() =>
      child.navigate({ href: '/nested/item/a?sort=recent', behavior: 'reuse' }),
    )
    expect(child.getActiveEntry()!.key).toBe(originalKey)
    expect(screen.getByText('Count a: 1')).toBeTruthy()
    expect(screen.getByText('Body count a: 1')).toBeTruthy()
    await act(() => child.navigate({ href: '/nested/item/b' }))
    await screen.findByText('Body b')
    await screen.findByText('Loading title')
    expect(screen.getByText('Header a')).toBeTruthy()
    await act(async () => {
      ready = true
      resume()
      await pending
    })
    await screen.findByText('Header b')
    version = 1
    await act(() => child.getActiveEntry()!.value.invalidate())
    await waitFor(() =>
      expect(screen.getByText('Header b').getAttribute('data-loader')).toBe(
        'b:1',
      ),
    )
    fireEvent.click(screen.getByText('Count b: 0'))
    await act(() =>
      child.navigate({ href: '/nested/item/b', behavior: 'push' }),
    )
    expect(screen.getAllByText('Header b')).toHaveLength(2)
    expect(screen.getByText('Count b: 0')).toBeTruthy()
    expect(screen.getByText('Count b: 1')).toBeTruthy()
    fireEvent.click(screen.getAllByText('Back from b').at(-1)!)
    await waitFor(() => expect(screen.getAllByText('Header b')).toHaveLength(1))
    expect(screen.getByText('Count b: 1')).toBeTruthy()
    fireEvent.click(screen.getByText('Back from b'))
    await waitFor(() => expect(screen.queryByText('Header b')).toBeNull())
    expect(screen.getByText('Count a: 1')).toBeTruthy()
    expect(screen.getByText('Body count a: 1')).toBeTruthy()
    expect(screen.getByText('Header a')).toBeTruthy()
    await act(() =>
      navigation.navigate({ href: '/nested?refresh=1', behavior: 'reuse' }),
    )
    expect(screen.getByText('Count a: 1')).toBeTruthy()
    expect(screen.getByText('Body count a: 1')).toBeTruthy()
  },
)

it('renders plain tab visits without implicit native stack screens and retains their state', async () => {
  const root = createRootRoute({ component: Outlet })
  const first = createRoute({
    getParentRoute: () => root,
    path: '/first',
    staticData: { native: { keepActive: true } },
    component: function TabDraft() {
      const [value, setValue] = React.useState('')
      return (
        <input
          aria-label="Tab draft"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )
    },
  })
  const second = createRoute({
    getParentRoute: () => root,
    path: '/second',
    component: () => <p>Second direct tab</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([first, second]),
    native: {
      rootKind: 'tabs',
      initialContainer: 'first',
      containers: {
        first: { initialHref: '/first' },
        second: { initialHref: '/second' },
      },
    },
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  fireEvent.change(await screen.findByLabelText('Tab draft'), {
    target: { value: 'Retained draft' },
  })
  expect(screen.queryByTestId('native-back')).toBeNull()
  await act(() => navigation.select('second'))
  await screen.findByText('Second direct tab')
  await act(() => navigation.select('first'))
  expect(
    (await screen.findByLabelText('Tab draft')).getAttribute('value'),
  ).toBe('Retained draft')
  expect(screen.queryByTestId('native-back')).toBeNull()
  router.history.destroy()
})

it('composes direct tabs with an explicit child stack and keeps duplicate owners independent', async () => {
  const root = createRootRoute({ component: Outlet })
  const start = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Start</p>,
  })
  const saved = createRoute({
    getParentRoute: () => root,
    path: '/saved',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          rootKind: 'tabs',
          initialContainer: 'archive',
          containers: {
            archive: { initialHref: '/saved/archive' },
            buds: { initialHref: '/saved/buds' },
          },
        },
      },
    },
  })
  const archive = createRoute({
    getParentRoute: () => saved,
    path: '/archive',
    component: () => <p>Archive direct</p>,
  })
  const buds = createRoute({
    getParentRoute: () => saved,
    path: '/buds',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          rootKind: 'custom',
          initialContainer: 'main',
          containers: { main: { initialHref: '/saved/buds', kind: 'stack' } },
          renderContainer: ({ children, selected }) =>
            children.find((item) => item.key === selected)?.content,
          renderStack: ({ children }) => (
            <section aria-label="Explicit buds stack">
              {children.map((item) => (
                <React.Fragment key={item.key}>
                  {item.wrap?.(
                    <>
                      <h2>Buds visit</h2>
                      {item.content}
                    </>,
                  )}
                </React.Fragment>
              ))}
            </section>
          ),
        },
      },
    },
  })
  const budsIndex = createRoute({
    getParentRoute: () => buds,
    path: '/',
    component: () => <p>Buds home</p>,
  })
  const user = createRoute({
    getParentRoute: () => buds,
    path: '/users/$id',
    component: function BudsUser() {
      const { id } = useParams({ strict: false })
      return <p>Buds user {id}</p>
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([
      start,
      saved.addChildren([archive, buds.addChildren([budsIndex, user])]),
    ]),
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Start')
  await act(() => navigation.navigate({ href: '/saved' }))
  const first = navigation.getSnapshot().stacks.main!.at(-1)!
  const tabs = first.navigator!
  await screen.findByText('Archive direct')
  await act(() => tabs.select('buds'))
  await screen.findByText('Buds home')
  const stack = tabs.getSnapshot().stacks.buds![0]!.navigator!
  await act(() => stack.navigate({ href: '/saved/buds/users/a' }))
  await screen.findByText('Buds user a')
  await act(() => tabs.select('archive'))
  await screen.findByText('Archive direct')
  await act(() => tabs.select('buds'))
  await screen.findByText('Buds user a')
  await act(() => navigation.navigate({ href: '/saved', target: 'main' }))
  const second = navigation.getSnapshot().stacks.main!.at(-1)!
  expect(second.navigator).not.toBe(tabs)
  expect(second.navigator!.getFocusedContainer()).toBe('archive')
  await act(() => navigation.back({ target: 'main' }))
  expect(navigation.getSnapshot().stacks.main!.at(-1)).toBe(first)
  expect(tabs.getFocusedContainer()).toBe('buds')
  await screen.findByText('Buds user a')
  await act(() => stack.back({ target: 'main' }))
  await screen.findByText('Buds home')
  router.history.destroy()
})

it('retains React state across low-level history changes in a direct tab branch', async () => {
  const root = createRootRoute({ component: Outlet })
  const page = createRoute({
    getParentRoute: () => root,
    path: '/page',
    component: function DraftPage() {
      const [value, setValue] = React.useState('')
      return (
        <input
          aria-label="Direct history draft"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )
    },
  })
  const other = createRoute({
    getParentRoute: () => root,
    path: '/other',
    component: () => <p>Direct replacement</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([page, other]),
    native: {
      rootKind: 'tabs',
      initialContainer: 'main',
      containers: { main: { initialHref: '/page' } },
    },
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  fireEvent.change(await screen.findByLabelText('Direct history draft'), {
    target: { value: 'Keep this' },
  })
  await act(() => navigation.navigate({ href: '/other', target: 'main' }))
  await screen.findByText('Direct replacement')
  await act(() => navigation.back({ target: 'main' }))
  expect(
    (await screen.findByLabelText('Direct history draft')).getAttribute(
      'value',
    ),
  ).toBe('Keep this')
  router.history.destroy()
})

it('renders nested default tab branches without implicit stack screens', async () => {
  const root = createRootRoute({ component: Outlet })
  const page = createRoute({
    getParentRoute: () => root,
    path: '/page',
    component: () => <p>Nested direct page</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([page]),
    native: {
      rootKind: 'tabs',
      initialContainer: 'group',
      containers: {
        group: { initialChild: 'page' },
        page: { parent: 'group', initialHref: '/page' },
      },
    },
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('Nested direct page')
  expect(screen.queryByTestId('native-back')).toBeNull()
  router.history.destroy()
})

it('keeps an eagerly rendered direct pager branch unfocused', async () => {
  const root = createRootRoute({ component: Outlet })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a',
    component: () => <p>Pager first</p>,
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b',
    component: () => <p>Pager adjacent</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([a, b]),
    native: {
      rootKind: 'tabs',
      initialContainer: 'a',
      containers: {
        a: { initialHref: '/a', keepActive: true },
        b: { initialHref: '/b', keepActive: true },
      },
      renderContainer: ({ children }) => (
        <>
          {children.map((item) => (
            <React.Fragment key={item.key}>{item.content}</React.Fragment>
          ))}
        </>
      ),
    },
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Pager first')
  await screen.findByText('Pager adjacent')
  expect(navigation.getFocusedContainer()).toBe('a')
  expect(
    screen.getByText('Pager adjacent').closest('[style*="display: none"]'),
  ).toBeNull()
  router.history.destroy()
})

it('keeps a dirty direct tab blocker registered after selecting another tab', async () => {
  const root = createRootRoute({ component: Outlet })
  const dirty = createRoute({
    getParentRoute: () => root,
    path: '/dirty',
    component: function DirtyTab() {
      useBlocker({ shouldBlockFn: () => true })
      return <p>Dirty direct tab</p>
    },
  })
  const clean = createRoute({
    getParentRoute: () => root,
    path: '/clean',
    component: () => <p>Clean direct tab</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([dirty, clean]),
    native: {
      rootKind: 'tabs',
      initialContainer: 'dirty',
      containers: {
        dirty: { initialHref: '/dirty' },
        clean: { initialHref: '/clean' },
      },
    },
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Dirty direct tab')
  const entry = navigation.getActiveEntry()!
  await waitFor(() => expect(navigation.isRemovalBlocked(entry.key)).toBe(true))
  await act(() => navigation.select('clean'))
  await screen.findByText('Clean direct tab')
  expect(navigation.isRemovalBlocked(entry.key)).toBe(true)
  expect(await navigation.reset('dirty', ['/dirty'])).toBe(false)
  router.history.destroy()
})

it('direct-link-root-stack preserves a descendant destination under a slash-root layout stack', async () => {
  const root = createRootRoute({ component: Outlet })
  const map = createRoute({
    getParentRoute: () => root,
    id: '_map',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          rootKind: 'custom',
          initialContainer: 'main',
          containers: { main: { initialHref: '/', kind: 'stack' } },
          renderContainer: ({ children, selected }) =>
            children.find((item) => item.key === selected)?.content,
        },
      },
    },
  })
  const home = createRoute({
    getParentRoute: () => map,
    path: '/',
    component: () => <p>Root stack home</p>,
  })
  const search = createRoute({
    getParentRoute: () => map,
    path: '/search',
    component: () => <p>Root stack direct Search</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([map.addChildren([home, search])]),
    native: {
      initialContainer: 'app',
      containers: { app: { initialHref: '/search' } },
    },
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('Root stack direct Search')
  expect(getNativeNavigation(router).getActiveEntry()?.href).toBe('/search')
  router.history.destroy()
})

it('owner-aware navigation returns to the existing tab owner beneath covering pages', async () => {
  const root = createRootRoute({ component: Outlet })
  const tabs = createRoute({
    getParentRoute: () => root,
    id: '_tabs',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          rootKind: 'tabs',
          initialContainer: 'map',
          containers: {
            map: { initialHref: '/' },
            saved: { initialHref: '/saved' },
          },
        },
      },
    },
  })
  const home = createRoute({
    getParentRoute: () => tabs,
    path: '/',
    component: () => <p>Diagnostic map</p>,
  })
  const saved = createRoute({
    getParentRoute: () => tabs,
    path: '/saved',
    component: () => <p>Diagnostic saved</p>,
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/detail',
    component: () => <p>Diagnostic detail</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([tabs.addChildren([home, saved]), detail]),
  })
  const navigation = getNativeNavigation(router)
  render(<RouterProvider router={router} />)
  await screen.findByText('Diagnostic map')
  const owner = navigation.getSnapshot().stacks.main![0]!
  try {
    await act(() => router.navigate({ to: '/detail' }))
    await act(() => router.navigate({ to: '/saved' }))
    expect(navigation.getSnapshot().stacks.main).toHaveLength(1)
    expect(navigation.getSnapshot().stacks.main![0]).toBe(owner)
    expect(owner.navigator!.getFocusedContainer()).toBe('saved')
  } finally {
    router.history.destroy()
  }
})

function ownerAwareFixture() {
  const flags = { cover: false }
  const blocked: Array<{ pathname: string }> = []
  const root = createRootRoute({ component: Outlet })
  const tabs = createRoute({
    getParentRoute: () => root,
    id: '_tabs',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          rootKind: 'tabs',
          initialContainer: 'map',
          containers: {
            map: { initialHref: '/' },
            saved: { initialHref: '/saved' },
            activity: { initialHref: '/activity' },
          },
        },
      },
    },
  })
  const map = createRoute({
    getParentRoute: () => tabs,
    id: '_map',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          rootKind: 'custom',
          initialContainer: 'main',
          containers: { main: { initialHref: '/', kind: 'stack' } },
          renderContainer: ({ children, selected }) =>
            children.find((item) => item.key === selected)?.content,
        },
      },
    },
  })
  const home = createRoute({
    getParentRoute: () => map,
    path: '/',
    component: () => <p>Owner map</p>,
  })
  const search = createRoute({
    getParentRoute: () => map,
    path: '/search',
    component: () => <p>Owner search</p>,
  })
  const saved = createRoute({
    getParentRoute: () => tabs,
    path: '/saved',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          rootKind: 'tabs',
          initialContainer: 'archive',
          containers: {
            archive: { initialHref: '/saved/archive' },
            buds: { initialHref: '/saved/buds' },
          },
        },
      },
    },
  })
  const savedIndex = createRoute({ getParentRoute: () => saved, path: '/' })
  const archive = createRoute({
    getParentRoute: () => saved,
    path: '/archive',
    component: () => <p>Owner archive</p>,
  })
  const buds = createRoute({
    getParentRoute: () => saved,
    path: '/buds',
    component: Outlet,
    staticData: {
      native: {
        navigator: {
          rootKind: 'custom',
          initialContainer: 'main',
          containers: { main: { initialHref: '/saved/buds/', kind: 'stack' } },
          renderContainer: ({ children, selected }) =>
            children.find((item) => item.key === selected)?.content,
        },
      },
    },
  })
  const budsIndex = createRoute({
    getParentRoute: () => buds,
    path: '/',
    validateSearch: (search) => ({ q: String(search.q ?? '') }),
    component: function BudsDraft() {
      const [value, setValue] = React.useState('')
      return (
        <>
          <p>Owner buds {budsIndex.useSearch().q}</p>
          <input
            aria-label="Owner draft"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </>
      )
    },
  })
  const user = createRoute({
    getParentRoute: () => buds,
    path: '/users/$id',
    component: function OwnerUser() {
      const { id } = useParams({ strict: false })
      return <p>Owner user {id}</p>
    },
  })
  const activity = createRoute({
    getParentRoute: () => tabs,
    path: '/activity',
    component: () => <p>Owner activity</p>,
  })
  const cover = createRoute({
    getParentRoute: () => root,
    path: '/cover',
    component: function Cover() {
      const blocker = useBlocker({
        shouldBlockFn: ({ next }) => {
          blocked.push(next)
          return flags.cover
        },
        withResolver: true,
      })
      return (
        <>
          <p>
            {blocker.status === 'blocked' ? 'Cover blocked' : 'Owner cover'}
          </p>
          {blocker.status === 'blocked' && (
            <>
              <button onClick={blocker.proceed}>Owner proceed</button>
              <button onClick={blocker.reset}>Owner cancel</button>
            </>
          )}
        </>
      )
    },
  })
  const collection = createRoute({
    getParentRoute: () => root,
    path: '/collections/$id',
    component: Outlet,
    staticData: {
      native: {
        navigator: (match) => ({
          rootKind: 'custom',
          initialContainer: 'main',
          containers: {
            main: {
              initialHref: `/collections/${match.params.id}/`,
              kind: 'stack',
            },
          },
          renderContainer: ({ children, selected }) =>
            children.find((item) => item.key === selected)?.content,
        }),
      },
    },
  })
  const collectionIndex = createRoute({
    getParentRoute: () => collection,
    path: '/',
    component: () => <p>Collection index</p>,
  })
  const collectionMap = createRoute({
    getParentRoute: () => collection,
    path: '/map',
    component: () => <p>Collection map</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([
      collection.addChildren([collectionIndex, collectionMap]),
      tabs.addChildren([
        map.addChildren([home, search]),
        saved.addChildren([
          savedIndex,
          archive,
          buds.addChildren([budsIndex, user]),
        ]),
        activity,
      ]),
      cover,
    ]),
    native: {
      rootKind: 'custom',
      initialContainer: 'app',
      containers: { app: { initialHref: '/', kind: 'stack' } },
      renderContainer: ({ children, selected }) =>
        children.find((item) => item.key === selected)?.content,
    },
  })
  return { router, navigation: getNativeNavigation(router), flags, blocked }
}

it('owner-aware navigation retains nested tab stacks and drafts through covering pages', async () => {
  const { router, navigation } = ownerAwareFixture()
  render(<RouterProvider router={router} />)
  await screen.findByText('Owner map')
  const owner = navigation.getSnapshot().stacks.app![0]!
  await act(() => router.navigate({ to: '/saved/buds' }))
  fireEvent.change(await screen.findByLabelText('Owner draft'), {
    target: { value: 'retained' },
  })
  await act(() =>
    router.navigate({ to: '/saved/buds/users/$id', params: { id: 'a' } }),
  )
  const author = navigation.getActiveEntry()
  await act(() => router.navigate({ to: '/saved/archive' }))
  await act(() => router.navigate({ to: '/cover' }))
  await act(() => router.navigate({ to: '/saved' }))
  expect(navigation.getSnapshot().stacks.app).toHaveLength(1)
  expect(navigation.getSnapshot().stacks.app![0]).toBe(owner)
  await screen.findByText('Owner archive')
  await act(() => router.navigate({ to: '/saved/buds' }))
  expect(navigation.getActiveEntry()).toBe(author)
  await screen.findByText('Owner user a')
  await act(() => navigation.back())
  expect(
    (await screen.findByLabelText('Owner draft')).getAttribute('value'),
  ).toBe('retained')
  router.history.destroy()
})

it('owner-aware navigation rolls back the entire path on cancel and commits once on proceed', async () => {
  const { router, navigation, flags, blocked } = ownerAwareFixture()
  render(<RouterProvider router={router} />)
  await screen.findByText('Owner map')
  await act(() => router.navigate({ to: '/saved/archive' }))
  const bottom = navigation.getSnapshot().stacks.app![0]!.navigator!
  const saved = bottom.getSnapshot().stacks.saved![0]!.navigator!
  await act(() => router.navigate({ to: '/cover' }))
  flags.cover = true
  const before = navigation.getSnapshot()
  const savedBefore = saved.getSnapshot()
  let pending!: Promise<void>
  act(() => {
    pending = router.navigate({ to: '/saved/buds' })
  })
  await screen.findByText('Cover blocked')
  expect(navigation.getSnapshot()).toBe(before)
  expect(saved.getSnapshot()).toBe(savedBefore)
  expect(blocked.at(-1)!.pathname.replace(/\/$/, '')).toBe('/saved/buds')
  fireEvent.click(screen.getByText('Owner cancel'))
  await act(() => pending)
  expect(navigation.getSnapshot()).toBe(before)
  expect(saved.getSnapshot()).toBe(savedBefore)
  const committed: Array<string> = []
  navigation.onTreeChange((_owner, change) => {
    if (change.removed.some((entry) => entry.href === '/cover')) {
      expect(saved.getFocusedContainer()).toBe('buds')
      committed.push(navigation.getActiveEntry()!.href)
    }
  })
  act(() => {
    pending = router.navigate({ to: '/saved/buds' })
  })
  await screen.findByText('Cover blocked')
  fireEvent.click(screen.getByText('Owner proceed'))
  await act(() => pending)
  expect(navigation.getSnapshot().stacks.app).toHaveLength(1)
  expect(saved.getFocusedContainer()).toBe('buds')
  expect(committed).toHaveLength(1)
  await screen.findByLabelText('Owner draft')
  router.history.destroy()
})

it('owner-aware navigation resolves duplicate owners relative to the calling visit', async () => {
  const { router, navigation } = ownerAwareFixture()
  render(<RouterProvider router={router} />)
  await screen.findByText('Owner map')
  const first = navigation.getSnapshot().stacks.app![0]!
  await act(() => router.navigate({ to: '/saved/buds' }))
  await act(() =>
    router.navigate({ to: '/saved/buds/users/$id', params: { id: 'first' } }),
  )
  const author = navigation.getActiveEntry()
  await act(() => router.navigate({ to: '/saved/archive' }))
  const firstCaller = navigation.getActiveEntry()!.value
  await act(() =>
    router.navigate({ to: '/saved', target: 'app', stackBehavior: 'push' }),
  )
  const second = navigation.getSnapshot().stacks.app!.at(-1)!
  expect(second).not.toBe(first)
  const removedCaller = navigation.getActiveEntry()!.value
  await act(() => firstCaller.navigate({ to: '/saved/buds' }))
  expect(navigation.getSnapshot().stacks.app).toHaveLength(1)
  expect(navigation.getSnapshot().stacks.app![0]).toBe(first)
  expect(navigation.getActiveEntry()).toBe(author)
  await act(() => removedCaller.navigate({ to: '/activity' }))
  expect(navigation.getActiveEntry()).toBe(author)
  router.history.destroy()
})

it('owner-aware navigation reuses Search and updates direct page search without extra visits', async () => {
  const { router, navigation } = ownerAwareFixture()
  render(<RouterProvider router={router} />)
  await screen.findByText('Owner map')
  await act(() => router.navigate({ to: '/search' }))
  const search = navigation.getActiveEntry()
  await act(() => router.navigate({ to: '/cover' }))
  await act(() => router.navigate({ to: '/search' }))
  expect(navigation.getActiveEntry()).toBe(search)
  await act(() => router.navigate({ to: '/saved/buds/' }))
  const key = navigation.getActiveEntry()!.key
  await act(() =>
    router.navigate({
      to: '/saved/buds/',
      search: { q: 'new' },
      stackBehavior: 'reuse',
    }),
  )
  expect(navigation.getActiveEntry()!.key).toBe(key)
  await screen.findByText('Owner buds new')
  router.history.destroy()
})

it('owner-aware href destinations restore nested layouts and explicit index visits do not duplicate', async () => {
  const { router, navigation } = ownerAwareFixture()
  render(<RouterProvider router={router} />)
  await screen.findByText('Owner map')
  await act(() => router.navigate({ to: '/saved/buds/' }))
  const entry = navigation.getActiveEntry()!
  const stack = getNativeNavigation(entry.value)
  expect(stack.getSnapshot().stacks.main).toHaveLength(1)
  await act(() =>
    router.navigate({ to: '/saved/buds/users/$id', params: { id: 'a' } }),
  )
  const author = navigation.getActiveEntry()
  await act(() => router.navigate({ to: '/cover' }))
  await act(() => router.navigate({ href: '/saved/buds' }))
  expect(navigation.getActiveEntry()).toBe(author)
  await act(() => router.navigate({ to: '/saved/buds/' }))
  expect(stack.getSnapshot().stacks.main).toHaveLength(1)
  expect(navigation.getActiveEntry()!.key).toBe(entry.key)
  router.history.destroy()
})

it('owner-aware parameterized layouts restore only the matching owner', async () => {
  const { router, navigation } = ownerAwareFixture()
  render(<RouterProvider router={router} />)
  await screen.findByText('Owner map')
  await act(() =>
    router.navigate({ to: '/collections/$id/map', params: { id: 'a' } }),
  )
  const first = navigation.getActiveEntry()
  await act(() =>
    router.navigate({ to: '/collections/$id/map', params: { id: 'b' } }),
  )
  const second = navigation.getActiveEntry()
  expect(second).not.toBe(first)
  await act(() =>
    router.navigate({ to: '/collections/$id', params: { id: 'a' } }),
  )
  expect(navigation.getActiveEntry()).toBe(first)
  expect(navigation.getSnapshot().stacks.app).toHaveLength(2)
  router.history.destroy()
})

it('owner-aware root callers keep the active duplicate unless oldest reuse is explicit', async () => {
  const { router, navigation } = ownerAwareFixture()
  render(<RouterProvider router={router} />)
  await screen.findByText('Owner map')
  const first = navigation.getSnapshot().stacks.app![0]!
  await act(() => router.navigate({ to: '/saved/buds' }))
  await act(() =>
    router.navigate({ to: '/saved', target: 'app', stackBehavior: 'push' }),
  )
  const second = navigation.getSnapshot().stacks.app!.at(-1)!
  await act(() => router.navigate({ to: '/saved' }))
  expect(navigation.getSnapshot().stacks.app!.at(-1)).toBe(second)
  await act(() =>
    router.navigate({
      to: '/saved',
      stackBehavior: 'reuse',
      stackMatch: 'oldest',
    }),
  )
  expect(navigation.getSnapshot().stacks.app).toEqual([first])
  await screen.findByText('Owner buds')
  router.history.destroy()
})

it('owner-aware blocked activation cannot commit after a newer navigation wins', async () => {
  const { router, navigation, flags } = ownerAwareFixture()
  render(<RouterProvider router={router} />)
  await screen.findByText('Owner map')
  await act(() => router.navigate({ to: '/cover' }))
  flags.cover = true
  let pending!: Promise<void>
  act(() => {
    pending = router.navigate({ to: '/saved/buds' })
  })
  await screen.findByText('Cover blocked')
  await act(() => router.navigate({ to: '/activity', ignoreBlocker: true }))
  await act(() => pending)
  await screen.findByText('Owner activity')
  expect(navigation.getSnapshot().stacks.app).toHaveLength(1)
  expect(navigation.getActiveEntry()!.href).toBe('/activity')
  router.history.destroy()
})
