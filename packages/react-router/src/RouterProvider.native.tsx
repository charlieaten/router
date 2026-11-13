import * as React from 'react'
import { BackHandler, Linking, Text, View } from 'react-native'
import { FormSheet, Stack, Tabs } from 'react-native-screens'
import { Matches } from './Matches'
import { RouterContextProvider } from './RouterProviderShared'
import { entryContext } from './native/context'
import { getNativeNavigation, getScreenOptions } from './native/controller'
import type { AnyRouter } from '@tanstack/router-core'
import type { NativeEntry, NativeNavigation } from './native/controller'

function Entry({ entry, active }: { entry: NativeEntry; active: boolean }) {
  return (
    <React.Activity mode={active ? 'visible' : 'hidden'}>
      <entryContext.Provider value={entry}>
        <RouterContextProvider router={entry.value}>
          <Matches />
        </RouterContextProvider>
      </entryContext.Provider>
    </React.Activity>
  )
}

function NativeStack({
  entries,
  navigation,
  selected,
}: {
  entries: Array<NativeEntry>
  navigation: NativeNavigation
  selected: boolean
}) {
  // Keep outgoing React trees until native acknowledges detachment. Logical
  // history changes and native animation completion are separate lifetimes.
  const [retained, setRetained] = React.useState(entries)
  const current = new Map(
    entries.map((entry, index) => [entry.key, { entry, index }]),
  )
  const retainedKeys = new Set(retained.map((entry) => entry.key))
  const rendered = [
    ...retained.map((entry) => current.get(entry.key)?.entry ?? entry),
    ...entries.filter((entry) => !retainedKeys.has(entry.key)),
  ]
  React.useLayoutEffect(() => {
    setRetained((previous) => {
      const current = new Map(entries.map((entry) => [entry.key, entry]))
      const keys = new Set(previous.map((entry) => entry.key))
      return [
        ...previous.map((entry) => current.get(entry.key) ?? entry),
        ...entries.filter((entry) => !keys.has(entry.key)),
      ]
    })
  }, [entries])
  const forget = (key: string) => {
    const stillAttached = Object.values(navigation.getSnapshot().stacks)
      .flat()
      .some((entry) => entry.key === key)
    if (!stillAttached) {
      setRetained((current) => current.filter((entry) => entry.key !== key))
    }
  }
  return (
    <Stack.Host>
      {rendered.map((entry) => {
        const index = current.get(entry.key)?.index ?? -1
        const options = getScreenOptions(entry)
        return (
          <Stack.Screen
            key={entry.key}
            screenKey={entry.key}
            activityMode={current.has(entry.key) ? 'attached' : 'detached'}
            preventNativeDismiss={navigation.isRemovalBlocked(entry.key)}
            onNativeDismiss={(key) => {
              void navigation
                .acknowledgeNativeDismiss(key)
                .then(() => forget(key))
            }}
            onNativeDismissPrevented={() => {
              void navigation.back({ target: entry.container })
            }}
            onDismiss={forget}
          >
            <Stack.HeaderConfig title={options.title ?? entry.href} />
            <Entry
              entry={entry}
              active={
                !!options.keepActive ||
                index < 0 ||
                navigation.isRemovalBlocked(entry.key) ||
                (selected && index >= entries.length - 2)
              }
            />
          </Stack.Screen>
        )
      })}
    </Stack.Host>
  )
}

export function RouterProvider({ router }: { router: AnyRouter }) {
  const navigation = getNativeNavigation(router)
  const state = React.useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  )
  const [error, setError] = React.useState<unknown>()
  const provenance = React.useRef(0)
  const definitions = router.options.native?.containers ?? {
    main: { initialHref: '/' },
  }
  const tabs = Object.entries(definitions).filter(([, item]) => !item.overlay)
  const overlays = Object.entries(definitions).filter(
    ([, item]) => item.overlay,
  )

  React.useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      const entry = navigation.getActiveEntry()
      if (!entry) {
        return false
      }
      const snapshot = navigation.getSnapshot()
      if (
        entry.container === snapshot.selected &&
        snapshot.stacks[entry.container]!.length <= 1
      ) {
        return false
      }
      void navigation.back().catch(setError)
      return true
    })
    const open = (url: string) => {
      try {
        const prefix = router.options.native?.linking?.prefixes.find((prefix) =>
          url.startsWith(prefix),
        )
        if (!prefix) {
          return
        }
        const destination = `/${url.slice(prefix.length).replace(/^\/+/, '')}`
        void router
          .navigate({
            to: destination,
          } as never)
          .catch(setError)
      } catch (error) {
        setError(error)
      }
    }
    void navigation
      .initialize()
      .then(() => Linking.getInitialURL())
      .then((url) => {
        if (url) {
          open(url)
        }
      })
      .catch(setError)
    const link = Linking.addEventListener('url', ({ url }) => open(url))
    return () => {
      back.remove()
      link.remove()
    }
  }, [router, navigation])

  if (error) {
    return (
      <Text accessibilityRole="alert">
        {error instanceof Error ? error.message : String(error)}
      </Text>
    )
  }

  return (
    <RouterContextProvider router={router}>
      <View style={{ flex: 1 }}>
        <Tabs.Host
          navStateRequest={{
            selectedScreenKey: state.selected,
            baseProvenance: provenance.current,
          }}
          rejectStaleNavStateUpdates
          onTabSelected={(event) => {
            provenance.current = event.nativeEvent.provenance
            if (event.nativeEvent.selectedScreenKey !== state.selected) {
              void navigation
                .select(event.nativeEvent.selectedScreenKey)
                .catch(setError)
            }
          }}
          onTabSelectionRejected={(event) => {
            provenance.current = event.nativeEvent.provenance
            if (event.nativeEvent.rejectionReason === 'stale') {
              void navigation
                .select(event.nativeEvent.selectedScreenKey)
                .catch(setError)
            }
          }}
        >
          {tabs.map(([id, definition]) => (
            <Tabs.Screen
              key={id}
              screenKey={id}
              title={definition.title ?? id}
              specialEffects={{
                repeatedTabSelection: { popToRoot: false, scrollToTop: false },
              }}
            >
              <NativeStack
                entries={state.stacks[id]!}
                navigation={navigation}
                selected={state.selected === id}
              />
            </Tabs.Screen>
          ))}
        </Tabs.Host>
        {overlays.flatMap(([id]) =>
          state.stacks[id]!.map((entry) => (
            <FormSheet
              key={entry.key}
              isOpen
              preventNativeDismiss={navigation.isRemovalBlocked(entry.key)}
              onNativeDismiss={() => {
                void navigation.acknowledgeNativeDismiss(entry.key)
              }}
              onNativeDismissPrevented={() => {
                void navigation.back({ target: entry.container })
              }}
            >
              <Entry entry={entry} active />
            </FormSheet>
          )),
        )}
      </View>
    </RouterContextProvider>
  )
}
