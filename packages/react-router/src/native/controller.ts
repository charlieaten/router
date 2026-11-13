import { createMemoryHistory } from '@tanstack/history'
import { Linking } from 'react-native'
import { getUrlScheme, isRedirect } from '@tanstack/router-core'
import { createNavigation } from '@tanstack/router-core/navigation'
import {
  createRouteTreeSource,
  createRouterDataCache,
  createRouterExecutionScope,
  projectRouterExecution,
} from '@tanstack/router-core/execution-scope'
import { Router } from '../routerShared'
import { createNavigationPersistence } from './persistence'
import type { RouterHistory } from '@tanstack/history'
import type * as React from 'react'
import type { FormSheet, Stack, Tabs } from 'react-native-screens'
import type { ModalProps } from 'react-native'
import type { NativeNavigationPersistenceOptions } from './persistence'
import type {
  AnyRouteMatch,
  AnyRouter,
  NavigateOptionExtensions,
  ParsedLocation,
} from '@tanstack/router-core'
import type {
  Navigation,
  NavigationContainer,
  NavigationDefinition,
  NavigationEntry,
  NavigationRequest,
} from '@tanstack/router-core/navigation'

export interface NativeNavigationOptions {
  dataCache?: { maxEntries?: number }
  persistence?: NativeNavigationPersistenceOptions
  invalidateOnResume?: boolean
  rootKind?: NavigationDefinition['rootKind']
  backBehavior?: NavigationDefinition['backBehavior']
  renderContainer?: React.ComponentType<NativeContainerRenderProps>
  linking?: { prefixes: Array<string> }
  initialContainer: string
  containers: Record<string, NativeNavigationContainer>
}

export interface NativeNavigationContainer extends NavigationContainer {
  tab?: Pick<
    React.ComponentProps<typeof Tabs.Screen>,
    | 'ios'
    | 'android'
    | 'badgeValue'
    | 'tabBarItemAccessibilityLabel'
    | 'tabBarItemTestID'
  >
}

export type NativeNavigatorOptions = {
  initialLocation?: NavigationRequest
} & Pick<
  NativeNavigationOptions,
  | 'initialContainer'
  | 'containers'
  | 'rootKind'
  | 'backBehavior'
  | 'renderContainer'
>
export interface NativeScreenOptions {
  /** Instantiate this navigator separately for every visit to this route. */
  navigator?:
    | NativeNavigatorOptions
    | ((
        match: AnyRouteMatch,
        location: ParsedLocation,
      ) => NativeNavigatorOptions)
  header?: Partial<React.ComponentProps<typeof Stack.HeaderConfig>>
  stack?: Partial<
    Pick<
      React.ComponentProps<typeof Stack.Screen>,
      'animation' | 'replaceAnimation'
    >
  >
  sheet?: Partial<
    Omit<React.ComponentProps<typeof FormSheet>, 'children' | 'isOpen'>
  >
  modal?: Partial<ModalProps>
  title?: string
  presentation?:
    | 'push'
    | 'formSheet'
    | 'modal'
    | 'fullScreenModal'
    | 'transparentModal'
    | 'containedModal'
    | 'containedTransparentModal'
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
    stackBehavior?: 'push' | 'replace' | 'reuse' | 'popTo' | 'reset'
    stackMatch?: 'nearest' | 'oldest'
    stackFallback?: 'push' | 'replace' | 'none'
    entryId?: string
  }
}

export type NativeNavigation = Navigation<AnyRouter>
export type NativeEntry = NavigationEntry<AnyRouter>

const navigatorDefinitions = new WeakMap<AnyRouter, NativeNavigatorOptions>()
const controllers = new WeakMap<AnyRouter, NativeNavigation>()
const roots = new WeakSet<AnyRouter>()
const rootRouters = new WeakMap<AnyRouter, AnyRouter>()
const persistences = new WeakMap<
  NativeNavigation,
  ReturnType<typeof createNavigationPersistence> | undefined
