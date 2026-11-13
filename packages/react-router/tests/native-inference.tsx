import { expectTypeOf } from 'vitest'
import {
  Link,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  linkOptions,
} from '@tanstack/react-router'

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
