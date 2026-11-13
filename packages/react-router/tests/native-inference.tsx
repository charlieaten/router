import { expectTypeOf } from 'vitest'
import {
  Link,
  createRootRoute,
  createRoute,
  createRouter,
  linkOptions,
} from '../dist/native/index.native'

const root = createRootRoute()
const venue = createRoute({
  getParentRoute: () => root,
  path: 'venues/$id',
  validateSearch: (input: Record<string, unknown>) => ({
    section:
      input.section === 'reviews' ? ('reviews' as const) : ('menu' as const),
  }),
  loader: ({ params }) => ({ id: params.id, title: 'A venue' }),
})
const router = createRouter({ routeTree: root.addChildren([venue]) })

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
