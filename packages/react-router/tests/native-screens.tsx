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
function TabsHost({
  children,
  navStateRequest,
  onTabSelected,
}: {
  children?: React.ReactNode
  navStateRequest: { selectedScreenKey: string; baseProvenance: number }
  onTabSelected?: (event: {
    nativeEvent: { selectedScreenKey: string; provenance: number }
  }) => void
}) {
  return (
    <div
      data-testid="native-tabs"
      data-request={`${navStateRequest.selectedScreenKey}:${navStateRequest.baseProvenance}`}
    >
      <button
        data-testid="select-search"
        onClick={() =>
          onTabSelected?.({
            nativeEvent: { selectedScreenKey: 'search', provenance: 1 },
          })
        }
      >
        Select search tab
      </button>
      {children}
    </div>
  )
}
export const Tabs = { Host: TabsHost, Screen: Host }
export function FormSheet({
  isOpen,
  children,
}: {
  isOpen: boolean
  children: React.ReactNode
}) {
  return isOpen ? <div role="dialog">{children}</div> : null
}
