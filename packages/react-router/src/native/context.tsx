import * as React from 'react'
import { useRouter } from '../useRouter'
import { getNativeNavigation } from './controller'
import type { NativeEntry } from './controller'

export const entryContext = React.createContext<NativeEntry | undefined>(
  undefined,
)

export function useNavigation() {
  return getNativeNavigation(useRouter())
}

export function useIsFocused() {
  const entry = React.useContext(entryContext)
  const navigation = useNavigation()
  const state = React.useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  )
  return (
    !!entry &&
    navigation.getActiveEntry()?.key === entry.key &&
    state.selected !== undefined
  )
}
