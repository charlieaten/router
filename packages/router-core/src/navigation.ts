/**
 * Opt-in presentation history. A location identifies a destination; an entry
 * identifies a visit owned by a container. Neither loader data nor render state
 * is stored on route definitions.
 */
export type NavigationBehavior = 'push' | 'replace' | 'reuse'

export interface NavigationEntry<T = unknown> {
  key: string
  container: string
  href: string
  identity: string
  value: T
}

export interface NavigationContainer {
  initialHref: string
  title?: string
  overlay?: boolean
}

export interface NavigationSnapshot<T> {
  selected: string
  stacks: Record<string, Array<NavigationEntry<T>>>
}

export interface NavigationRequest {
  href: string
  target?: string
  behavior?: NavigationBehavior
  identity?: string
  match?: 'nearest' | 'oldest'
}

export interface NavigationChange<T> {
  action: 'navigate' | 'back' | 'select' | 'reset' | 'restore'
  current: NavigationSnapshot<T>
  next: NavigationSnapshot<T>
  removed: Array<NavigationEntry<T>>
  signal: AbortSignal
}

export interface NavigationOptions<T> {
  containers: Record<string, NavigationContainer>
  initialContainer: string
  prepare: (
    entry: Omit<NavigationEntry<T>, 'value'>,
    signal: AbortSignal,
  ) => Promise<{ value: T; href?: string }>
  dispose?: (entry: NavigationEntry<T>) => void
}

