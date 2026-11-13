import { createMemoryHistory } from '@tanstack/history'
import { createNavigation } from '@tanstack/router-core/navigation'
import { Router } from '../routerShared'
import type { AnyRouter, NavigateOptionExtensions } from '@tanstack/router-core'
import type {
  Navigation,
  NavigationContainer,
  NavigationEntry,
} from '@tanstack/router-core/navigation'

export interface NativeNavigationOptions {
  linking?: { prefixes: Array<string> }
  initialContainer: string
  containers: Record<string, NavigationContainer>
}

export interface NativeScreenOptions {
  title?: string
  presentation?: 'push' | 'formSheet'
  keepActive?: boolean
}

declare module '@tanstack/router-core' {
  interface RouterOptionsExtensions {
    native?: NativeNavigationOptions
  }
  interface StaticDataRouteOption {
    native?: NativeScreenOptions
  }
  interface NavigateOptionExtensions {
    target?: string
    stackBehavior?: 'push' | 'replace' | 'reuse'
    stackMatch?: 'nearest' | 'oldest'
    entryId?: string
  }
}

export type NativeNavigation = Navigation<AnyRouter>
export type NativeEntry = NavigationEntry<AnyRouter>

const controllers = new WeakMap<AnyRouter, NativeNavigation>()
const roots = new WeakSet<AnyRouter>()

export function getNativeNavigation(router: AnyRouter) {
  const navigation = controllers.get(router)
  if (!navigation) {
    throw new Error('Use the native createRouter with Native RouterProvider')
  }
  return navigation
}

export function getScreenOptions(entry: NativeEntry): NativeScreenOptions {
  return Object.assign(
    {},
    ...entry.value.state.matches.map(
      (match) =>
        entry.value.routesById[match.routeId]?.options.staticData?.native,
    ),
  )
}

export function attachNativeNavigation(router: AnyRouter) {
  const config = router.options.native ?? {
    initialContainer: 'main',
    containers: { main: { initialHref: '/' } },
  }
  const navigation = createNavigation<AnyRouter>({
    ...config,
    async prepare(entry, signal) {
      const scoped = new Router({
        ...router.options,
        Wrap: undefined,
        isServer: false,
        history: createMemoryHistory({ initialEntries: [entry.href] }),
      })
      const cancel = () => scoped.clearCache()
      signal.addEventListener('abort', cancel, { once: true })
      try {
        await scoped.load()
        controllers.set(scoped, navigation)
        // Install public navigation only after initial loading. Loader redirects
        // during preparation must resolve inside this entry's own load pipeline.
        scoped.navigate = (options) => navigateNative(scoped, options)
        scoped.history.back = () => {
          void navigation.back({ target: entry.container })
        }
        return { value: scoped, href: scoped.state.location.href }
      } finally {
        signal.removeEventListener('abort', cancel)
      }
    },
    dispose(entry) {
      entry.value.clearCache()
      // The renderer may still display an outgoing entry during its native
      // transition. WeakMap ownership ends when that subtree is collected.
    },
  })
  controllers.set(router, navigation)
  roots.add(router)
  router.navigate = (options) => navigateNative(router, options)
  router.history.back = () => {
    void navigation.back()
  }
  return navigation
}

export async function navigateNative(router: AnyRouter, options: unknown) {
  const intent = options as NavigateOptionExtensions & { replace?: boolean }
  const navigation = getNativeNavigation(router)
  const source = navigation.getActiveEntry()?.value ?? router
  // Scoped callers resolve relative routes/search against their own visit.
  const base = roots.has(router) ? source : router
  const location = base.buildLocation({
    ...(options as object),
    _includeValidateSearch: true,
  } as never)
  await navigation.navigate({
    href: location.href,
    target: intent.target,
    behavior: intent.stackBehavior ?? (intent.replace ? 'replace' : 'push'),
    identity: intent.entryId,
    match: intent.stackMatch,
  })
}
