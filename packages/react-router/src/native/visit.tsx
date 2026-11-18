import * as React from 'react'
import { routerContext } from '../routerContext'
import { matchContext } from '../matchContext'
import { entryContext } from './context'
import type { NativeEntry } from './controller'

// Reuse the outer screen scope when present. Standalone content still gets
// the same scope, without changing Activity or application Wrap placement.
export function VisitProvider({
  entry,
  children,
}: {
  entry: NativeEntry
  children?: React.ReactNode
}) {
  const current = React.useContext(entryContext)
  if (current === entry) {
    return children
  }
  return (
    <entryContext.Provider value={entry}>
      <routerContext.Provider value={entry.value}>
        <matchContext.Provider
          value={entry.value.state.matches.at(-1)?.routeId}
        >
          {children}
        </matchContext.Provider>
      </routerContext.Provider>
    </entryContext.Provider>
  )
}
