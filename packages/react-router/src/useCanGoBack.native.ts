import * as React from 'react'
import { useNavigation } from './native/context'

export function useCanGoBack() {
  const navigation = useNavigation()
  const state = React.useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  )
  const active = navigation.getActiveEntry()
  if (!active) {
    return false
  }
  return (
    state.stacks[active.container]!.length > 1 ||
    active.container !== state.selected
  )
}
