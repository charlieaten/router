import * as React from 'react'

function Host({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function Screen({
  children,
  activityMode,
  onDismiss,
  screenKey,
}: {
  children?: React.ReactNode
  activityMode?: string
  onDismiss?: (key: string) => void
  screenKey?: string
}) {
  React.useEffect(() => {
    if (activityMode === 'detached') {
      onDismiss?.(screenKey!)
    }
  }, [activityMode, onDismiss, screenKey])
  return activityMode === 'detached' ? null : <div>{children}</div>
}

export const Stack = { Host, Screen, HeaderConfig: () => null }
export const Tabs = { Host, Screen: Host }
export function FormSheet({
  isOpen,
  children,
}: {
  isOpen: boolean
  children: React.ReactNode
}) {
  return isOpen ? <div role="dialog">{children}</div> : null
}
