import type { HistoryAction } from '@tanstack/history'
/** Presentation history owns visits; route definitions only describe destinations. */
export type NavigationBehavior = 'push' | 'replace' | 'reuse'
export interface NavigationEntry<T = unknown> {
  key: string
  container: string
  href: string
  identity: string
  state?: Record<string, unknown>
  value: T
}
export interface NavigationContainer {
  initialHref?: string
  title?: string
  overlay?: boolean
  parent?: string
  kind?: 'stack' | 'tabs' | 'drawer' | 'custom'
  initialChild?: string
  backBehavior?: 'history' | 'initialRoute' | 'none'
}
export interface NavigationSnapshot<T> {
  selected: string
  childHistory: Record<string, Array<string>>
  openDrawers: Array<string>
  selectedChildren: Record<string, string>
  history: Array<string>
  overlays: Array<string>
  stacks: Record<string, Array<NavigationEntry<T>>>
}
export interface NavigationRequest {
  href: string
  target?: string
  behavior?: NavigationBehavior
  identity?: string
  state?: Record<string, unknown>
  match?: 'nearest' | 'oldest'
  ignoreBlocker?: boolean
}
export interface NavigationChange<T> {
  historyAction: HistoryAction
  action: 'navigate' | 'back' | 'select' | 'reset' | 'restore' | 'drawer'
  current: NavigationSnapshot<T>
  next: NavigationSnapshot<T>
  updated: Array<{ entry: NavigationEntry<T>; previous?: NavigationEntry<T> }>
  removed: Array<NavigationEntry<T>>
  signal: AbortSignal
}
export interface NavigationOptions<T> {
  containers: Record<string, NavigationContainer>
  initialContainer: string
  rootKind?: 'stack' | 'tabs' | 'drawer' | 'custom'
  backBehavior?: 'history' | 'initialRoute' | 'none'
  maxRestoreEntries?: number
  maxSnapshotBytes?: number
  onError?: (error: unknown) => void
  prepare: (
    entry: Omit<NavigationEntry<T>, 'value'>,
    signal: AbortSignal,
  ) => Promise<{ value: T; href?: string }>
  dispose?: (entry: NavigationEntry<T>) => void
}
export interface PopToRequest {
  target?: string
  key?: string
  href?: string
  identity?: string
  match?: 'nearest' | 'oldest'
  fallback?: 'push' | 'replace' | 'none'
}

