import * as React from 'react'
import { Outlet as RouteOutlet } from './MatchShared'
import { matchContext } from './matchContext'
import { nativeOutletContext } from './native/outlet-context'

export function Outlet() {
  const routeId = React.useContext(matchContext)
  const nested = React.useContext(nativeOutletContext)
  return nested && nested.routeId === routeId ? nested.content : <RouteOutlet />
}
