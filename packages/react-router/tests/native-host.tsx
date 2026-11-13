import * as React from 'react'

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
