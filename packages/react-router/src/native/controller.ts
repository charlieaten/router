import { createMemoryHistory } from '@tanstack/history'
import { Linking } from 'react-native'
import { getUrlScheme } from '@tanstack/router-core'
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
import type { AnyRouter, NavigateOptionExtensions } from '@tanstack/router-core'
import type {
  Navigation,
  NavigationContainer,
  NavigationEntry,
  NavigationOptions,
} from '@tanstack/router-core/navigation'

export interface NativeNavigationOptions {
  dataCache?: { maxEntries?: number }
  persistence?: NativeNavigationPersistenceOptions
  invalidateOnResume?: boolean
  rootKind?: NavigationOptions<AnyRouter>['rootKind']
  backBehavior?: NavigationOptions<AnyRouter>['backBehavior']
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

export interface NativeScreenOptions {
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

const controllers = new WeakMap<AnyRouter, NativeNavigation>()
const roots = new WeakSet<AnyRouter>()
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
    async prepare(entry, signal) {
      const scope = createRouterExecutionScope(
        () => {
          const history = createMemoryHistory({ initialEntries: [entry.href] })
          if (entry.state) {
            history.replace(entry.href, entry.state)
          }
          return new Router(
            {
              ...router.options,
              Wrap: undefined,
              isServer: false,
              history,
            },
            createRouteTreeSource(router),
          )
        },
        { deferLifecycle: true },
      )
      const scoped = scope.router
      dataCache.hydrate(scoped)
      invalidates.set(scoped, scoped.invalidate)
      scopes.set(scoped, scope)
      entryOwners.set(scoped, entry)
      try {
        await scope.load(signal)
        controllers.set(scoped, navigation)
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
          !scope.isDisposed && navigation.canGoBack({ target: entry.container })
        // Install public navigation only after initial loading. Loader redirects
        // during preparation must resolve inside this entry's own load pipeline.
        scoped.navigate = (options) => navigateNative(scoped, options)
        scoped.history.back = () => {
          if (!scope.isDisposed) {
            void navigation.back({ target: entry.container })
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
  navigation.onChange((change) => {
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
    const before = navigation.getActiveEntry(change.current)
    const after = navigation.getActiveEntry(change.next)
    if (before?.key !== after?.key) {
      if (before) {
        emitNativeNavigationEvent(navigation, {
          type: 'blur',
          target: before.key,
        })
      }
      if (after) {
        emitNativeNavigationEvent(navigation, {
          type: 'focus',
          target: after.key,
        })
      }
    }
    emitNativeNavigationEvent(navigation, { type: 'state', target: after?.key })
  })
  router.navigate = (options) => navigateNative(router, options)
  router.load = async () => {
    await navigation.initialize()
    project()
  }
  router.invalidate = (async (options) => {
    dataCache.clear()
    navigation.cancelPending()
    await Promise.all(
      Object.values(navigation.getSnapshot().stacks)
        .flat()
        .map((entry) => {
          entry.value.update({
            ...entry.value.options,
            context: router.options.context,
          })
          return invalidates.get(entry.value)!(options as never)
        }),
    )
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
        for (const entry of Object.values(
          navigation.getSnapshot().stacks,
        ).flat()) {
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
      const unsubscribe = navigation.onChange(register)
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
  navigation.onChange((change) => {
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
  if (scopes.get(router)?.isDisposed) {
    return
  }
  const intent = options as NavigateOptionExtensions & { replace?: boolean }
  const navigation = getNativeNavigation(router)
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
  const target = intent.target ?? entryOwners.get(router)?.container
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
