import * as React from 'react'

export const nativeOutletContext = React.createContext<
  { routeId: string; content: React.ReactNode } | undefined
>(undefined)
