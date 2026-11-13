import * as React from 'react'

export const Platform = { OS: 'ios' }
export const modalInstances = new Set<symbol>()

export function View({ children }: { children?: React.ReactNode }) {
  return <div>{children}</div>
}
export function Text({ children }: { children?: React.ReactNode }) {
  return <span>{children}</span>
}
export function Pressable({
  onPress,
  children,
}: {
  onPress?: (event: unknown) => void
  children?: React.ReactNode
}) {
  return (
    <button onClick={() => onPress?.({ isDefaultPrevented: () => false })}>
      {children}
    </button>
  )
}
export const BackHandler = { addEventListener: () => ({ remove() {} }) }
export const Linking = {
  getInitialURL: async () => null,
  addEventListener: () => ({ remove() {} }),
}

export function Modal({
  visible,
  children,
  onDismiss,
}: {
  visible: boolean
  children?: React.ReactNode
  onDismiss?: () => void
}) {
  React.useEffect(() => {
    const instance = Symbol()
    modalInstances.add(instance)
    return () => {
      modalInstances.delete(instance)
    }
  }, [])
  React.useEffect(() => {
    if (!visible && Platform.OS === 'ios') {
      onDismiss?.()
    }
  }, [visible, onDismiss])
  return visible ? <div role="dialog">{children}</div> : null
}

export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove() {} }),
}
