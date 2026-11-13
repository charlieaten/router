import * as React from 'react'

function Host({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function Screen({
  children,
  activityMode,
  onDismiss,
  screenKey,
  onNativeDismiss,
}: {
  children?: React.ReactNode
  activityMode?: string
  onDismiss?: (key: string) => void
  screenKey?: string
  onNativeDismiss?: (key: string) => void
}) {
  const nativelyDismissed = React.useRef(false)
  React.useEffect(() => {
    if (activityMode === 'detached') {
      if (nativelyDismissed.current) {
        throw new Error('Native screen was popped twice')
      }
      onDismiss?.(screenKey!)
    }
  }, [activityMode, onDismiss, screenKey])
  return activityMode === 'detached' ? null : (
    <div>
      <button
        data-testid="native-back"
        onClick={() => {
          nativelyDismissed.current = true
          onNativeDismiss?.(screenKey!)
        }}
      >
        Native back
      </button>
      {children}
    </div>
  )
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
  onNativeDismissPrevented,
}: {
  isOpen: boolean
  children: React.ReactNode
  onNativeDismissPrevented?: () => void
}) {
  return isOpen ? (
    <div role="dialog">
      <button
        data-testid="native-sheet-close"
        onClick={onNativeDismissPrevented}
      >
        Native close
      </button>
      {children}
    </div>
  ) : null
}

export const ContainedModalProvider = Host
export const ContainedModalOverContent = FormSheet
