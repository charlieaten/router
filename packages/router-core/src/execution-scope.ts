import { lifecycleEnd, runRouteLifecycle } from './router'
import { disposeClientExecution } from './load-client'
import type { AnyRouter, RouteTreeSource } from './router'
import type { AnyRouteMatch } from './Matches'

/** Native executions may share matching metadata, never request or view state. */
export function createRouteTreeSource(source: AnyRouter): RouteTreeSource {
  return (router) => {
    if (
      process.env.NODE_ENV !== 'development' &&
      source.routeTree === router.routeTree &&
      source.options.caseSensitive === router.options.caseSensitive &&
      source.options.routeMasks === router.options.routeMasks &&
      source.options.notFoundRoute === router.options.notFoundRoute &&
      source.basepath === router.basepath &&
      source.options.trailingSlash === router.options.trailingSlash
    ) {
      return {
        routesById: source.routesById,
        routesByPath: source.routesByPath,
        processedTree: source.processedTree,
        resolvePathCache: source.resolvePathCache,
      }
    }
    return undefined
  }
}

/** A terminal lifetime for an independently presented router execution. */
const lifecycleOwners = new WeakMap<
  AnyRouter,
  () => AnyRouter['state']['matches']
>()

export function createRouterExecutionScope<T extends AnyRouter>(
  create: () => T,
  options?: {
    deferLifecycle?: boolean
    endRouteId?: string
    parent?: {
      scope: {
        router: AnyRouter
        isDisposed: boolean
        retain: () => () => void
      }
      routeId: string
    }
  },
) {
  const router = create()
  let disposed = false
  let leases = 0
  let released = false
  const releaseParent = options?.parent?.scope.retain()
  const matchRoutes = router.matchRoutes.bind(router)
  if (options?.endRouteId || options?.parent) {
    router.matchRoutes = ((...args: Parameters<T['matchRoutes']>) => {
      const matches = matchRoutes(args[0], args[1], args[2])
      if (options.endRouteId) {
        const end = matches.findIndex(
          (match) => match.routeId === options.endRouteId,
        )
        if (end < 0) {
          throw new Error('Destination left its route execution boundary')
        }
        matches.splice(end + 1)
        // An outlet boundary intentionally stops before matching its child.
        // Missing descendants belong to that child execution, not this prefix.
        for (const match of matches) {
          match._notFound = undefined
        }
      }
      return matches
    }) as T['matchRoutes']
    router._execution = {
      accepts(location) {
        const matches = matchRoutes(location)
        if (
          options.endRouteId &&
          !matches.some((match) => match.routeId === options.endRouteId)
        ) {
          return false
        }
        const parent = options.parent
        if (parent) {
          const end =
            parent.scope.router.state.matches.findIndex(
              (match) => match.routeId === parent.routeId,
            ) + 1
          return (
            !!end &&
            parent.scope.router.state.matches
              .slice(0, end)
              .every((match, index) => matches[index]?.id === match.id)
          )
        }
        return true
      },
      start: options.parent
        ? options.parent.scope.router.state.matches.findIndex(
            (match) => match.routeId === options.parent!.routeId,
          ) + 1
        : 0,
      prepare(matches: Array<AnyRouteMatch>) {
        const parent = options.parent
        if (!parent) {
          return 0
        }
        const ancestors = parent.scope.router.state.matches
        const end =
          ancestors.findIndex((match) => match.routeId === parent.routeId) + 1
        if (!end || parent.scope.isDisposed) {
          throw new Error('Parent route execution is unavailable')
        }
        for (let index = 0; index < end; index++) {
          const ancestor = ancestors[index]!
          const candidate = matches[index]
          if (
            !candidate ||
            candidate.id !== ancestor.id ||
            ancestor.status !== 'success'
          ) {
            throw new Error('Destination left its parent route execution')
          }
          // Borrow data/context, never a loader flight or its abort controller.
          matches[index] = {
            ...ancestor,
            abortController: candidate.abortController,
            _flight: undefined,
          } as AnyRouteMatch
        }
        return end
      },
    }
  }
  const finish = () => {
    if (!disposed || leases || released) {
      return
    }
    released = true
    activation?.abort()
    try {
      disposeClientExecution(
        router,
        lifecycle === 'automatic' || lifecycle === 'active',
      )
    } finally {
      lifecycleOwners.delete(router)
      releaseParent?.()
    }
  }
  let activation: AbortController | undefined
  let lifecycle: 'automatic' | 'deferred' | 'active' | 'transferred' =
    options?.deferLifecycle ? 'deferred' : 'automatic'
  if (options?.deferLifecycle) {
    router.update({ ...router.options, routeLifecycle: 'manual' })
  }
  lifecycleOwners.set(router, () => {
    lifecycle = 'transferred'
    router.update({ ...router.options, routeLifecycle: 'manual' })
    return router.state.matches
  })
  const load = router.load.bind(router)
  const navigate = router.navigate.bind(router)
  const invalidate = router.invalidate.bind(router)
  const preload = router.preloadRoute.bind(router)
  const assertLive = () => {
    if (disposed) {
      throw new Error('Router execution scope is disposed')
    }
  }
  router.load = async (options) => {
    assertLive()
    await load(options)
  }
  router.navigate = async (options) => {
    if (!disposed) {
      await navigate(options)
    }
  }
  router.invalidate = ((...args: Parameters<T['invalidate']>) => {
    if (disposed) {
      return Promise.resolve()
    }
    return invalidate(...args)
  }) as T['invalidate']
  router.preloadRoute = ((...args: Parameters<T['preloadRoute']>) => {
    assertLive()
    return preload(args[0])
  }) as T['preloadRoute']
  const scope = {
    router,
    retain() {
      if (disposed) {
        throw new Error('Router execution scope is disposed')
      }
      leases++
      let live = true
      return () => {
        if (live) {
          live = false
          leases--
          finish()
        }
      }
    },
    get isDisposed() {
      return disposed
    },
    async load(signal?: AbortSignal) {
      assertLive()
      const cancel = () => scope.dispose()
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) {
        cancel()
      }
      try {
        if (!disposed) {
          await load()
        }
      } finally {
        signal?.removeEventListener('abort', cancel)
      }
    },
    activate(previous?: AnyRouter, signal?: AbortSignal) {
      assertLive()
      if (lifecycle === 'active' || lifecycle === 'automatic') {
        return
      }
      const previousMatches = previous
        ? (lifecycleOwners.get(previous)?.() ?? [])
        : []
      lifecycle = 'active'
      router.update({ ...router.options, routeLifecycle: 'automatic' })
      const current = new AbortController()
      activation = current
      const cancel = () => current.abort()
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) {
        cancel()
      }
      try {
        runRouteLifecycle(
          router,
          previousMatches,
          router.state.matches,
          lifecycleEnd(previousMatches),
          lifecycleEnd(router.state.matches),
          undefined,
          { force: true, signal: current.signal },
        )
      } finally {
        signal?.removeEventListener('abort', cancel)
        if (activation === current) {
          activation = undefined
        }
      }
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      finish()
    },
  }
  return scope
}

