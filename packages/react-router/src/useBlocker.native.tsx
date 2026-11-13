import * as React from 'react'
import { entryContext, useNavigation } from './native/context'
import type { UseBlockerOpts } from './blockerTypes'
import type { NativeEntry } from './native/controller'

export type { UseBlockerOpts, ShouldBlockFn } from './blockerTypes'

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

type Resolver = {
  status: 'idle' | 'blocked'
  proceed: (() => void) | undefined
  reset: (() => void) | undefined
}

export function useBlocker(options: UseBlockerOpts) {
  const optionsRef = React.useRef(options)
  optionsRef.current = options
  const disabled = options.disabled
  const entry = React.useContext(entryContext)
  const navigation = useNavigation()
  const [resolver, setResolver] = React.useState<Resolver>({
    status: 'idle',
    proceed: undefined,
    reset: undefined,
  })
  React.useEffect(() => {
    if (!entry || disabled) {
      return
    }
    return navigation.block(entry.key, async (change) => {
      const options = optionsRef.current
      const next = navigation.getActiveEntry(change.next)
      const shouldBlock = await options.shouldBlockFn({
        current: location(entry),
        next: next ? location(next) : location(entry),
        action: change.action === 'back' ? 'BACK' : 'REPLACE',
      } as never)
      if (change.signal.aborted) {
        return true
      }
      if (!shouldBlock || !options.withResolver) {
        return shouldBlock
      }
      const blocked = await new Promise<boolean>((resolve) => {
        const abort = () => finish(true)
        const finish = (value: boolean) => {
          change.signal.removeEventListener('abort', abort)
          resolve(value)
        }
        change.signal.addEventListener('abort', abort, { once: true })
        setResolver({
          status: 'blocked',
          proceed: () => finish(false),
          reset: () => finish(true),
        })
      })
      setResolver({ status: 'idle', proceed: undefined, reset: undefined })
      return blocked
    })
  }, [entry, navigation, disabled])
  return resolver
}

export function Block({
  children,
  ...options
}: UseBlockerOpts & {
  children?: React.ReactNode | ((resolver: Resolver) => React.ReactNode)
}) {
  const resolver = useBlocker(options)
  return typeof children === 'function' ? children(resolver) : children
}
