import { View } from 'react-native'
import type { ReactNode } from 'react'

export function RootDocument({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: '#f7f5ef' }}>{children}</View>
}