export function createNavigation<T>(options: NavigationOptions<T>) {
  const { containers } = options
  const initial = Object.hasOwn(containers, options.initialContainer)
    ? containers[options.initialContainer]
    : undefined
  if (!initial || initial.overlay) {
    throw new Error('Navigation requires a non-overlay initial container')
  }

  if (Object.values(containers).filter((item) => item.overlay).length > 1) {
    throw new Error('This prototype supports one overlay container')
  }

  let snapshot: NavigationSnapshot<T> = {
    selected: options.initialContainer,
    stacks: Object.fromEntries(Object.keys(containers).map((id) => [id, []])),
  }
  let sequence = 0
  let owner: AbortController | undefined
  const listeners = new Set<() => void>()
  const blockers = new Map<
    string,
    Set<(change: NavigationChange<T>) => boolean | Promise<boolean>>
  >()
  const events = new Set<(change: NavigationChange<T>) => void>()

  function getContainer(id: string) {
    const container = Object.hasOwn(containers, id) ? containers[id] : undefined
    if (!container) {
      throw new Error(`Unknown navigation container: ${id}`)
    }
    return container
  }

  function top(state = snapshot) {
    const overlay = Object.keys(containers).find(
      (id) => containers[id]!.overlay && state.stacks[id]!.length,
    )
    return state.stacks[overlay ?? state.selected]!.at(-1)
  }

  async function transact(
    action: NavigationChange<T>['action'],
    plan: (
      signal: AbortSignal,
      created: Array<NavigationEntry<T>>,
    ) => Promise<NavigationSnapshot<T>>,
  ) {
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
      const remaining = new Map(
        Object.values(next.stacks)
          .flat()
          .map((entry) => [entry.key, entry]),
      )
      const removed = Object.values(snapshot.stacks)
        .flat()
        .filter((entry) => !remaining.has(entry.key))
      const change = {
        action,
        current: snapshot,
        next,
        removed,
        signal: transaction.signal,
      }
      for (const entry of removed) {
        for (const block of blockers.get(entry.key) ?? []) {
          let abort!: () => void
          const cancelled = new Promise<boolean>((resolve) => {
            abort = () => resolve(true)
            transaction.signal.addEventListener('abort', abort, { once: true })
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
      committed = new Set(Object.values(next.stacks).flat())
      snapshot = next
      // Publish before disposal: renderers can retain outgoing native views until
      // their transition completes. Disposal releases logical entry resources.
      for (const listener of listeners) {
        listener()
      }
      for (const listener of events) {
        listener(change)
      }
      for (const entry of removed) {
        blockers.delete(entry.key)
        options.dispose?.(entry)
      }
      for (const entry of Object.values(change.current.stacks).flat()) {
        const replacement = remaining.get(entry.key)
        if (replacement && replacement.value !== entry.value) {
          options.dispose?.(entry)
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
          options.dispose?.(entry)
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
  ) {
    getContainer(container)
    const metadata = { key: `entry-${++sequence}`, container, href, identity }
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
    entries: Array<{ href: string; identity: string }>,
    container: string,
    signal: AbortSignal,
    created: Array<NavigationEntry<T>>,
  ) {
    // Wait for every acquisition even when one fails, so partial restoration
    // cannot strand a resource that resolves after the transaction has retired.
    const results = await Promise.allSettled(
      entries.map((entry) =>
        prepare(entry.href, container, entry.identity, signal, created),
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

  const api = {
    getSnapshot: () => snapshot,
    getActiveEntry: (state = snapshot) => top(state),
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
      if (top()) {
        return true
      }
      return api.select(snapshot.selected)
    },
    navigate(request: NavigationRequest): Promise<boolean> {
      return transact('navigate', async (signal, created) => {
        const target = request.target ?? top()?.container ?? snapshot.selected
        const definition = getContainer(target)
        const stack = snapshot.stacks[target]!
        const identity = request.identity ?? request.href.split(/[?#]/, 1)[0]!
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
            // Reuse preserves the visit, but a changed location must still run
            // validation/loaders. Keeping identity is not a same-href no-op.
            const replacement =
              entry.href === request.href
                ? entry
                : await prepare(request.href, target, identity, signal, created)
            replacement.key = entry.key
            return {
              selected: definition.overlay ? snapshot.selected : target,
              stacks: {
                ...snapshot.stacks,
                [target]: [...stack.slice(0, found), replacement],
              },
            }
          }
        }
        const entry = await prepare(
          request.href,
          target,
          identity,
          signal,
          created,
        )
        return {
          selected: definition.overlay ? snapshot.selected : target,
          stacks: {
            ...snapshot.stacks,
            [target]: [
              ...(behavior === 'replace' ? stack.slice(0, -1) : stack),
              entry,
            ],
          },
        }
      })
    },
    select(target: string): Promise<boolean> {
      return transact('select', async (signal, created) => {
        const definition = getContainer(target)
        if (definition.overlay) {
          throw new Error('Select a tab; navigate to an overlay')
        }
        const stack = snapshot.stacks[target]!
        return {
          selected: target,
          stacks: stack.length
            ? snapshot.stacks
            : {
                ...snapshot.stacks,
                [target]: [
                  await prepare(
                    definition.initialHref,
                    target,
                    definition.initialHref.split(/[?#]/, 1)[0]!,
                    signal,
                    created,
                  ),
                ],
              },
        }
      })
    },
    back({
      target = top()?.container ?? snapshot.selected,
      count = 1,
    } = {}): Promise<boolean> {
      if (!Number.isInteger(count) || count < 1) {
        throw new Error('Back count must be a positive integer')
      }
      getContainer(target)
      return transact('back', async () => {
        const stack = snapshot.stacks[target]!
        const length = Math.max(
          containers[target]!.overlay ? 0 : 1,
          stack.length - count,
        )
        return {
          ...snapshot,
          stacks: { ...snapshot.stacks, [target]: stack.slice(0, length) },
        }
      })
    },
    reset(target: string, hrefs: Array<string>): Promise<boolean> {
      if (!hrefs.length && !getContainer(target).overlay) {
        throw new Error('A stack must retain a root entry')
      }
      return transact('reset', async (signal, created) => ({
        ...snapshot,
        stacks: {
          ...snapshot.stacks,
          [target]: await prepareAll(
            hrefs.map((href) => ({
              href,
              identity: href.split(/[?#]/, 1)[0]!,
            })),
            target,
            signal,
            created,
          ),
        },
      }))
    },
    acknowledgeNativeDismiss(key: string): Promise<boolean> {
      const entry = Object.values(snapshot.stacks)
        .flat()
        .find((item) => item.key === key)
      if (!entry) {
        return Promise.resolve(false)
      }
      const stack = snapshot.stacks[entry.container]!
      return api.back({
        target: entry.container,
        count: stack.length - stack.indexOf(entry),
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
        listener()
      }
      return () => {
        registered.delete(blocker)
        if (!registered.size) {
          blockers.delete(key)
        }
        snapshot = { ...snapshot }
        for (const listener of listeners) {
          listener()
        }
      }
    },
    isRemovalBlocked: (key: string) => blockers.has(key),
    serialize() {
      return JSON.stringify({
        version: 1,
        selected: snapshot.selected,
        stacks: Object.fromEntries(
          Object.entries(snapshot.stacks).map(([id, entries]) => [
            id,
            entries.map(({ href, identity }) => ({ href, identity })),
          ]),
        ),
      })
    },
    restore(serialized: string) {
      const data = JSON.parse(serialized)
      if (
        data.version !== 1 ||
        typeof data.selected !== 'string' ||
        !data.stacks ||
        typeof data.stacks !== 'object'
      ) {
        throw new Error('Invalid navigation snapshot')
      }
      if (getContainer(data.selected).overlay) {
        throw new Error('Invalid selected navigation container')
      }
      for (const [id, entries] of Object.entries(data.stacks)) {
        getContainer(id)
        if (
          !Array.isArray(entries) ||
          entries.some(
            (entry) =>
              typeof entry?.href !== 'string' ||
              typeof entry?.identity !== 'string',
          )
        ) {
          throw new Error('Invalid navigation entries')
        }
      }
      if (!data.stacks[data.selected]?.length) {
        throw new Error('The selected stack must have a root entry')
      }
      return transact('restore', async (signal, created) => {
        const results = await Promise.allSettled(
          Object.keys(containers).map(
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
      owner?.abort()
      for (const entry of Object.values(snapshot.stacks).flat()) {
        options.dispose?.(entry)
      }
      snapshot = {
        ...snapshot,
        stacks: Object.fromEntries(
          Object.keys(containers).map((id) => [id, []]),
        ),
      }
      listeners.clear()
      blockers.clear()
      events.clear()
    },
  }
  return api
}

export type Navigation<T> = ReturnType<typeof createNavigation<T>>
