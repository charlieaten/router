import * as React from 'react'
import { useRouter } from '../useRouter'
import {
  getNativeNavigation,
  subscribeNativeNavigationEvent,
} from './controller'
import type { AnyRouter } from '@tanstack/router-core'
import type {
  NativeEntry,
  NativeNavigation,
  NativeNavigationEvent,
  NativeNavigationEventType,
} from './controller'

export const entryContext = React.createContext<NativeEntry | undefined>(
  undefined,
)
export interface ScopedNativeNavigation extends NativeNavigation {
  getParent: (id?: string) => ScopedNativeNavigation | undefined
  isFocused: () => boolean
  getState: NativeNavigation['getSnapshot']
  openDrawer: (id?: string) => Promise<boolean>
  closeDrawer: (id?: string) => Promise<boolean>
  toggleDrawer: (id?: string) => Promise<boolean>
  addListener: (
    type: NativeNavigationEventType,
    listener: (event: NativeNavigationEvent) => void,
  ) => () => void
}

function bindNavigation(
  navigation: NativeNavigation,
  router: AnyRouter,
  entry?: NativeEntry,
  container = entry?.container,
): ScopedNativeNavigation {
  const live = () =>
    !entry ||
    navigation
      .getSnapshot()
      .stacks[entry.container]!.some((item) => item.key === entry.key)
  const dispatch = (action: () => Promise<boolean>) =>
    live() ? action() : Promise.resolve(false)
  const target = container === '$root' ? undefined : container
  const definitions = router.options.native?.containers ?? {}
  const drawer = () => {
    let id = container
    while (id && id !== '$root') {
      if (definitions[id]?.kind === 'drawer') {
        return id
      }
      id = definitions[id]?.parent
    }
    return '$root'
  }
  return {
    ...navigation,
    navigate: (request) =>
      dispatch(() => navigation.navigate({ target, ...request })),
    back: (options) => dispatch(() => navigation.back({ target, ...options })),
    canGoBack: (options) =>
      live() && navigation.canGoBack({ target, ...options }),
    popTo: (options) =>
      dispatch(() => navigation.popTo({ target, ...options })),
    popToTop: (options) =>
      dispatch(() => navigation.popToTop({ target, ...options })),
    getState: navigation.getSnapshot,
    isFocused: () => !entry || navigation.getActiveEntry()?.key === entry.key,
    getParent(id) {
      if (container === '$root') {
        return undefined
      }
      let parent = container ? definitions[container]?.parent : undefined
      if (id) {
        while (parent && parent !== id) {
          parent = definitions[parent]?.parent
        }
        if (parent !== id && id !== '$root') {
          return undefined
        }
      }
      return bindNavigation(navigation, router, entry, parent ?? '$root')
    },
    openDrawer: (id = drawer()) =>
      dispatch(() => navigation.setDrawerOpen(id, true)),
    closeDrawer: (id = drawer()) =>
      dispatch(() => navigation.setDrawerOpen(id, false)),
    toggleDrawer: (id = drawer()) =>
      dispatch(() =>
        navigation.setDrawerOpen(
          id,
          !navigation.getSnapshot().openDrawers.includes(id),
        ),
      ),
    addListener: (type, listener) =>
      subscribeNativeNavigationEvent(navigation, type, listener, entry?.key),
  }
}

export function useNavigation(): ScopedNativeNavigation {
  const router = useRouter()
  const entry = React.useContext(entryContext)
  const navigation = getNativeNavigation(router)
  return React.useMemo(
    () => bindNavigation(navigation, router, entry),
    [navigation, router, entry],
  )
}

export function useIsFocused() {
  const entry = React.useContext(entryContext)
  const navigation = getNativeNavigation(useRouter())
  React.useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  )
  return !entry || navigation.getActiveEntry()?.key === entry.key
}

export function useFocusEffect(effect: () => void | (() => void)) {
  const focused = useIsFocused()
  React.useEffect(() => (focused ? effect() : undefined), [focused, effect])
}

export function useNavigationEvent(
  type: NativeNavigationEventType,
  listener: (event: NativeNavigationEvent) => void,
) {
  const entry = React.useContext(entryContext)
  const navigation = getNativeNavigation(useRouter())
  React.useEffect(
    () =>
      subscribeNativeNavigationEvent(navigation, type, listener, entry?.key),
    [navigation, type, listener, entry?.key],
  )
}