export function createNavigation<T>(options: NavigationOptions<T>) {
  const { containers } = options
  const ids = Object.keys(containers)
  function getContainer(id: string) {
    const value = Object.hasOwn(containers, id) ? containers[id] : undefined
    if (!value) {
      throw new Error(`Unknown navigation container: ${id}`)
    }
    return value
  }
  const children = new Map<string, Array<string>>()
  for (const id of ids) {
    const definition = getContainer(id)
    if (definition.parent) {
      getContainer(definition.parent)
      children.set(definition.parent, [
        ...(children.get(definition.parent) ?? []),
        id,
      ])
    }
    const ancestors = new Set([id])
    let parent = definition.parent
    while (parent) {
      if (ancestors.has(parent)) {
        throw new Error('Navigation containers must form a tree')
      }
      ancestors.add(parent)
      parent = getContainer(parent).parent
    }
  }
  const defaults: Record<string, string> = {}
  for (const id of ids) {
    const descendants = children.get(id)
    if (descendants?.length) {
      const initial = getContainer(id).initialChild ?? descendants[0]!
      if (!descendants.includes(initial)) {
        throw new Error(`Invalid initial child for ${id}`)
      }
      defaults[id] = initial
    } else if (!getContainer(id).initialHref) {
      throw new Error(`Stack ${id} requires an initial destination`)
    }
  }
  const initial = getContainer(options.initialContainer)
  if (initial.overlay || initial.parent) {
    throw new Error('Navigation requires a non-overlay root initial container')
  }
  const leaf = (
    id: string,
    state: Pick<NavigationSnapshot<T>, 'selectedChildren'>,
  ): string => {
    getContainer(id)
    while (children.has(id)) {
      id = state.selectedChildren[id]!
    }
    return id
  }
  const rootOf = (id: string): string => {
    let parent = getContainer(id).parent
    while (parent) {
      id = parent
      parent = getContainer(id).parent
    }
    return id
  }
  let snapshot: NavigationSnapshot<T> = {
    selected: options.initialContainer,
    childHistory: Object.fromEntries(
      Object.entries(defaults).map(([id, child]) => [id, [child]]),
    ),
    openDrawers: [],
    selectedChildren: { ...defaults },
    overlays: [],
    history: [],
    stacks: Object.fromEntries(ids.map((id) => [id, []])),
  }
  snapshot.history = [leaf(snapshot.selected, snapshot)]
  snapshot.childHistory.$root = [snapshot.selected]
  function retireContainers(
    state: NavigationSnapshot<T>,
    retired: Array<string>,
  ) {
    const next = {
      ...state,
      stacks: { ...state.stacks },
      selectedChildren: { ...state.selectedChildren },
      childHistory: { ...state.childHistory },
      openDrawers: state.openDrawers.filter((id) => !retired.includes(id)),
    }
    for (const id of retired) {
      next.stacks[id] = []
      if (defaults[id]) {
        next.selectedChildren[id] = defaults[id]!
        next.childHistory[id] = [defaults[id]]
      }
    }
    return next
  }
  let sequence = 0
  let disposed = false
  let owner: AbortController | undefined
  const listeners = new Set<() => void>()
  const events = new Set<(change: NavigationChange<T>) => void>()
  const blockers = new Map<
    string,
    Set<(change: NavigationChange<T>) => boolean | Promise<boolean>>
  >()
  const report = (error: unknown) => {
    if (options.onError) {
      options.onError(error)
    } else {
      console.error(error)
    }
  }
  const notify = (listener: () => void) => {
    try {
      listener()
    } catch (error) {
      report(error)
    }
  }
  const release = (entry: NavigationEntry<T>) => {
    try {
      options.dispose?.(entry)
    } catch (error) {
      report(error)
    }
  }
  function top(state = snapshot) {
    const id = leaf(state.overlays.at(-1) ?? state.selected, state)
    return state.stacks[id]!.at(-1)
  }
  function focus(state: NavigationSnapshot<T>, target: string, record = true) {
    getContainer(target)
    const selectedChildren = { ...state.selectedChildren }
    const childHistory = { ...state.childHistory }
    let id = target
    let parent = getContainer(id).parent
    while (parent) {
      if (selectedChildren[parent] !== id) {
        childHistory[parent] = [
          ...(childHistory[parent] ?? []).filter((child) => child !== id),
          id,
        ]
      }
      selectedChildren[parent] = id
      id = parent
      parent = getContainer(id).parent
    }
    const focused = leaf(target, { selectedChildren })
    if (getContainer(id).overlay) {
      return {
        ...state,
        childHistory,
        selectedChildren,
        overlays: state.overlays.includes(id)
          ? state.overlays.slice(0, state.overlays.indexOf(id) + 1)
          : [...state.overlays, id],
        stacks: {
          ...state.stacks,
          ...Object.fromEntries(
            ids
              .filter(
                (child) =>
                  state.overlays
                    .slice(state.overlays.indexOf(id) + 1)
                    .includes(rootOf(child)) && state.overlays.includes(id),
              )
              .map((child) => [child, []]),
          ),
        },
      }
    }
    return {
      ...state,
      selected: id,
      childHistory: {
        ...childHistory,
        $root:
          state.selected === id
            ? childHistory.$root!
            : [...childHistory.$root!.filter((child) => child !== id), id],
      },
      openDrawers: [],
      selectedChildren,
      history: record
        ? [...state.history.filter((item) => item !== focused), focused]
        : state.history,
    }
  }
  async function transact(
    action: NavigationChange<T>['action'],
    plan: (
      signal: AbortSignal,
      created: Array<NavigationEntry<T>>,
    ) => Promise<NavigationSnapshot<T>>,
    ignoreBlocker = false,
    historyAction: HistoryAction = action === 'back' ? 'BACK' : 'REPLACE',
  ): Promise<boolean> {
    if (disposed) {
      return false
    }
    const previous = owner
    const transaction = new AbortController()
    owner = transaction
    previous?.abort()
    const created: Array<NavigationEntry<T>> = []
    let committed = new Set<NavigationEntry<T>>()
    try {
      if (transaction.signal.aborted) {
        return false
      }
      const next = await plan(transaction.signal, created)
      if (transaction.signal.aborted) {
        return false
      }
      const current = snapshot
      // Only changed stacks participate. Switching a tab never scans unrelated visits.
      const changed = ids.filter((id) => current.stacks[id] !== next.stacks[id])
      const remaining = new Map(
        changed
          .flatMap((id) => next.stacks[id]!)
          .map((entry) => [entry.key, entry]),
      )
      const previousEntries = changed.flatMap((id) => current.stacks[id]!)
      const removed = previousEntries.filter(
        (entry) => !remaining.has(entry.key),
      )
      const previousByKey = new Map(
        previousEntries.map((entry) => [entry.key, entry]),
      )
      const updated = Array.from(remaining.values()).flatMap((entry) => {
        const previous = previousByKey.get(entry.key)
        return previous?.value === entry.value ? [] : [{ entry, previous }]
      })
      const change: NavigationChange<T> = {
        action,
        historyAction,
        current,
        next,
        removed,
        updated,
        signal: transaction.signal,
      }
      if (!ignoreBlocker) {
        for (const entry of removed) {
          for (const block of blockers.get(entry.key) ?? []) {
            let abort!: () => void
            const cancelled = new Promise<boolean>((resolve) => {
              abort = () => resolve(true)
              transaction.signal.addEventListener('abort', abort, {
                once: true,
              })
            })
            try {
              if (await Promise.race([block(change), cancelled])) {
                return false
              }
            } finally {
              transaction.signal.removeEventListener('abort', abort)
            }
            if (transaction.signal.aborted) {
              return false
            }
          }
        }
      }
      committed = new Set(remaining.values())
      snapshot = next
      for (const listener of listeners) {
        notify(listener)
      }
      for (const listener of events) {
        notify(() => listener(change))
      }
      for (const entry of removed) {
        blockers.delete(entry.key)
        release(entry)
      }
      for (const entry of previousEntries) {
        const replacement = remaining.get(entry.key)
        if (replacement && replacement.value !== entry.value) {
          release(entry)
        }
      }
      return true
    } catch (error) {
      if (transaction.signal.aborted) {
        return false
      }
      throw error
    } finally {
      for (const entry of created) {
        if (!committed.has(entry)) {
          release(entry)
        }
      }
      if (owner === transaction) {
        owner = undefined
      }
    }
  }
  async function prepare(
    href: string,
    container: string,
    identity: string,
    signal: AbortSignal,
    created: Array<NavigationEntry<T>>,
    state?: Record<string, unknown>,
  ) {
    const metadata = {
      key: `entry-${++sequence}`,
      container,
      href,
      identity,
      state,
    }
    const result = await options.prepare(metadata, signal)
    const entry = {
      ...metadata,
      href: result.href ?? href,
      value: result.value,
    }
    created.push(entry)
    return entry
  }
  async function prepareAll(
    entries: Array<{
      href: string
      identity: string
      state?: Record<string, unknown>
    }>,
    container: string,
    signal: AbortSignal,
    created: Array<NavigationEntry<T>>,
  ) {
    const results = await Promise.allSettled(
      entries.map((entry) =>
        prepare(
          entry.href,
          container,
          entry.identity,
          signal,
          created,
          entry.state,
        ),
      ),
    )
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') {
      throw failed.reason
    }
    return results.map(
      (result) => (result as PromiseFulfilledResult<NavigationEntry<T>>).value,
    )
  }
  const identityOf = (href: string) => href.split(/[?#]/, 1)[0]!
  async function ensure(
    state: NavigationSnapshot<T>,
    target: string,
    signal: AbortSignal,
    created: Array<NavigationEntry<T>>,
  ) {
    const id = leaf(target, state)
    if (state.stacks[id]!.length) {
      return state
    }
    const href = getContainer(id).initialHref!
    const entry = await prepare(href, id, identityOf(href), signal, created)
    return { ...state, stacks: { ...state.stacks, [id]: [entry] } }
  }
  function backDestination(target: string, bubble = true) {
    getContainer(target)
    target = leaf(target, snapshot)
    if (snapshot.openDrawers.length) {
      return { target, drawer: snapshot.openDrawers.at(-1)! }
    }
    if (snapshot.stacks[target]!.length > 1) {
      return { target }
    }
    const root = rootOf(target)
    if (getContainer(root).overlay && snapshot.overlays.includes(root)) {
      return { target, overlay: root }
    }
    if (bubble) {
      let child = target
      let parent = getContainer(child).parent
      while (true) {
        const id = parent ?? '$root'
        const kind = parent ? getContainer(parent).kind : options.rootKind
        const history = snapshot.childHistory[id] ?? []
        if (kind === 'stack' && history.length > 1) {
          return {
            target,
            destination: leaf(history.at(-2)!, snapshot),
            branch: id,
            departing: child,
          }
        }
        const behavior =
          (parent ? getContainer(parent).backBehavior : undefined) ??
          options.backBehavior ??
          'initialRoute'
        const destination =
          behavior === 'history'
            ? history
                .slice(0, -1)
                .reverse()
                .find((id) => snapshot.stacks[leaf(id, snapshot)]!.length)
            : behavior === 'initialRoute'
              ? parent
                ? defaults[id]
                : options.initialContainer
              : undefined
        if (destination && destination !== child) {
          return {
            target,
            destination: leaf(destination, snapshot),
            historyBranch: id,
            historyChild: destination,
            initial: behavior === 'initialRoute',
          }
        }
        if (!parent) {
          break
        }
        child = parent
        parent = getContainer(child).parent
      }
    }
    return undefined
  }
  const api = {
    cancelPending() {
      const pending = owner
      owner = undefined
      pending?.abort()
      return !!pending
    },
    getSnapshot: () => snapshot,
    getActiveEntry: (state = snapshot) => top(state),
    getChildren: (id?: string) =>
      id
        ? (children.get(id) ?? [])
        : ids.filter(
            (item) => !getContainer(item).parent && !getContainer(item).overlay,
          ),
    getFocusedContainer: () =>
      leaf(snapshot.overlays.at(-1) ?? snapshot.selected, snapshot),
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    onChange(listener: (change: NavigationChange<T>) => void) {
      events.add(listener)
      return () => {
        events.delete(listener)
      }
    },
    async initialize(): Promise<boolean> {
      return top() ? true : api.select(snapshot.selected)
    },
    navigate(request: NavigationRequest): Promise<boolean> {
      return transact(
        'navigate',
        async (signal, created) => {
          const target = leaf(
            request.target ?? top()?.container ?? snapshot.selected,
            snapshot,
          )
          getContainer(target)
          let state = snapshot
          let stack = state.stacks[target]!
          const identity = request.identity ?? identityOf(request.href)
          const behavior = request.behavior ?? 'push'
          if (behavior === 'reuse') {
            let found = -1
            for (let index = 0; index < stack.length; index++) {
              if (stack[index]!.identity === identity) {
                found = index
                if (request.match === 'oldest') {
                  break
                }
              }
            }
            if (found >= 0) {
              const entry = stack[found]!
              const replacement =
                entry.href === request.href && request.state === undefined
                  ? entry
                  : await prepare(
                      request.href,
                      target,
                      identity,
                      signal,
                      created,
                      request.state ?? entry.state,
                    )
              replacement.key = entry.key
              return focus(
                {
                  ...state,
                  stacks: {
                    ...state.stacks,
                    [target]: [...stack.slice(0, found), replacement],
                  },
                },
                target,
              )
            }
          }
          if (
            !stack.length &&
            !getContainer(rootOf(target)).overlay &&
            request.href !== getContainer(target).initialHref
          ) {
            state = await ensure(state, target, signal, created)
            stack = state.stacks[target]!
          }
          const entry = await prepare(
            request.href,
            target,
            identity,
            signal,
            created,
            request.state,
          )
          return focus(
            {
              ...state,
              stacks: {
                ...state.stacks,
                [target]: [
                  ...(behavior === 'replace' ? stack.slice(0, -1) : stack),
                  entry,
                ],
              },
            },
            target,
          )
        },
        request.ignoreBlocker,
        request.behavior === 'replace'
          ? 'REPLACE'
          : request.behavior === 'reuse'
            ? 'BACK'
            : 'PUSH',
      )
    },
    select(target: string): Promise<boolean> {
      getContainer(target)
      if (getContainer(rootOf(target)).overlay) {
        throw new Error('Select a container; navigate to an overlay')
      }
      return transact('select', async (signal, created) =>
        focus(await ensure(snapshot, target, signal, created), target),
      )
    },
    canGoBack({
      target = top()?.container ?? snapshot.selected,
      bubble = true,
    } = {}) {
      return !!backDestination(target, bubble)
    },
    back({
      target = top()?.container ?? snapshot.selected,
      count = 1,
      bubble = true,
      ignoreBlocker = false,
    } = {}): Promise<boolean> {
      if (!Number.isInteger(count) || count < 1) {
        throw new Error('Back count must be a positive integer')
      }
      const destination = backDestination(target, bubble)
      if (!destination) {
        return Promise.resolve(false)
      }
      return transact(
        'back',
        async (signal, created) => {
          const { target, overlay } = destination
          if (destination.drawer) {
            return {
              ...snapshot,
              openDrawers: snapshot.openDrawers.filter(
                (id) => id !== destination.drawer,
              ),
            }
          }
          if (destination.destination) {
            const next = focus(
              await ensure(snapshot, destination.destination, signal, created),
              destination.destination,
              false,
            )
            if (destination.historyBranch) {
              return {
                ...next,
                history: [
                  ...snapshot.history.filter(
                    (id) => id !== target && id !== destination.destination,
                  ),
                  destination.destination,
                ],
                childHistory: {
                  ...next.childHistory,
                  [destination.historyBranch]: destination.initial
                    ? [destination.historyChild]
                    : snapshot.childHistory[destination.historyBranch]!.slice(
                        0,
                        snapshot.childHistory[
                          destination.historyBranch
                        ]!.indexOf(destination.historyChild) + 1,
                      ),
                },
              }
            }
            if (destination.branch && destination.departing) {
              const belongs = (id: string) => {
                while (id !== destination.departing) {
                  const parent = getContainer(id).parent
                  if (!parent) {
                    return false
                  }
                  id = parent
                }
                return true
              }
              return retireContainers(
                {
                  ...next,
                  history: snapshot.history.filter((id) => !belongs(id)),
                  childHistory: {
                    ...next.childHistory,
                    [destination.branch]: snapshot.childHistory[
                      destination.branch
                    ]!.slice(0, -1),
                  },
                },
                ids.filter(belongs),
              )
            }
            return { ...next, history: snapshot.history.slice(0, -1) }
          }
          const stack = snapshot.stacks[target]!
          if (overlay && stack.length <= count) {
            const descendants = ids.filter((id) => rootOf(id) === overlay)
            return retireContainers(
              {
                ...snapshot,
                overlays: snapshot.overlays.filter((id) => id !== overlay),
              },
              descendants,
            )
          }
          return {
            ...snapshot,
            stacks: {
              ...snapshot.stacks,
              [target]: stack.slice(0, Math.max(1, stack.length - count)),
            },
          }
        },
        ignoreBlocker,
      )
    },
    popTo(request: PopToRequest): Promise<boolean> {
      const target = leaf(
        request.target ?? top()?.container ?? snapshot.selected,
        snapshot,
      )
      const stack = snapshot.stacks[target]!
      const ordered = request.match === 'oldest' ? stack : [...stack].reverse()
      const entry = ordered.find((entry) =>
        request.key
          ? entry.key === request.key
          : entry.identity ===
            (request.identity ?? identityOf(request.href ?? '')),
      )
      if (entry) {
        const index = stack.indexOf(entry)
        return transact('back', async () =>
          focus(
            {
              ...snapshot,
              stacks: {
                ...snapshot.stacks,
                [target]: stack.slice(0, index + 1),
              },
            },
            target,
          ),
        )
      }
      if (!request.href || request.fallback === 'none') {
        return Promise.resolve(false)
      }
      return api.navigate({
        href: request.href,
        target,
        behavior: request.fallback ?? 'replace',
        identity: request.identity,
      })
    },
    popToTop({
      target = top()?.container ?? snapshot.selected,
    } = {}): Promise<boolean> {
      target = leaf(target, snapshot)
      const entry = snapshot.stacks[target]![0]
      return entry
        ? api.popTo({ target, key: entry.key })
        : Promise.resolve(false)
    },
    setDrawerOpen(target: string, open: boolean): Promise<boolean> {
      if (target !== '$root' && getContainer(target).kind !== 'drawer') {
        throw new Error('Target is not a drawer')
      }
      if (target === '$root' && options.rootKind !== 'drawer') {
        throw new Error('Root is not a drawer')
      }
      return transact('drawer', async () => ({
        ...snapshot,
        openDrawers: open
          ? [...snapshot.openDrawers.filter((id) => id !== target), target]
          : snapshot.openDrawers.filter((id) => id !== target),
      }))
    },
    reset(target: string, hrefs: Array<string>): Promise<boolean> {
      target = leaf(target, snapshot)
      if (!hrefs.length && !getContainer(rootOf(target)).overlay) {
        throw new Error('A stack must retain a root entry')
      }
      return transact('reset', async (signal, created) => {
        const entries = await prepareAll(
          hrefs.map((href) => ({ href, identity: identityOf(href) })),
          target,
          signal,
          created,
        )
        return {
          ...snapshot,
          overlays: entries.length
            ? snapshot.overlays
            : snapshot.overlays.filter((id) => id !== rootOf(target)),
          stacks: { ...snapshot.stacks, [target]: entries },
        }
      })
    },
    acknowledgeNativeDismiss(key: string): Promise<boolean> {
      const entry = Object.values(snapshot.stacks)
        .flat()
        .find((entry) => entry.key === key)
      if (!entry) {
        return Promise.resolve(false)
      }
      const stack = snapshot.stacks[entry.container]!
      return api.back({
        target: entry.container,
        count: stack.length - stack.indexOf(entry),
        bubble: false,
        // Prevention belongs to the native host before UIKit removes a view.
        // An acknowledgement must reflect an already completed removal.
        ignoreBlocker: true,
      })
    },
    block(
      key: string,
      blocker: (change: NavigationChange<T>) => boolean | Promise<boolean>,
    ) {
      const registered = blockers.get(key) ?? new Set()
      registered.add(blocker)
      blockers.set(key, registered)
      snapshot = { ...snapshot }
      for (const listener of listeners) {
        notify(listener)
      }
      return () => {
        registered.delete(blocker)
        if (!registered.size) {
          blockers.delete(key)
        }
        snapshot = { ...snapshot }
        for (const listener of listeners) {
          notify(listener)
        }
      }
    },
    isRemovalBlocked: (key: string) => blockers.has(key),
    serialize() {
      return JSON.stringify({
        version: 3,
        selected: snapshot.selected,
        selectedChildren: snapshot.selectedChildren,
        childHistory: snapshot.childHistory,
        overlays: snapshot.overlays,
        history: snapshot.history,
        stacks: Object.fromEntries(
          Object.entries(snapshot.stacks).map(([id, entries]) => [
            id,
            entries.map(({ href, identity, state }) => ({
              href,
              identity,
              state,
            })),
          ]),
        ),
      })
    },
    restore(serialized: string): Promise<boolean> {
      if (serialized.length > (options.maxSnapshotBytes ?? 1024 * 1024)) {
        throw new Error('Navigation snapshot exceeds size limit')
      }
      const data = JSON.parse(serialized)
      if (
        !data ||
        ![1, 2, 3].includes(data.version) ||
        typeof data.selected !== 'string' ||
        !data.stacks ||
        typeof data.stacks !== 'object' ||
        Array.isArray(data.stacks)
      ) {
        throw new Error('Invalid navigation snapshot')
      }
      const selected = getContainer(data.selected)
      if (selected.overlay || selected.parent) {
        throw new Error('Invalid selected navigation container')
      }
      const selectedChildren = { ...defaults, ...data.selectedChildren }
      for (const [id, child] of Object.entries(selectedChildren)) {
        if (!children.get(id)?.includes(child as string)) {
          throw new Error('Invalid selected child')
        }
      }
      let count = 0
      for (const [id, entries] of Object.entries(data.stacks)) {
        getContainer(id)
        if (
          !Array.isArray(entries) ||
          entries.some(
            (entry) =>
              typeof entry?.href !== 'string' ||
              typeof entry?.identity !== 'string' ||
              (entry.state !== undefined &&
                (!entry.state ||
                  typeof entry.state !== 'object' ||
                  Array.isArray(entry.state))),
          )
        ) {
          throw new Error('Invalid navigation entries')
        }
        count += entries.length
      }
      if (count > (options.maxRestoreEntries ?? 1000)) {
        throw new Error('Navigation snapshot exceeds entry limit')
      }
      const focused = leaf(data.selected, { selectedChildren })
      if (!data.stacks[focused]?.length) {
        throw new Error('The selected stack must have a root entry')
      }
      const overlays: Array<string> =
        data.overlays ??
        ids.filter(
          (id) =>
            getContainer(id).overlay &&
            data.stacks[leaf(id, { selectedChildren })]?.length,
        )
      if (
        !Array.isArray(overlays) ||
        new Set(overlays).size !== overlays.length ||
        overlays.some(
          (id) =>
            !getContainer(id).overlay ||
            !data.stacks[leaf(id, { selectedChildren })]?.length,
        )
      ) {
        throw new Error('Invalid overlay history')
      }
      const history: Array<string> = data.history ?? [focused]
      if (
        !Array.isArray(history) ||
        !history.length ||
        history.some(
          (id) => children.has(id) || getContainer(rootOf(id)).overlay,
        ) ||
        history.at(-1) !== focused
      ) {
        throw new Error('Invalid container history')
      }
      const rootHistory = new Map<string, true>()
      for (const id of history) {
        const root = rootOf(id)
        rootHistory.delete(root)
        rootHistory.set(root, true)
      }
      const childHistory: Record<string, Array<string>> = {
        ...Object.fromEntries([
          ...Object.entries(selectedChildren).map(([id, child]) => [
            id,
            [child],
          ]),
          ['$root', Array.from(rootHistory.keys())],
        ]),
        ...data.childHistory,
      }
      for (const [id, items] of Object.entries(childHistory)) {
        const allowed = id === '$root' ? api.getChildren() : children.get(id)
        if (
          !allowed ||
          !Array.isArray(items) ||
          !items.length ||
          new Set(items).size !== items.length ||
          items.some((child) => !allowed.includes(child)) ||
          items.at(-1) !==
            (id === '$root' ? data.selected : selectedChildren[id])
        ) {
          throw new Error('Invalid child navigation history')
        }
      }
      return transact('restore', async (signal, created) => {
        const results = await Promise.allSettled(
          ids.map(
            async (id) =>
              [
                id,
                await prepareAll(data.stacks[id] ?? [], id, signal, created),
              ] as const,
          ),
        )
        const failed = results.find((result) => result.status === 'rejected')
        if (failed?.status === 'rejected') {
          throw failed.reason
        }
        return {
          selected: data.selected,
          childHistory,
          openDrawers: [],
          selectedChildren,
          overlays,
          history,
          stacks: Object.fromEntries(
            results.map(
              (result) =>
                (
                  result as PromiseFulfilledResult<
                    readonly [string, Array<NavigationEntry<T>>]
                  >
                ).value,
            ),
          ),
        }
      })
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      const current = snapshot
      snapshot = {
        ...snapshot,
        overlays: [],
        stacks: Object.fromEntries(ids.map((id) => [id, []])),
      }
      owner?.abort()
      for (const entry of Object.values(current.stacks).flat()) {
        release(entry)
      }
      listeners.clear()
      blockers.clear()
      events.clear()
    },
  }
  return api
}
export type Navigation<T> = ReturnType<typeof createNavigation<T>>
