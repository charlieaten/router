import * as React from 'react'
import { Stack } from 'react-native-screens'
import { emitNativeNavigationEvent, getScreenOptions } from './controller'
import { useRetained } from './use-retained'
import { VisitProvider } from './visit'
import type {
  NativeEntry,
  NativeNavigation,
  NativeNavigationOptions,
} from './controller'

export type StackHostOptions = NativeNavigationOptions['stackHost']

export function NativeStack({
  hostOptions,
  Entry,
  entries,
  navigation,
  selected,
  onError,
}: {
  hostOptions: StackHostOptions
  Entry: React.ComponentType<{ entry: NativeEntry; active: boolean }>
  entries: Array<NativeEntry>
  navigation: NativeNavigation
  selected: boolean
  onError: (error: unknown) => void
}) {
  const { rendered, current, forget, acknowledge } = useRetained(entries)
  return (
    <Stack.Host {...hostOptions}>
      {rendered.map((entry) => {
        const index = entries.findIndex((item) => item.key === entry.key)
        const options = getScreenOptions(entry)
        const event = (
          type: 'transitionStart' | 'transitionEnd',
          closing: boolean,
        ) =>
          emitNativeNavigationEvent(navigation, {
            type,
            target: entry.key,
            closing,
          })
        // With no custom header configuration there is no React chrome to
        // scope. Leave standalone content's boundary inside its Activity.
        const content = (
          <>
            <Entry
              entry={entry}
              active={
                !!options.keepActive ||
                index < 0 ||
                navigation.isRemovalBlocked(entry.key) ||
                (selected && index >= entries.length - 2)
              }
            />
            <Stack.HeaderConfig
              title={options.title ?? entry.href}
              {...options.header}
            />
          </>
        )
        return (
          <Stack.Screen
            {...options.stack}
            key={entry.key}
            screenKey={entry.key}
            activityMode={current.has(entry.key) ? 'attached' : 'detached'}
            preventNativeDismiss={navigation.isRemovalBlocked(entry.key)}
            onWillAppear={() => event('transitionStart', false)}
            onDidAppear={() => event('transitionEnd', false)}
            onWillDisappear={() => event('transitionStart', true)}
            onDidDisappear={() => event('transitionEnd', true)}
            onNativeDismiss={(key) => {
              // UIKit already popped it. Remove the React view without sending
              // another activityMode=detached command during reconciliation.
              acknowledge(key)
              void navigation
                .acknowledgeNativeDismiss(key)
                .then(() => forget(key))
                .catch(onError)
            }}
            onNativeDismissPrevented={() => {
              void navigation.back({ target: entry.container }).catch(onError)
            }}
            onDismiss={forget}
          >
            {options.header ? (
              <VisitProvider entry={entry}>{content}</VisitProvider>
            ) : (
              content
            )}
          </Stack.Screen>
        )
      })}
    </Stack.Host>
  )
}
