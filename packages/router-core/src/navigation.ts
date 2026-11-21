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
  navigator?: Navigation<T>
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
export interface NavigationActivation {
  target?: string
  key?: string
  descend?: boolean
  request?: NavigationRequest
}

type ActivationResolver<T> = (navigation: Navigation<T>) => NavigationActivation
interface NavigationHost<T> {
  commit: (state: NavigationSnapshot<T>) => void
  publish: (change: NavigationChange<T>) => void
  plan: (
    instruction: NavigationActivation,
    resolve: ActivationResolver<T>,
    signal: AbortSignal,
    created: Array<NavigationEntry<T>>,
    staged: Map<Navigation<T>, NavigationSnapshot<T>>,
  ) => Promise<void>
}

export interface NavigationChange<T> {
  historyAction: HistoryAction
  action: 'navigate' | 'back' | 'select' | 'reset' | 'restore' | 'drawer'
  destination?: NavigationEntry<T>
  current: NavigationSnapshot<T>
  next: NavigationSnapshot<T>
  updated: Array<{ entry: NavigationEntry<T>; previous?: NavigationEntry<T> }>
  removed: Array<NavigationEntry<T>>
  signal: AbortSignal
}
export interface NavigationDefinition {
  initialLocation?: NavigationRequest
  containers: Record<string, NavigationContainer>
  initialContainer: string
  rootKind?: 'stack' | 'tabs' | 'drawer' | 'custom'
  backBehavior?: 'history' | 'initialRoute' | 'none'
}
export interface NavigationOptions<T> {
  initialLocation?: NavigationRequest
  containers: Record<string, NavigationContainer>
  initialContainer: string
  rootKind?: 'stack' | 'tabs' | 'drawer' | 'custom'
  backBehavior?: 'history' | 'initialRoute' | 'none'
  maxRestoreEntries?: number
  maxSnapshotBytes?: number
  onError?: (error: unknown) => void
  prepare: (
    entry: Omit<NavigationEntry<T>, 'value' | 'navigator'> & {
      parent?: NavigationEntry<T>
    },
    signal: AbortSignal,
  ) => Promise<{ value: T; href?: string }>
  getNavigator?: (entry: NavigationEntry<T>) => NavigationDefinition | undefined
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

interface Coordinator<T> {
  hosts: Map<Navigation<T>, NavigationHost<T>>
  owner?: AbortController
  events: Set<(navigation: Navigation<T>, change: NavigationChange<T>) => void>
  blockers: Map<
    string,
    Set<(change: NavigationChange<T>) => boolean | Promise<boolean>>
  >
  sequence: number
  blockerOwners: Map<string, Array<string>>
  blockedAncestors: Map<string, number>
  touches: Map<Navigation<T>, () => void>
  restoreCounts: WeakMap<AbortSignal, { entries: number }>
  entries: Map<string, { entry: NavigationEntry<T>; navigation: Navigation<T> }>
}
const preparations = new WeakMap<
  object,
  (
    signal: AbortSignal,
    serialized?: unknown,
    previous?: Navigation<unknown>,
  ) => Promise<void>
>()
const snapshots = new WeakMap<object, () => unknown>()
const definitions = new WeakMap<object, NavigationDefinition>()

export function createNavigation<T>(
  options: NavigationOptions<T>,
): Navigation<T> {
  return createNavigator(options, {
    hosts: new Map(),
    events: new Set(),
    blockers: new Map(),
    sequence: 0,
    blockerOwners: new Map(),
    blockedAncestors: new Map(),
    touches: new Map(),
    restoreCounts: new WeakMap(),
    entries: new Map(),
  })
}
function createNavigator<T>(
  options: NavigationOptions<T>,
  coordinator: Coordinator<T>,
  parent?: { navigation: Navigation<T>; entry: NavigationEntry<T> },
): Navigation<T> {
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
  let disposed = false
  const listeners = new Set<() => void>()
  const events = new Set<(change: NavigationChange<T>) => void>()
  const treeListeners = new Set<
    (navigation: Navigation<T>, change: NavigationChange<T>) => void
  >()
  const blockers = coordinator.blockers
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
  function removeBlocker(key: string) {
    blockers.delete(key)
    for (const ancestor of coordinator.blockerOwners.get(key) ?? []) {
      const count = coordinator.blockedAncestors.get(ancestor)! - 1
      if (count) {
        coordinator.blockedAncestors.set(ancestor, count)
      } else {
        coordinator.blockedAncestors.delete(ancestor)
      }
    }
    coordinator.blockerOwners.delete(key)
  }
  const released = options.getNavigator
    ? new WeakSet<NavigationEntry<T>>()
    : undefined
  const release = (entry: NavigationEntry<T>) => {
    if (released?.has(entry)) {
      return
    }
    released?.add(entry)
    entry.navigator?.dispose()
    if (coordinator.entries.size || blockers.size) {
      const indexed = coordinator.entries.get(entry.key)
      if (!indexed || indexed.entry === entry) {
        coordinator.entries.delete(entry.key)
        removeBlocker(entry.key)
      }
    }
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
  function live() {
    return (
      !disposed &&
      (!parent ||
        parent.navigation
          .getSnapshot()
          .stacks[
            parent.entry.container
          ]?.some((entry) => entry.navigator === api))
    )
  }
  function register(entry: NavigationEntry<T>, navigation: Navigation<T>) {
    coordinator.entries.set(entry.key, { entry, navigation })
    for (const child of Object.values(
      entry.navigator?.getSnapshot().stacks ?? {},
    ).flat()) {
      register(child, entry.navigator!)
    }
  }
  async function planNavigate(
    request: NavigationRequest,
    initial: NavigationSnapshot<T>,
    signal: AbortSignal,
    created: Array<NavigationEntry<T>>,
  ) {
    const target = leaf(
      request.target ?? top(initial)?.container ?? initial.selected,
      initial,
    )
    getContainer(target)
    let state = initial
    const stack = state.stacks[target]!
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
                undefined,
                entry,
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
      return planNavigate(request, state, signal, created)
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
  }

  async function planActivation(
    instruction: NavigationActivation,
    resolve: ActivationResolver<T>,
    signal: AbortSignal,
    created: Array<NavigationEntry<T>>,
    staged: Map<Navigation<T>, NavigationSnapshot<T>>,
  ) {
    if (signal.aborted) {
      return
    }
    const target = leaf(instruction.target ?? snapshot.selected, snapshot)
    let next = snapshot
    if (instruction.key) {
      const stack = next.stacks[target]!
      const index = stack.findIndex((entry) => entry.key === instruction.key)
      if (index < 0) {
        throw new Error('Navigation owner is no longer attached')
      }
      if (index < stack.length - 1) {
        next = {
          ...next,
          stacks: { ...next.stacks, [target]: stack.slice(0, index + 1) },
        }
      }
    }
    if (!getContainer(rootOf(target)).overlay && next.overlays.length) {
      const overlays = next.overlays
      next = retireContainers(
        { ...next, overlays: [] },
        ids.filter((id) => overlays.includes(rootOf(id))),
      )
    }
    if (instruction.descend) {
      next = await ensure(next, target, signal, created)
      if (signal.aborted) {
        return
      }
      const child = next.stacks[target]!.at(-1)?.navigator
      if (child) {
        await coordinator.hosts
          .get(child)!
          .plan(resolve(child), resolve, signal, created, staged)
      } else if (instruction.request) {
        next = await planNavigate(
          { ...instruction.request, target },
          next,
          signal,
          created,
        )
      }
    } else if (instruction.request) {
      next = await planNavigate(
        { ...instruction.request, target },
        next,
        signal,
        created,
      )
    } else {
      next = await ensure(next, target, signal, created)
    }
    staged.set(api, focus(next, target))
  }

  async function transact(
    action: NavigationChange<T>['action'],
    plan: (
      signal: AbortSignal,
      created: Array<NavigationEntry<T>>,
    ) => Promise<
      NavigationSnapshot<T> | Map<Navigation<T>, NavigationSnapshot<T>>
    >,
    ignoreBlocker = false,
    historyAction: HistoryAction | (() => HistoryAction) = action === 'back'
      ? 'BACK'
      : 'REPLACE',
  ): Promise<boolean> {
    if (disposed || (parent && !live())) {
      return false
    }
    const previous = coordinator.owner
    const transaction = new AbortController()
    coordinator.owner = transaction
    previous?.abort()
    const created: Array<NavigationEntry<T>> = []
    let committed = new Set<NavigationEntry<T>>()
    try {
      if (transaction.signal.aborted) {
        return false
      }
      const planned = await plan(transaction.signal, created)
      if (transaction.signal.aborted) {
        return false
      }
      const staged =
        planned instanceof Map ? planned : new Map([[api, planned]])
      const changes = Array.from(staged, ([navigation, next]) => {
        const current = navigation.getSnapshot()
        const changed = Object.keys(current.stacks).filter(
          (id) => current.stacks[id] !== next.stacks[id],
        )
        const remaining = new Map(
          changed
            .flatMap((id) => next.stacks[id]!)
            .map((entry) => [entry.key, entry]),
        )
        const previousEntries = changed.flatMap((id) => current.stacks[id]!)
        const previousByKey = new Map(
          previousEntries.map((entry) => [entry.key, entry]),
        )
        const change: NavigationChange<T> = {
          action,
          historyAction:
            typeof historyAction === 'function'
              ? historyAction()
              : historyAction,
          current,
          next,
          signal: transaction.signal,
          removed: previousEntries.filter((entry) => !remaining.has(entry.key)),
          updated: Array.from(remaining.values()).flatMap((entry) => {
            const previous = previousByKey.get(entry.key)
            return previous?.value === entry.value ? [] : [{ entry, previous }]
          }),
        }
        return {
          navigation,
          host: coordinator.hosts.get(navigation)!,
          remaining,
          previousEntries,
          change,
        }
      })
      if (planned instanceof Map) {
        let root: Navigation<T> = api
        while (root.getOwner() && staged.has(root.getOwner()!.navigation)) {
          root = root.getOwner()!.navigation
        }
        let destination: NavigationEntry<T> | undefined
        let branch: Navigation<T> | undefined = root
        while (branch) {
          const state: NavigationSnapshot<T> =
            staged.get(branch) ?? branch.getSnapshot()
          let target = state.overlays.at(-1) ?? state.selected
          while (state.selectedChildren[target]) {
            target = state.selectedChildren[target]!
          }
          destination = state.stacks[target]?.at(-1)
          branch = destination?.navigator
        }
        for (const { change } of changes) {
          change.destination = destination
        }
      }
      if (!ignoreBlocker && blockers.size) {
        const checked = new Set<string>()
        const retained = (
          entry: NavigationEntry<T>,
        ): Array<NavigationEntry<T>> => [
          entry,
          ...Object.values(
            entry.navigator
              ? (staged.get(entry.navigator) ?? entry.navigator.getSnapshot())
                  .stacks
              : {},
          )
            .flat()
            .flatMap(retained),
        ]
        for (const { remaining, previousEntries, change } of changes) {
          const nextKeys = new Set(
            Array.from(remaining.values())
              .flatMap(retained)
              .map((entry) => entry.key),
          )
          for (const entry of previousEntries
            .flatMap(descendants)
            .filter((entry) => !nextKeys.has(entry.key))) {
            if (checked.has(entry.key)) {
              continue
            }
            checked.add(entry.key)
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
      }
      committed = new Set(
        changes.flatMap(({ remaining }) => Array.from(remaining.values())),
      )
      // Publish every snapshot before notifying observers or activating route lifecycle.
      for (const { navigation, host, change, remaining } of changes) {
        host.commit(change.next)
        if (options.getNavigator || blockers.size) {
          for (const entry of remaining.values()) {
            register(entry, navigation)
          }
        }
      }
      for (const { host, change } of changes) {
        host.publish(change)
      }
      const touched = new Set(staged.keys())
      for (const { navigation } of changes) {
        let ancestor = navigation.getOwner()
        while (ancestor) {
          if (!touched.has(ancestor.navigation)) {
            touched.add(ancestor.navigation)
            coordinator.touches.get(ancestor.navigation)?.()
          }
          ancestor = ancestor.navigation.getOwner()
        }
      }
      const change = changes.find((item) => item.navigation === api)!.change
      const updated = new Map(
        changes
          .flatMap(({ change }) => change.updated)
          .flatMap(({ entry, previous }) => [
            { entry, previous },
            ...(entry.navigator?.getEntries().map((child) => ({
              entry: child,
              previous: previous?.navigator
                ?.getEntries()
                .find((old) => old.key === child.key),
            })) ?? []),
          ])
          .map((item) => [item.entry.key, item]),
      )
      for (const listener of coordinator.events) {
        notify(() =>
          listener(api, {
            ...change,
            updated: Array.from(updated.values()),
            removed: changes.flatMap(({ change }) => change.removed),
          }),
        )
      }
      for (const { previousEntries, remaining, change } of changes) {
        for (const entry of change.removed) {
          release(entry)
        }
        for (const entry of previousEntries) {
          const replacement = remaining.get(entry.key)
          if (replacement && replacement.value !== entry.value) {
            release(entry)
          }
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
      if (coordinator.owner === transaction) {
        coordinator.owner = undefined
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
    serializedNavigator?: unknown,
    previous?: NavigationEntry<T>,
  ) {
    const metadata = {
      key: previous?.key ?? `entry-${++coordinator.sequence}`,
      container,
      href,
      identity,
      state,
    }
    const result = await options.prepare(
      parent ? { ...metadata, parent: parent.entry } : metadata,
      signal,
    )
    const entry: NavigationEntry<T> = {
      ...metadata,
      href: result.href ?? href,
      value: result.value,
    }
    created.push(entry)
    const definition = options.getNavigator?.(entry)
    if (definition) {
      let ancestor = parent
      let depth = 0
      while (ancestor) {
        depth++
        ancestor = ancestor.navigation.getOwner()
      }
      if (depth >= 64) {
        throw new Error('Navigation nesting exceeds depth limit')
      }
      entry.navigator = createNavigator(
        {
          ...options,
          ...definition,
          rootKind: definition.rootKind,
          backBehavior: definition.backBehavior,
          initialLocation: definition.initialLocation,
        },
        coordinator,
        { navigation: api, entry },
      )
      await preparations.get(entry.navigator)!(
        signal,
        serializedNavigator,
        previous?.navigator as Navigation<unknown> | undefined,
      )
    }
    return entry
  }
  async function prepareAll(
    entries: Array<{
      href: string
      identity: string
      state?: Record<string, unknown>
      navigator?: unknown
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
          entry.navigator,
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
  const descendants = (
    entry: NavigationEntry<T>,
  ): Array<NavigationEntry<T>> => [
    entry,
    ...(entry.navigator?.getEntries() ?? []),
  ]
  function planRestore(serialized: unknown) {
    if (
      typeof serialized === 'string' &&
      serialized.length > (options.maxSnapshotBytes ?? 1024 * 1024)
    ) {
      throw new Error('Navigation snapshot exceeds size limit')
    }
    const data =
      typeof serialized === 'string'
        ? JSON.parse(serialized)
        : (serialized as any)
    if (
      !data ||
      ![1, 2, 3, 4].includes(data.version) ||
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
        ...Object.entries(selectedChildren).map(([id, child]) => [id, [child]]),
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
        items.at(-1) !== (id === '$root' ? data.selected : selectedChildren[id])
      ) {
        throw new Error('Invalid child navigation history')
      }
    }
    const plan = async (
      signal: AbortSignal,
      created: Array<NavigationEntry<T>>,
    ) => {
      const budget = coordinator.restoreCounts.get(signal) ?? { entries: 0 }
      coordinator.restoreCounts.set(signal, budget)
      budget.entries += count
      if (budget.entries > (options.maxRestoreEntries ?? 1000)) {
        throw new Error('Navigation snapshot exceeds entry limit')
      }
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
    }
    return plan
  }
  const api: Navigation<T> = {
    cancelPending() {
      if (!live()) {
        return false
      }
      const pending = coordinator.owner
      coordinator.owner = undefined
      pending?.abort()
      return !!pending
    },
    getSnapshot: () => snapshot,
    getActiveEntry: (state = snapshot) => {
      const entry = top(state)
      return entry?.navigator?.getActiveEntry() ?? entry
    },
    getActivePath: () => {
      const entry = top()
      return entry ? [entry, ...(entry.navigator?.getActivePath() ?? [])] : []
    },
    getEntries: () =>
      Object.values(snapshot.stacks).flatMap((entries) =>
        entries.flatMap(descendants),
      ),
    getOwner: () => parent,
    onTreeChange(listener) {
      if (disposed) {
        return () => {}
      }
      const handler = (node: Navigation<T>, change: NavigationChange<T>) => {
        let current: Navigation<T> | undefined = node
        while (current) {
          if (current === api) {
            listener(node, change)
            return
          }
          current = current.getOwner()?.navigation
        }
      }
      treeListeners.add(handler)
      coordinator.events.add(handler)
      return () => {
        treeListeners.delete(handler)
        coordinator.events.delete(handler)
      }
    },
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
    async initialize(target?: string): Promise<boolean> {
      if (target !== undefined) {
        getContainer(target)
        return transact('select', (signal, created) =>
          ensure(snapshot, target, signal, created),
        )
      }
      return top()
        ? true
        : options.initialLocation
          ? api.navigate(options.initialLocation)
          : api.select(snapshot.selected)
    },
    navigate(request: NavigationRequest): Promise<boolean> {
      return transact(
        'navigate',
        (signal, created) => planNavigate(request, snapshot, signal, created),
        request.ignoreBlocker,
        request.behavior === 'replace'
          ? 'REPLACE'
          : request.behavior === 'reuse'
            ? 'BACK'
            : 'PUSH',
      )
    },
    activate(resolve, { ignoreBlocker = false } = {}) {
      let historyAction: HistoryAction = 'BACK'
      const destination = (navigation: Navigation<T>) => {
        const instruction = resolve(navigation)
        if (instruction.request) {
          historyAction =
            instruction.request.behavior === 'replace'
              ? 'REPLACE'
              : instruction.request.behavior === 'reuse'
                ? 'BACK'
                : 'PUSH'
        }
        return instruction
      }
      return transact(
        'navigate',
        async (signal, created) => {
          const staged = new Map<Navigation<T>, NavigationSnapshot<T>>()
          await planActivation(
            destination(api),
            destination,
            signal,
            created,
            staged,
          )
          let owner = parent
          while (owner && !signal.aborted) {
            await coordinator.hosts
              .get(owner.navigation)!
              .plan(
                { target: owner.entry.container, key: owner.entry.key },
                resolve,
                signal,
                created,
                staged,
              )
            owner = owner.navigation.getOwner()
          }
          return staged
        },
        ignoreBlocker,
        () => historyAction,
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
    canGoBack({ target, bubble = true } = {}) {
      if (!live()) {
        return false
      }
      if (target === undefined && top()?.navigator?.canGoBack()) {
        return true
      }
      return (
        !!backDestination(
          target ?? top()?.container ?? snapshot.selected,
          bubble,
        ) ||
        !!(
          bubble &&
          parent?.navigation.canGoBack({ target: parent.entry.container })
        )
      )
    },
    back({
      target,
      count = 1,
      bubble = true,
      ignoreBlocker = false,
    } = {}): Promise<boolean> {
      if (!live()) {
        return Promise.resolve(false)
      }
      if (!Number.isInteger(count) || count < 1) {
        throw new Error('Back count must be a positive integer')
      }
      if (
        target === undefined &&
        top()?.navigator &&
        !snapshot.openDrawers.length
      ) {
        return top()!.navigator!.back({ count, bubble, ignoreBlocker })
      }
      const destination = backDestination(
        target ?? top()?.container ?? snapshot.selected,
        bubble,
      )
      if (!destination) {
        return bubble && parent
          ? parent.navigation.back({
              target: parent.entry.container,
              count,
              bubble,
              ignoreBlocker,
            })
          : Promise.resolve(false)
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
      if (!live()) {
        return () => {}
      }
      if (!coordinator.entries.has(key)) {
        const entry = Object.values(snapshot.stacks)
          .flat()
          .find((entry) => entry.key === key)
        if (!entry) {
          return () => {}
        }
        coordinator.entries.set(key, { entry, navigation: api })
      }
      const registered = blockers.get(key) ?? new Set()
      if (!registered.size) {
        const ancestors: Array<string> = []
        let owner = (coordinator.entries.get(key)?.navigation ?? api).getOwner()
        while (owner) {
          ancestors.push(owner.entry.key)
          coordinator.blockedAncestors.set(
            owner.entry.key,
            (coordinator.blockedAncestors.get(owner.entry.key) ?? 0) + 1,
          )
          owner = owner.navigation.getOwner()
        }
        coordinator.blockerOwners.set(key, ancestors)
      }
      registered.add(blocker)
      blockers.set(key, registered)
      touchBranch()
      return () => {
        registered.delete(blocker)
        if (!registered.size && blockers.get(key) === registered) {
          removeBlocker(key)
        }
        touchBranch()
      }
    },
    isRemovalBlocked: options.getNavigator
      ? (key: string) =>
          blockers.has(key) || coordinator.blockedAncestors.has(key)
      : (key: string) => blockers.has(key),
    serialize: () => JSON.stringify(snapshots.get(api)!()),
    restore: (serialized) => transact('restore', planRestore(serialized)),
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
      if (!parent) {
        coordinator.owner?.abort()
      }
      for (const entry of Object.values(current.stacks).flat()) {
        release(entry)
      }
      listeners.clear()
      if (!parent) {
        blockers.clear()
        coordinator.blockerOwners.clear()
        coordinator.blockedAncestors.clear()
      }
      events.clear()
      coordinator.hosts.delete(api)
      coordinator.touches.delete(api)
      for (const listener of treeListeners) {
        coordinator.events.delete(listener)
      }
      treeListeners.clear()
      if (!parent) {
        coordinator.events.clear()
      }
    },
  }
  async function prepareSnapshot(
    signal: AbortSignal,
    plan: (
      signal: AbortSignal,
      created: Array<NavigationEntry<T>>,
    ) => Promise<NavigationSnapshot<T>>,
  ): Promise<boolean> {
    const created: Array<NavigationEntry<T>> = []
    try {
      const next = await plan(signal, created)
      if (signal.aborted) {
        return false
      }
      snapshot = next
      return true
    } catch (error) {
      for (const entry of created) {
        release(entry)
      }
      throw error
    } finally {
      if (signal.aborted) {
        for (const entry of created) {
          release(entry)
        }
      }
    }
  }
  coordinator.hosts.set(api, {
    commit(next) {
      snapshot = next
    },
    publish(change) {
      for (const listener of listeners) {
        notify(listener)
      }
      for (const listener of events) {
        notify(() => listener(change))
      }
    },
    plan: planActivation,
  })
  coordinator.touches.set(api, () => {
    snapshot = { ...snapshot }
    for (const listener of listeners) {
      notify(listener)
    }
  })
  function touchBranch() {
    coordinator.touches.get(api)?.()
    let ancestor = parent
    while (ancestor) {
      coordinator.touches.get(ancestor.navigation)?.()
      ancestor = ancestor.navigation.getOwner()
    }
  }
  definitions.set(api, options)
  snapshots.set(api, () => ({
    version: 4,
    selected: snapshot.selected,
    selectedChildren: snapshot.selectedChildren,
    childHistory: snapshot.childHistory,
    overlays: snapshot.overlays,
    history: snapshot.history,
    stacks: Object.fromEntries(
      Object.entries(snapshot.stacks).map(([id, entries]) => [
        id,
        entries.map(({ href, identity, state, navigator }) => ({
          href,
          identity,
          state,
          navigator: navigator && snapshots.get(navigator)!(),
        })),
      ]),
    ),
  }))
  preparations.set(api, async (signal, serialized, previous) => {
    const oldState = previous?.getSnapshot()
    const compatible =
      previous &&
      oldState &&
      ids.length === Object.keys(oldState.stacks).length &&
      ids.every(
        (id) =>
          id in oldState.stacks &&
          options.containers[id]?.initialHref ===
            definitions.get(previous)?.containers[id]?.initialHref &&
          JSON.stringify(api.getChildren(id)) ===
            JSON.stringify(previous.getChildren(id)),
      )
    if (previous && compatible) {
      await prepareSnapshot(signal, async (signal, created) => {
        const old = previous.getSnapshot() as NavigationSnapshot<T>
        const results = await Promise.allSettled(
          ids.map(async (id) => {
            const entries = old.stacks[id] ?? []
            const prepared = await Promise.allSettled(
              entries.map((entry) =>
                prepare(
                  entry.href,
                  id,
                  entry.identity,
                  signal,
                  created,
                  entry.state,
                  undefined,
                  entry,
                ),
              ),
            )
            const failed = prepared.find(
              (result) => result.status === 'rejected',
            )
            if (failed?.status === 'rejected') {
              throw failed.reason
            }
            return [
              id,
              prepared.map(
                (result) =>
                  (result as PromiseFulfilledResult<NavigationEntry<T>>).value,
              ),
            ] as const
          }),
        )
        const failed = results.find((result) => result.status === 'rejected')
        if (failed?.status === 'rejected') {
          throw failed.reason
        }
        const stacks = Object.fromEntries(
          results.map(
            (result) =>
              (
                result as PromiseFulfilledResult<
                  readonly [string, Array<NavigationEntry<T>>]
                >
              ).value,
          ),
        )
        return { ...old, stacks }
      })
      return
    }
    if (serialized !== undefined) {
      await prepareSnapshot(signal, planRestore(serialized))
    } else {
      await prepareSnapshot(signal, async (signal, created) => {
        const initial = options.initialLocation
        const target = initial?.target ?? snapshot.selected
        let next = focus(
          await ensure(snapshot, target, signal, created),
          target,
        )
        if (initial && top(next)?.href !== initial.href) {
          const container = leaf(target, next)
          const entry = await prepare(
            initial.href,
            container,
            initial.identity ?? identityOf(initial.href),
            signal,
            created,
            initial.state,
          )
          next = {
            ...next,
            stacks: {
              ...next.stacks,
              [container]: [...next.stacks[container]!, entry],
            },
          }
        }
        return next
      })
    }
  })
  return api
}

export interface Navigation<T> {
  cancelPending: () => boolean
  getSnapshot: () => NavigationSnapshot<T>
  getActiveEntry: (
    state?: NavigationSnapshot<T>,
  ) => NavigationEntry<T> | undefined
  getActivePath: () => Array<NavigationEntry<T>>
  getEntries: () => Array<NavigationEntry<T>>
  getOwner: () =>
    | { navigation: Navigation<T>; entry: NavigationEntry<T> }
    | undefined
  getChildren: (id?: string) => Array<string>
  getFocusedContainer: () => string
  subscribe: (listener: () => void) => () => void
  onChange: (listener: (change: NavigationChange<T>) => void) => () => void
  onTreeChange: (
    listener: (navigation: Navigation<T>, change: NavigationChange<T>) => void,
  ) => () => void
  /** Initialize an optional branch without selecting it. */
  initialize: (target?: string) => Promise<boolean>
  navigate: (request: NavigationRequest) => Promise<boolean>
  /** Atomically activate a visit-owned destination and its owning ancestors. */
  activate: (
    resolve: ActivationResolver<T>,
    options?: { ignoreBlocker?: boolean },
  ) => Promise<boolean>
  select: (target: string) => Promise<boolean>
  canGoBack: (options?: { target?: string; bubble?: boolean }) => boolean
  back: (options?: {
    target?: string
    count?: number
    bubble?: boolean
    ignoreBlocker?: boolean
  }) => Promise<boolean>
  popTo: (request: PopToRequest) => Promise<boolean>
  popToTop: (options?: { target?: string }) => Promise<boolean>
  setDrawerOpen: (target: string, open: boolean) => Promise<boolean>
  reset: (target: string, hrefs: Array<string>) => Promise<boolean>
  acknowledgeNativeDismiss: (key: string) => Promise<boolean>
  block: (
    key: string,
    blocker: (change: NavigationChange<T>) => boolean | Promise<boolean>,
  ) => () => void
  isRemovalBlocked: (key: string) => boolean
  serialize: () => string
  restore: (serialized: string) => Promise<boolean>
  dispose: () => void
}
