import * as React from 'react'
import { entryContext, useNavigation } from './native/context'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'
import type {
  BlockerResolver,
  ShouldBlockFn,
  UseBlockerOpts,
} from './blockerTypes'
import type { NativeEntry } from './native/controller'

export type {
  UseBlockerOpts,
  ShouldBlockFn,
  BlockerResolver,
} from './blockerTypes'

function location(entry: NativeEntry) {
  const state = entry.value.state
  const match = state.matches.at(-1)!
  return {
    routeId: match.routeId,
    fullPath: entry.value.routesById[match.routeId]!.fullPath,
    pathname: state.location.pathname,
    params: match.params,
    search: match.search,
  }
}
const idle = {
  status: 'idle',
  current: undefined,
  next: undefined,
  action: undefined,
  proceed: undefined,
  reset: undefined,
} as const

export function useBlocker<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = false,
>(
  options: UseBlockerOpts<TRouter, TWithResolver>,
): TWithResolver extends true ? BlockerResolver<TRouter> : void {
  const optionsRef = React.useRef(options)
  optionsRef.current = options
  const disabled = options.disabled
  const entry = React.useContext(entryContext)
  const navigation = useNavigation()
  const [resolver, setResolver] = React.useState<BlockerResolver<TRouter>>(idle)
  const pending = React.useRef<
    { finish: (blocked: boolean) => void } | undefined
  >(undefined)
  React.useEffect(() => {
    if (!entry || disabled) {
      return
    }
    let registered = true
    const unblock = navigation.block(entry.key, async (change) => {
      const options = optionsRef.current
      const next = change.destination ?? navigation.getActiveEntry(change.next)
      const args = {
        current: location(entry),
        next: location(next ?? entry),
        action: change.historyAction,
      } as Parameters<ShouldBlockFn<TRouter>>[0]
      const shouldBlock = await options.shouldBlockFn(args)
      if (change.signal.aborted || !registered) {
        return true
      }
      if (!shouldBlock || !options.withResolver) {
        return shouldBlock
      }
      return new Promise<boolean>((resolve) => {
        const abort = () => ticket.finish(true)
        const ticket = {
          finish: (blocked: boolean) => {
            change.signal.removeEventListener('abort', abort)
            if (pending.current === ticket) {
              pending.current = undefined
              setResolver(idle)
            }
            resolve(blocked)
          },
        }
        pending.current = ticket
        change.signal.addEventListener('abort', abort, { once: true })
        setResolver({
          status: 'blocked',
          ...args,
          proceed: () => ticket.finish(false),
          reset: () => ticket.finish(true),
        })
      })
    })
    return () => {
      registered = false
      pending.current?.finish(true)
      unblock()
    }
  }, [entry, navigation, disabled])
  return (
    options.withResolver ? resolver : undefined
  ) as TWithResolver extends true ? BlockerResolver<TRouter> : void
}

export function Block({
  children,
  ...options
}: UseBlockerOpts & {
  children?: React.ReactNode | ((resolver: BlockerResolver) => React.ReactNode)
}) {
  const resolver = useBlocker({ ...options, withResolver: true })
  return typeof children === 'function' ? children(resolver) : children
}
