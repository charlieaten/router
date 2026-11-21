import { createMemoryHistory } from '@tanstack/history'
import { Linking } from 'react-native'
import { deepEqual, getUrlScheme, isRedirect } from '@tanstack/router-core'
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
  renderStack?: React.ComponentType<NativeContainerRenderProps>
  linking?: { prefixes: Array<string> }
  initialContainer: string
  containers: Record<string, NativeNavigationContainer>
}

export interface NativeNavigationContainer extends NavigationContainer {
  /** Registered route path describing this branch, independent of its current visit. */
  routePath?: string
  /** Render an unfocused branch for pagers; focus still follows selection. */
  keepActive?: boolean
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
  | 'renderStack'
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
      renderContainer: resolved.renderContainer,
      renderStack: resolved.renderStack,
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
  const preloadRoot = router.preloadRoute.bind(router)
  const dataCache = createRouterDataCache(config.dataCache)
  const presented = new WeakSet<AnyRouter>()
  const navigation = createNavigation<AnyRouter>({
    ...config,
    getNavigator(entry) {
      const definition = getEntryNavigatorOptions(entry)
      if (!definition) {
        return undefined
      }
      const canonical = (href: string) =>
        router.buildLocation({
          href,
          _includeValidateSearch: true,
        } as never).href
      const containers = Object.fromEntries(
        Object.entries(definition.containers).map(([id, container]) => [
          id,
          {
            ...container,
            initialHref:
              container.initialHref && canonical(container.initialHref),
          },
        ]),
      )
      const pathname = entry.href.split(/[?#]/)[0]!
      let target: string | undefined
      let length = 0
      // A slash-root stack is the fallback; prefer a more specific branch.
      for (const [id, container] of Object.entries(containers)) {
        const path = container.initialHref?.split(/[?#]/)[0]
        const base = path === '/' ? path : path?.replace(/\/$/, '')
        if (
          base &&
          base.length > length &&
          (base === '/' || pathname === base || pathname.startsWith(base + '/'))
        ) {
          target = id
          length = base.length
        }
      }
      return {
        ...definition,
        containers,
        initialLocation: definition.initialLocation
          ? {
              ...definition.initialLocation,
              href: canonical(definition.initialLocation.href),
            }
          : target
            ? { href: canonical(entry.href), target }
            : undefined,
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
          const destination = scoped.buildLocation(options as never)
          if (scoped._execution && !scoped._execution.accepts(destination)) {
            // Preloading outside this visit must not borrow its bounded prefix.
            const result = await preloadRoot({
              href: destination.href,
            } as never)
            dataCache.publish(router)
            return result
          }
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
  navigation.initialize = async (target) => {
    if (target !== undefined) {
      return initialize(target)
    }
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
                    (
                      change.destination ??
                      navigation.getActiveEntry(change.next)
                    )?.value.history.location ?? entry.value.history.location,
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
// Route ancestry identifies a branch; bound path params identify its owner visit.
function destinationMatch(
  router: AnyRouter,
  match: AnyRouteMatch,
  destination: Array<AnyRouteMatch>,
) {
  const next = destination.find(
    (candidate) => candidate.routeId === match.routeId,
  )
  if (!next) {
    return undefined
  }
  const path: string = router.routesById[match.routeId]!.fullPath
  const names = Array.from(
    path.matchAll(/\$([A-Za-z0-9_]+)/g),
    (item) => item[1]!,
  )
  if (path.endsWith('/$')) {
    names.push('_splat')
  }
  return names.every((name) => deepEqual(match.params[name], next.params[name]))
    ? next
    : undefined
}

function ownerDestination(
  router: AnyRouter,
  origin: NativeNavigation,
  location: ParsedLocation,
  options: unknown,
) {
  const root = rootRouters.get(router) ?? router
  const intent = options as NavigateOptionExtensions & {
    search?: unknown
    href?: string
    to?: string
    state?: unknown
  }
  const destination = root.matchRoutes(location)
  const route =
    root.routesByPath[intent.to ?? ''] ??
    root.routesByPath[location.pathname] ??
    root.routesById[destination.at(-1)!.routeId]!
  // An explicit layout path restores its navigator; a trailing slash targets index.
  const requested =
    !(intent.to ?? intent.href?.split(/[?#]/)[0] ?? location.pathname).endsWith(
      '/',
    ) &&
    route.path === '/' &&
    destination
      .find((match) => match.routeId === route.parentRoute?.id)
      ?.pathname.replace(/\/$/, '') === location.pathname.replace(/\/$/, '')
      ? route.parentRoute
      : route
  const anchors = new Map<
    NativeNavigation,
    { key: string; container: string }
  >()
  let branch: NativeNavigation | undefined = origin
  let anchor = entryOwners.get(
    roots.has(router) ? (origin.getActiveEntry()?.value ?? router) : router,
  )
  while (branch) {
    if (anchor) {
      anchors.set(branch, anchor)
    }
    const owner = branch.getOwner()
    anchor = owner?.entry
    branch = owner?.navigation
  }
  const accepts = (entry: NativeEntry) =>
    entry.value.state.matches.every(
      (match, index) =>
        match.status === 'success' && match.id === destination[index]?.id,
    )
  let navigation = origin
  while (navigation.getOwner()) {
    const owner = navigation.getOwner()!
    const boundary = owner.entry.value.state.matches.at(-1)!
    if (
      boundary.routeId !== requested.id &&
      destinationMatch(root, boundary, destination) &&
      accepts(owner.entry)
    ) {
      break
    }
    navigation = owner.navigation
  }
  // An explicit oldest search from the root may choose an older owner. Scoped
  // callers remain anchored to their own visit even when another copy is active.
  if (
    roots.has(router) &&
    intent.stackMatch === 'oldest' &&
    intent.stackBehavior === 'reuse'
  ) {
    navigation = getNativeNavigation(root)
  }
  let handled = !!navigation.getOwner()
  let activating = false
  const resolve: Parameters<NativeNavigation['activate']>[0] = (node) => {
    const owner = node.getOwner()
    const config = owner
      ? getEntryNavigatorOptions(owner.entry)!
      : root.options.native!
    const state = node.getSnapshot()
    const here = anchors.get(node)
    const target = here?.container ?? node.getFocusedContainer()
    const parentId =
      owner?.entry.value.state.matches.at(-1)!.routeId ?? root.routeTree.id
    if (config.rootKind === 'tabs' || config.rootKind === 'drawer') {
      let selected:
        | { id: string; match: AnyRouteMatch; rank: number }
        | undefined
      for (const [id, container] of Object.entries(config.containers)) {
        const href = container.routePath ?? container.initialHref
        if (!href || container.overlay) {
          continue
        }
        const matches = root.matchRoutes(root.buildLocation({ href } as never))
        const suffix = matches.slice(
          matches.findIndex((match) => match.routeId === parentId) + 1,
        )
        const declared = root.routesByPath[href.split(/[?#]/)[0]!]
        const boundary =
          suffix.find(
            (match) =>
              root.routesById[match.routeId]?.options.staticData?.native
                ?.navigator,
          ) ??
          suffix.find((match) => match.routeId === declared?.id) ??
          suffix.at(-1)
        const match = boundary && destinationMatch(root, boundary, destination)
        const rank = match ? destination.indexOf(match) : -1
        if (match && (!selected || rank > selected.rank)) {
          selected = { id, match, rank }
        }
      }
      if (selected) {
        handled = true
        activating = true
        const stack = state.stacks[selected.id] ?? []
        const entry =
          [...stack]
            .reverse()
            .find(
              (entry) =>
                entry.navigator &&
                destinationMatch(
                  root,
                  entry.value.state.matches.at(-1)!,
                  destination,
                ),
            ) ?? stack.at(-1)
        const boundary = entry?.value.state.matches.at(-1)
        const reload = !!entry?.navigator && !accepts(entry)
        const sameOwner =
          entry?.navigator &&
          boundary &&
          boundary.routeId === requested.id &&
          destinationMatch(root, boundary, destination)
        const explicitSearch =
          Object.hasOwn(intent, 'search') || !!intent.href?.includes('?')
        const updateOwner =
          sameOwner &&
          (explicitSearch || intent.state !== undefined) &&
          (entry.value.state.location.searchStr !== location.searchStr ||
            intent.state !== undefined)
        return {
          target: selected.id,
          key: entry?.key,
          descend:
            !reload && !sameOwner && requested.id !== selected.match.routeId,
          request:
            sameOwner && !updateOwner && !reload
              ? undefined
              : {
                  href: location.href,
                  identity: entry?.identity,
                  state:
                    intent.state === undefined
                      ? undefined
                      : { ...location.state },
                  behavior: entry ? 'reuse' : 'replace',
                  match: intent.stackMatch,
                },
        }
      }
    }
    const stack = state.stacks[target] ?? []
    const anchorIndex = here
      ? stack.findIndex((entry) => entry.key === here.key)
      : stack.length - 1
    const candidates = stack.slice(0, anchorIndex + 1)
    if (intent.stackMatch !== 'oldest') {
      candidates.reverse()
    }
    const existing = candidates.find(
      (entry) =>
        entry.navigator &&
        destinationMatch(root, entry.value.state.matches.at(-1)!, destination),
    )
    if (existing) {
      handled = true
      activating = true
      const reload = !accepts(existing)
      const sameOwner =
        requested.id === existing.value.state.matches.at(-1)!.routeId
      const explicitSearch =
        Object.hasOwn(intent, 'search') || !!intent.href?.includes('?')
      const updateOwner =
        sameOwner &&
        (explicitSearch || intent.state !== undefined) &&
        (existing.value.state.location.searchStr !== location.searchStr ||
          intent.state !== undefined)
      return {
        target,
        key: existing.key,
        descend: !sameOwner && !reload,
        request:
          updateOwner || reload
            ? {
                href: location.href,
                identity: existing.identity,
                behavior: 'reuse',
                state:
                  intent.state === undefined
                    ? undefined
                    : { ...location.state },
              }
            : undefined,
      }
    }
    const reuse =
      activating ||
      intent.stackBehavior === 'reuse' ||
      (owner &&
        config.containers[target]?.initialHref
          ?.split(/[?#]/)[0]
          ?.replace(/\/$/, '') === location.pathname.replace(/\/$/, ''))
    const matching =
      reuse &&
      candidates.find((entry) => {
        const match = entry.value.state.matches.at(-1)!
        return (
          match.routeId === destination.at(-1)!.routeId &&
          destinationMatch(root, match, destination)
        )
      })
    return {
      target,
      request: {
        href: location.href,
        identity: matching ? matching.identity : undefined,
        state: intent.state === undefined ? undefined : { ...location.state },
        behavior: reuse ? 'reuse' : 'push',
        match: intent.stackMatch,
      },
    }
  }
  const first = resolve(navigation)
  return handled
    ? {
        navigation,
        resolve: (node: NativeNavigation) =>
          node === navigation ? first : resolve(node),
      }
    : undefined
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
  if (
    !intent.target &&
    !intent.entryId &&
    !(intent as { replace?: boolean }).replace &&
    (!intent.stackBehavior || intent.stackBehavior === 'reuse')
  ) {
    const destination = ownerDestination(router, navigation, location, options)
    if (destination) {
      await destination.navigation.activate(destination.resolve, {
        ignoreBlocker: raw.ignoreBlocker,
      })
      return
    }
  }
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
    /** Render this visit's header and content under one routing boundary.
     * Call as a render function, not as a component. Absent on container items.
     */
    wrap?: (children: React.ReactNode) => React.ReactElement
    preventDismiss?: boolean
    options?: NativeScreenOptions
    tab?: NativeNavigationContainer['tab']
  }>
  navigation: NativeNavigation
  routes: Array<{
    key: string
    name: string
    href: string | undefined
    params?: object
  }>
  onNavigate: (name: string, params?: object) => void
  onBack: () => void
  onSelect: (key: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function flushNativeNavigation(navigation: NativeNavigation) {
  return persistences.get(navigation)?.flush() ?? Promise.resolve()
}
