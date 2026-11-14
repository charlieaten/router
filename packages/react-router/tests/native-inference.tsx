import { createStandardNavigator } from 'standard-navigation'
import { expectTypeOf } from 'vitest'
import {
  Link,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  integrateStandardNavigator,
  linkOptions,
} from '@tanstack/react-router'
import type { NativeNavigatorOptions } from '@tanstack/react-router'
import type { AnyRouteMatch } from '@tanstack/router-core'

const root = createRootRouteWithContext<{ session: string }>()({})
const venue = createRoute({
  getParentRoute: () => root,
  path: 'venues/$id',
  validateSearch: (input: Record<string, unknown>) => ({
    section:
      input.section === 'reviews' ? ('reviews' as const) : ('menu' as const),
  }),
  loader: ({ params }) => ({ id: params.id, title: 'A venue' }),
})
const router = createRouter({
  routeTree: root.addChildren([venue]),
  context: { session: 'native' },
})

function TypedNativeProvider() {
  // @ts-expect-error -- provider context retains the route tree's inferred type
  const invalid = <RouterProvider router={router} context={{ session: 123 }} />
  return (
    <RouterProvider router={router} context={{ session: 'authenticated' }} />
  )
}

declare module '@tanstack/router-core' {
  interface Register {
    router: typeof router
  }
}

function TypedNativeScreen() {
  const params = venue.useParams()
  const data = venue.useLoaderData()
  const search = venue.useSearch()
  expectTypeOf(params.id).toEqualTypeOf<string>()
  expectTypeOf(data.title).toEqualTypeOf<string>()
  expectTypeOf(search.section).toEqualTypeOf<'menu' | 'reviews'>()
  const navigate = venue.useNavigate()
  void navigate({
    to: '/venues/$id',
    params: { id: '123' },
    search: { section: 'reviews' },
    target: 'search',
    stackBehavior: 'reuse',
  })
  // @ts-expect-error -- destination params retain TanStack's inferred shape
  void navigate({ to: '/venues/$id', params: { wrong: '123' } })
  const options = linkOptions({
    to: '/venues/$id',
    params: { id: '123' },
    search: { section: 'menu' },
  })
  return <Link {...options}>Open venue</Link>
}

const nestedNavigator: NativeNavigatorOptions = {
  initialContainer: 'feed',
  containers: { feed: { initialHref: '/venues/123' } },
}
const nestedRoute = createRoute({
  getParentRoute: () => root,
  path: 'nested',
  staticData: {
    native: {
      navigator: (match, location) => {
        expectTypeOf(match).toEqualTypeOf<AnyRouteMatch>()
        expectTypeOf(location.href).toEqualTypeOf<string>()
        return nestedNavigator
      },
    },
  },
})

// Standard navigator props and events retain their own contract types.
const standardNavigator = createStandardNavigator<
  { title: string },
  {
    tabPress: { data: { isAlreadyFocused: boolean }; canPreventDefault: true }
  },
  { accent: string }
>(() => null)
integrateStandardNavigator(standardNavigator, {
  props: (context) => ({ accent: context.kind }),
  screenOptions: ({ item }) => ({ title: item.title }),
  listeners: {
    tabPress(event) {
      expectTypeOf(event.data.isAlreadyFocused).toEqualTypeOf<boolean>()
      event.preventDefault()
    },
  },
})
// @ts-expect-error -- required navigator props must be supplied
integrateStandardNavigator(standardNavigator, {
  screenOptions: () => ({ title: 'Tabs' }),
})