>()
const entryOwners = new WeakMap<AnyRouter, { key: string; container: string }>()
const invalidates = new WeakMap<AnyRouter, AnyRouter['invalidate']>()
const scopes = new WeakMap<
  AnyRouter,
  ReturnType<typeof createRouterExecutionScope>
>()

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

export function getEntryNavigatorOptions(
  entry: NativeEntry,
): NativeNavigatorOptions | undefined {
  const accepted = navigatorDefinitions.get(entry.value)
  if (accepted) {
    return accepted
  }
  const match = entry.value.state.matches.at(-1)
  if (match?.status !== 'success' || match._notFound) {
    return undefined
  }
  const definition =
    match &&
    entry.value.routesById[match.routeId]?.options.staticData?.native?.navigator
  const resolved =
    typeof definition === 'function'
      ? definition(match, entry.value.state.location)
      : definition
  if (resolved) {
    const accepted = {
      ...resolved,
      rootKind: resolved.rootKind,
      backBehavior: resolved.backBehavior,
    }
    navigatorDefinitions.set(entry.value, accepted)
    return accepted
  }
  return undefined
}

export function attachNativeNavigation(router: AnyRouter) {
  const config = router.options.native ?? {
    initialContainer: 'main',
    containers: { main: { initialHref: '/' } },
  }
  router.update({ ...router.options, native: config })
  const dataCache = createRouterDataCache(config.dataCache)
  const presented = new WeakSet<AnyRouter>()
  const navigation = createNavigation<AnyRouter>({
    ...config,
    getNavigator(entry) {
      const definition = getEntryNavigatorOptions(entry)
      if (!definition) {
        return undefined
      }
      const pathname = entry.href.split(/[?#]/)[0]!
      const target = Object.entries(definition.containers).find(
        ([, container]) => {
          const base = container.initialHref?.split(/[?#]/)[0]
          return base && (pathname === base || pathname.startsWith(base + '/'))
        },
      )?.[0]
      return {
        ...definition,
        initialLocation:
          definition.initialLocation ??
          (target ? { href: entry.href, target } : undefined),
      }
    },
    async prepare(entry, signal) {
      const parent = entry.parent
      const ownerNavigation = parent?.navigator ?? navigation
      const definition = parent ? getEntryNavigatorOptions(parent)! : config
      const [matchedRoutes] = router.getMatchedRoutes(
        router.buildLocation({ href: entry.href } as never).pathname,
      )
      const start = parent?.value.state.matches.length ?? 0
      const boundary = matchedRoutes
        .slice(start)
        .find((route) => route.options.staticData?.native?.navigator)
      const scope = createRouterExecutionScope(
        () => {
          const history = createMemoryHistory({ initialEntries: [entry.href] })
          if (entry.state) {
            history.replace(entry.href, entry.state)
          }
          return new Router(
            {
              ...router.options,
              native: { ...config, ...definition },
              Wrap: undefined,
              isServer: false,
              history,
            },
            createRouteTreeSource(router),
          )
        },
        {
          deferLifecycle: true,
          endRouteId: boundary?.id,
          parent: parent
            ? {
                scope: scopes.get(parent.value)!,
                routeId: parent.value.state.matches.at(-1)!.routeId,
              }
            : undefined,
        },
      )
      const scoped = scope.router
      rootRouters.set(scoped, router)
      dataCache.hydrate(scoped)
      invalidates.set(scoped, scoped.invalidate)
      scopes.set(scoped, scope)
      entryOwners.set(scoped, entry)
      try {
        await scope.load(signal)
        controllers.set(scoped, ownerNavigation)
        scoped.subscribe('onResolved', () => {
          if (presented.has(scoped)) {
            dataCache.publish(scoped)
          }
        })
        const preload = scoped.preloadRoute
        scoped.preloadRoute = (async (options) => {
          const result = await preload(options)
          if (presented.has(scoped)) {
            dataCache.publish(scoped)
          }
          return result
        }) as typeof scoped.preloadRoute
        scoped.invalidate = (options) => router.invalidate(options as never)
        scoped.history.push = (href, state, options) => {
          void navigateNative(scoped, {
            href,
            state,
            ignoreBlocker: options?.ignoreBlocker,
          })
        }
        scoped.history.replace = (href, state, options) => {
          void navigateNative(scoped, {
            href,
            state,
            replace: true,
            ignoreBlocker: options?.ignoreBlocker,
          })
        }
        scoped.history.canGoBack = () =>
          !scope.isDisposed &&
          ownerNavigation.canGoBack({ target: entry.container })
        // Install public navigation only after initial loading. Loader redirects
        // during preparation must resolve inside this entry's own load pipeline.
        scoped.navigate = (options) => navigateNative(scoped, options)
        scoped.history.back = () => {
          if (!scope.isDisposed) {
            void ownerNavigation.back({ target: entry.container })
          }
        }
        return { value: scoped, href: scoped.state.location.href }
      } catch (error) {
        scope.dispose()
        throw error
      }
    },
    dispose(entry) {
      presented.delete(entry.value)
      scopes.get(entry.value)?.dispose()
      // The renderer may still display an outgoing entry during its native
      // transition. WeakMap ownership ends when that subtree is collected.
    },
  })
  const initialize = navigation.initialize
  navigation.initialize = async () => {
    try {
      return await initialize()
    } catch (error) {
      if (!isRedirect(error)) {
        throw error
      }
      await navigateNative(router, {
        ...error.options,
        replace: true,
        ignoreBlocker: true,
      })
      return true
    }
  }
  const persistence = config.persistence
    ? createNavigationPersistence(navigation, config.persistence)
    : undefined
  if (persistence) {
    navigation.initialize = persistence.initialize
  }
  persistences.set(navigation, persistence)
  controllers.set(router, navigation)
  roots.add(router)
  let unsubscribeScope: (() => void) | undefined
  let projected: AnyRouter | undefined
  const project = () => {
    const source = navigation.getActiveEntry()?.value
    if (!source) {
      return
    }
    if (projected !== source) {
      unsubscribeScope?.()
      projected = source
      const unsubscribers = ['onResolved', 'onRendered'].map((type) =>
        source.subscribe(type as 'onResolved', () =>
          projectRouterExecution(router, source),
        ),
      )
      unsubscribeScope = () => {
        for (const unsubscribe of unsubscribers) {
          unsubscribe()
        }
      }
    }
    projectRouterExecution(router, source)
  }
  let focused: Array<NativeEntry> = []
  navigation.onTreeChange((_owner, change) => {
    for (const { entry, previous } of change.updated) {
      if (change.signal.aborted) {
        break
      }
      presented.add(entry.value)
      entryOwners.set(entry.value, entry)
      scopes.get(entry.value)?.activate(previous?.value, change.signal)
      dataCache.publish(entry.value)
    }
    project()
    const after = navigation.getActivePath()
    for (const entry of focused) {
      if (!after.some((item) => item.key === entry.key)) {
        emitNativeNavigationEvent(getNativeNavigation(entry.value), {
          type: 'blur',
          target: entry.key,
        })
      }
    }
    for (const entry of after) {
      if (!focused.some((item) => item.key === entry.key)) {
        emitNativeNavigationEvent(getNativeNavigation(entry.value), {
          type: 'focus',
          target: entry.key,
        })
      }
    }
    focused = after
    const owners = new Set([
      navigation,
      ...after.map((entry) => getNativeNavigation(entry.value)),
    ])
    for (const owner of owners) {
      emitNativeNavigationEvent(owner, {
        type: 'state',
        target: owner.getActiveEntry()?.key,
      })
    }
  })
  router.navigate = (options) => navigateNative(router, options)
  router.load = async () => {
    await navigation.initialize()
    project()
  }
  router.invalidate = (async (options) => {
    dataCache.clear()
    navigation.cancelPending()
    const refresh = async (owner: NativeNavigation): Promise<void> => {
      await Promise.all(
        Object.values(owner.getSnapshot().stacks)
          .flat()
          .map(async (entry) => {
            entry.value.update({
              ...entry.value.options,
              context: router.options.context,
            })
            await invalidates.get(entry.value)!(options as never)
            if (entry.navigator) {
              await refresh(entry.navigator)
            }
          }),
      )
    }
    await refresh(navigation)
    project()
  }) as typeof router.invalidate
  router.preloadRoute = ((options) => {
    const source = navigation.getActiveEntry()?.value
    return source ? source.preloadRoute(options) : Promise.resolve(undefined)
  }) as typeof router.preloadRoute
  const originalHistory: RouterHistory = router.history
  const subscribers: typeof originalHistory.subscribers = new Set()
  const historyBlockers: ReturnType<typeof originalHistory._getBlockers> = []
  const history: RouterHistory = {
    ...originalHistory,
    get location() {
      return (
        navigation.getActiveEntry()?.value.history.location ??
        originalHistory.location
      )
    },
    get length() {
      const state = navigation.getSnapshot()
      return state.stacks[navigation.getFocusedContainer()]!.length
    },
    subscribers,
    canGoBack: () => navigation.canGoBack(),
    subscribe(listener) {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    push(href, state, options) {
      void navigateNative(router, {
        href,
        state,
        ignoreBlocker: options?.ignoreBlocker,
      })
    },
    replace(href, state, options) {
      void navigateNative(router, {
        href,
        state,
        replace: true,
        ignoreBlocker: options?.ignoreBlocker,
      })
    },
    back() {
      void navigation.back()
    },
    go(delta) {
      if (delta < 0) {
        void navigation.back({ count: -delta })
      }
    },
    block(blocker) {
      historyBlockers.push(blocker)
      const unblocks = new Map<string, () => void>()
      const register = () => {
        for (const entry of navigation.getEntries()) {
          if (!unblocks.has(entry.key)) {
            unblocks.set(
              entry.key,
              navigation.block(entry.key, (change) =>
                blocker.blockerFn({
                  currentLocation: entry.value.history.location,
                  nextLocation:
                    navigation.getActiveEntry(change.next)?.value.history
                      .location ?? entry.value.history.location,
                  action: change.action === 'back' ? 'BACK' : 'REPLACE',
                }),
              ),
            )
          }
        }
      }
      const unsubscribe = navigation.onTreeChange(register)
      register()
      return () => {
        historyBlockers.splice(historyBlockers.indexOf(blocker), 1)
        unsubscribe()
        for (const unblock of unblocks.values()) {
          unblock()
        }
      }
    },
    _getBlockers: () => historyBlockers,
    destroy() {
      unsubscribeScope?.()
      persistence?.dispose()
      navigation.dispose()
      dataCache.clear()
      nativeListeners.get(navigation)?.clear()
      subscribers.clear()
    },
  }
  router.history = history
  navigation.onTreeChange((_owner, change) => {
    const action = {
      type:
        change.action === 'back'
          ? 'BACK'
          : change.action === 'navigate'
            ? 'PUSH'
            : 'REPLACE',
    } as const
    for (const listener of subscribers) {
      listener({ location: router.history.location, action })
    }
  })
  return navigation
}

export async function navigateNative(router: AnyRouter, options: unknown) {
  for (let redirects = 0; redirects < 16; redirects++) {
    try {
      return await navigateNativeOnce(router, options)
    } catch (error) {
      if (!isRedirect(error)) {
        throw error
      }
      router = rootRouters.get(router) ?? router
      options = { ...error.options, replace: true, ignoreBlocker: true }
    }
  }
  throw new Error('Too many native navigation redirects')
}
async function navigateNativeOnce(router: AnyRouter, options: unknown) {
  if (scopes.get(router)?.isDisposed) {
    return
  }
  const intent = options as NavigateOptionExtensions & { replace?: boolean }
  let navigation = getNativeNavigation(router)
  if (roots.has(router) && !intent.target) {
    const active = navigation.getActiveEntry()
    if (active) {
      navigation = getNativeNavigation(active.value)
    }
  }
  const raw = options as {
    href?: string
    to?: string
    state?: unknown
    ignoreBlocker?: boolean
  }
  const external = raw.href ?? raw.to
  const scheme = external && getUrlScheme(external)
  if (scheme) {
    if (!router.protocolAllowlist.has(scheme)) {
      throw new Error('Blocked navigation protocol')
    }
    await Linking.openURL(external)
    return
  }
  const source = navigation.getActiveEntry()?.value ?? router
  // Scoped callers resolve relative routes/search against their own visit.
  const base = roots.has(router) ? source : router
  const location = base.buildLocation({
    ...(options as object),
    _includeValidateSearch: true,
  } as never)
  if (intent.target) {
    while (
      !navigation.getSnapshot().stacks[intent.target] &&
      navigation.getOwner()
    ) {
      navigation = navigation.getOwner()!.navigation
    }
  } else {
    // Navigating outside a child boundary targets the owning parent stack.
    const destination = navigation.getOwner()
      ? (rootRouters.get(router) ?? router).matchRoutes(location)
      : []
    while (navigation.getOwner()) {
      const owner = navigation.getOwner()!
      const prefix = owner.entry.value.state.matches
      if (
        destination.length > prefix.length &&
        prefix.every((match, index) => destination[index]?.id === match.id)
      ) {
        break
      }
      navigation = owner.navigation
    }
  }
  const scopedOwner = entryOwners.get(router)
  const target =
    intent.target ??
    (scopedOwner && navigation.getSnapshot().stacks[scopedOwner.container]
      ? scopedOwner.container
      : undefined)
  if (intent.stackBehavior === 'popTo') {
    await navigation.popTo({
      href: location.href,
      target,
      identity: intent.entryId,
      match: intent.stackMatch,
      fallback: intent.stackFallback,
    })
    return
  }
  if (intent.stackBehavior === 'reset') {
    await navigation.reset(target ?? navigation.getFocusedContainer(), [
      location.href,
    ])
    return
  }
  await navigation.navigate({
    href: location.href,
    target,
    state: raw.state === undefined ? undefined : { ...location.state },
    ignoreBlocker: raw.ignoreBlocker,
    behavior: intent.stackBehavior ?? (intent.replace ? 'replace' : 'push'),
    identity: intent.entryId,
    match: intent.stackMatch,
  })
}

export type NativeNavigationEventType =
  | 'focus'
  | 'blur'
  | 'state'
  | 'transitionStart'
  | 'transitionEnd'
export interface NativeNavigationEvent {
  type: NativeNavigationEventType
  target?: string
  closing?: boolean
}
const nativeListeners = new WeakMap<
  NativeNavigation,
  Set<(event: NativeNavigationEvent) => void>
>()
export function emitNativeNavigationEvent(
  navigation: NativeNavigation,
  event: NativeNavigationEvent,
) {
  for (const listener of nativeListeners.get(navigation) ?? []) {
    listener(event)
  }
}
export function subscribeNativeNavigationEvent(
  navigation: NativeNavigation,
  type: NativeNavigationEventType,
  listener: (event: NativeNavigationEvent) => void,
  target?: string,
) {
  const listeners = nativeListeners.get(navigation) ?? new Set()
  const handler = (event: NativeNavigationEvent) => {
    if (event.type === type && (!target || event.target === target)) {
      listener(event)
    }
  }
  listeners.add(handler)
  nativeListeners.set(navigation, listeners)
  return () => {
    listeners.delete(handler)
  }
}

export interface NativeContainerRenderProps {
  id: string
  kind: 'stack' | 'tabs' | 'drawer' | 'custom'
  selected: string
  children: Array<{
    key: string
    title: string
    content: React.ReactNode
    preventDismiss?: boolean
    tab?: NativeNavigationContainer['tab']
  }>
  onSelect: (key: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function flushNativeNavigation(navigation: NativeNavigation) {
  return persistences.get(navigation)?.flush() ?? Promise.resolve()
}