export type RouterExecutionScope<T extends AnyRouter = AnyRouter> = ReturnType<
  typeof createRouterExecutionScope<T>
>

/** A read projection, not another execution owner or loader cache. */
export function projectRouterExecution(target: AnyRouter, source: AnyRouter) {
  const state = source.state
  target.batch(() => {
    target.latestLocation = source.latestLocation
    target.stores.location.set(state.location)
    target.stores.resolvedLocation.set(state.resolvedLocation)
    target.stores.status.set(state.status)
    target.stores.setMatches(state.matches)
  })
}

export interface RouterDataCacheOptions {
  maxEntries?: number
  shouldCache?: (match: AnyRouter['state']['matches'][number]) => boolean
}

function replayableData(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') {
    return typeof value !== 'function' && typeof value !== 'symbol'
  }
  if (value instanceof Date) {
    return true
  }
  if (seen.has(value)) {
    return true
  }
  if (seen.size >= 10000) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    return false
  }
  seen.add(value)
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) =>
      !descriptor.get &&
      !descriptor.set &&
      replayableData(descriptor.value, seen),
  )
}

/** Accepted replayable data may outlive a view; contexts and live signals may not. */
export function createRouterDataCache(options: RouterDataCacheOptions = {}) {
  type Match = AnyRouter['state']['matches'][number] & { _flight?: unknown }
  const maximum = options.maxEntries ?? 128
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new Error('Data cache maxEntries must be a positive integer')
  }
  const records = new Map<string, Match>()
  return {
    get size() {
      return records.size
    },
    publish(router: AnyRouter) {
      for (const match of [
        ...router._cache.values(),
        ...router.state.matches,
      ] as Array<Match>) {
        if (
          match.status !== 'success' ||
          match.invalid ||
          !(options.shouldCache?.(match) ?? replayableData(match.loaderData))
        ) {
          continue
        }
        const previous = records.get(match.id)
        if (previous && previous.updatedAt > match.updatedAt) {
          continue
        }
        records.delete(match.id)
        records.set(match.id, {
          ...match,
          _flight: undefined,
          context: {},
          __beforeLoadContext: undefined,
          _ctx: undefined,
          isFetching: false,
          abortController: new AbortController(),
        })
        if (records.size > maximum) {
          records.delete(records.keys().next().value!)
        }
      }
    },
    hydrate(router: AnyRouter) {
      if (router._tx || router._committed.length || router._cache.size) {
        throw new Error('Seed data before starting an execution scope')
      }
      router._cache = new Map(
        Array.from(records, ([id, match]) => [
          id,
          { ...match, abortController: new AbortController() },
        ]),
      )
    },
    clear() {
      records.clear()
    },
  }
}
