import * as React from 'react'
import { useNavigation } from './native/context'

export function useCanGoBack() {
  const navigation = useNavigation()
  React.useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  )
  return navigation.canGoBack()
}
