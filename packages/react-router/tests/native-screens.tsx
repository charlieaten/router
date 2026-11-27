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

function HeaderConfig({ ios, android }: any) {
  return (
    <header>
      {ios?.titleItem?.render?.()}
      {ios?.subtitleItem?.render?.()}
      {ios?.largeSubtitleItem?.render?.()}
      {ios?.leadingItems?.map((item: any) => (
        <React.Fragment key={item.id}>{item.render?.()}</React.Fragment>
      ))}
      {ios?.trailingItems?.map((item: any) => (
        <React.Fragment key={item.id}>{item.render?.()}</React.Fragment>
      ))}
      {android?.backgroundSubview?.render?.()}
      {android?.leadingSubview?.render?.()}
      {android?.centerSubview?.render?.()}
      {android?.trailingSubview?.render?.()}
    </header>
  )
}
export const Stack = {
  Host: function StackHost({
    children,
    colorScheme,
    direction,
  }: {
    children?: React.ReactNode
    colorScheme?: string
    direction?: string
  }) {
    return (
      <div
        data-testid="native-stack"
        data-color-scheme={colorScheme}
        dir={direction}
      >
        {children}
      </div>
    )
  },
  Screen,
  HeaderConfig,
}
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
  onNativeDismiss,
  onDismiss,
}: {
  isOpen: boolean
  children: React.ReactNode
  onNativeDismissPrevented?: () => void
  onNativeDismiss?: () => void
  onDismiss?: () => void
}) {
  // Native sheets retain the outgoing subtree until their close animation ends.
  const [dismissed, setDismissed] = React.useState(false)
  return !dismissed ? (
    <div role="dialog">
      {!isOpen && (
        <button
          onClick={() => {
            setDismissed(true)
            onDismiss?.()
          }}
        >
          Finish native sheet dismissal
        </button>
      )}
      <button
        data-testid="native-sheet-close"
        onClick={onNativeDismissPrevented}
      >
        Native close
      </button>
      <button onClick={onNativeDismiss}>Dismiss native sheet</button>
      {children}
    </div>
  ) : null
}

export function PageSheet(props: React.ComponentProps<typeof FormSheet>) {
  return (
    <div data-testid="native-page-sheet">
      <FormSheet {...props} />
    </div>
  )
}

export const ContainedModalProvider = Host
export const ContainedModalReplacingContent = ({
  isOpen,
  children,
  onDidDisappear,
}: {
  isOpen: boolean
  children: React.ReactNode
  onDidDisappear?: () => void
}) => (
  <div data-testid="native-contained-replacing">
    {isOpen ? (
      children
    ) : (
      <button onClick={onDidDisappear}>Finish contained dismissal</button>
    )}
  </div>
)
export const ContainedModalOverContent = FormSheet
