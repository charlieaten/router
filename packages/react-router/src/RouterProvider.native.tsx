import * as React from 'react'
import {
  AppState,
  BackHandler,
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native'
import {
  ContainedModalOverContent,
  ContainedModalProvider,
  FormSheet,
  Stack,
  Tabs,
} from 'react-native-screens'
import { Matches } from './Matches'
import { RouterContextProvider } from './RouterProviderShared'
import { nativeOutletContext } from './native/outlet-context'
import { VisitProvider } from './native/visit'
import {
  emitNativeNavigationEvent,
  flushNativeNavigation,
  getEntryNavigatorOptions,
  getNativeNavigation,
  getScreenOptions,
} from './native/controller'
import type { RouterProps } from './RouterProviderShared'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'
import type { NavigationSnapshot } from '@tanstack/router-core/navigation'
import type {
  NativeContainerRenderProps,
  NativeEntry,
  NativeNavigation,
} from './native/controller'

function Entry({ entry, active }: { entry: NativeEntry; active: boolean }) {
  const owner = getNativeNavigation(entry.value).getOwner()
  const Wrap = entry.value.options.Wrap ?? React.Fragment
  const definition = getEntryNavigatorOptions(entry)
  const nested =
    entry.navigator && definition
      ? {
          routeId: entry.value.state.matches.at(-1)!.routeId,
          content: (
            <NavigationSurface
              router={entry.value}
              navigation={entry.navigator}
              config={{ ...entry.value.options.native!, ...definition }}
              selected={active}
            />
          ),
        }
      : undefined
  return (
    <React.Activity mode={active ? 'visible' : 'hidden'}>
      <VisitProvider entry={entry}>
        <Wrap>
          <nativeOutletContext.Provider value={nested}>
            <Matches
              afterRouteId={owner?.entry.value.state.matches.at(-1)?.routeId}
            />
          </nativeOutletContext.Provider>
        </Wrap>
      </VisitProvider>
    </React.Activity>
  )
}

function useRetained<T extends { key: string }>(
  items: Array<T>,
  retain?: (item: T) => boolean,
) {
  const [retained, setRetained] = React.useState(items)
  const nativeDismissed = React.useRef(new Set<string>())
  const current = new Map(items.map((item) => [item.key, item]))
  const keys = new Set(retained.map((item) => item.key))
  const rendered = [
    ...retained.map((item) => current.get(item.key) ?? item),
    ...items.filter((item) => !keys.has(item.key)),
  ].filter(
    (item) =>
      current.has(item.key) ||
      (!nativeDismissed.current.has(item.key) && retain?.(item) !== false),
  )
  React.useLayoutEffect(() => {
    setRetained((previous) => {
      const current = new Map(items.map((item) => [item.key, item]))
      const keys = new Set(previous.map((item) => item.key))
      return [
        ...previous.map((item) => current.get(item.key) ?? item),
        ...items.filter((item) => !keys.has(item.key)),
      ].filter((item) => current.has(item.key) || retain?.(item) !== false)
    })
  }, [items, retain])
  const forget = (key: string) => {
    nativeDismissed.current.delete(key)
    setRetained((previous) => previous.filter((item) => item.key !== key))
  }
  return {
    rendered,
    current,
    forget,
    acknowledge: (key: string) => nativeDismissed.current.add(key),
  }
}

function NativeStack({
  entries,
  navigation,
  selected,
  onError,
}: {
  entries: Array<NativeEntry>
  navigation: NativeNavigation
  selected: boolean
  onError: (error: unknown) => void
}) {
  const { rendered, current, forget, acknowledge } = useRetained(entries)
  return (
    <Stack.Host>
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
            <Stack.HeaderConfig
              title={options.title ?? entry.href}
              {...options.header}
            />
            <Entry
              entry={entry}
              active={
                !!options.keepActive ||
                index < 0 ||
                navigation.isRemovalBlocked(entry.key) ||
                (selected && index >= entries.length - 2)
              }
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

function BranchStack({
  items,
  selected,
  onBack,
}: {
  items: NativeContainerRenderProps['children']
  selected: string
  onBack: (native: boolean) => Promise<boolean>
}) {
  const { rendered, current, forget, acknowledge } = useRetained(items)
  return (
    <Stack.Host>
      {rendered.map((item) => (
        <Stack.Screen
          key={item.key}
          screenKey={item.key}
          activityMode={current.has(item.key) ? 'attached' : 'detached'}
          preventNativeDismiss={item.preventDismiss}
          onNativeDismissPrevented={() => {
            void onBack(false)
          }}
          onNativeDismiss={(key) => {
            acknowledge(key)
            void onBack(true).then(() => forget(key))
          }}
          onDismiss={forget}
        >
          <Stack.HeaderConfig hidden />
          {item.content}
        </Stack.Screen>
      ))}
    </Stack.Host>
  )
}

function TabsHost({
  items,
  selected,
  onSelect,
}: {
  items: NativeContainerRenderProps['children']
  selected: string
  onSelect: (id: string) => void
}) {
  const provenance = React.useRef(0)
  return (
    <Tabs.Host
      navStateRequest={{
        selectedScreenKey: selected,
        baseProvenance: provenance.current,
      }}
      rejectStaleNavStateUpdates
      onTabSelected={(event) => {
        provenance.current = event.nativeEvent.provenance
        if (event.nativeEvent.selectedScreenKey !== selected) {
          onSelect(event.nativeEvent.selectedScreenKey)
        }
      }}
      onTabSelectionRejected={(event) => {
        provenance.current = event.nativeEvent.provenance
        if (event.nativeEvent.rejectionReason === 'stale') {
          onSelect(event.nativeEvent.selectedScreenKey)
        }
      }}
    >
      {items.map((item) => (
        <Tabs.Screen
          {...item.tab}
          key={item.key}
          screenKey={item.key}
          title={item.title}
          specialEffects={{
            repeatedTabSelection: { popToRoot: false, scrollToTop: false },
          }}
        >
          {item.content}
        </Tabs.Screen>
      ))}
    </Tabs.Host>
  )
}

function DrawerHost(props: NativeContainerRenderProps) {
  return (
    <View style={{ flex: 1 }}>
      {props.children.map((child) => (
        <View
          key={child.key}
          style={{
            flex: 1,
            display: child.key === props.selected ? 'flex' : 'none',
          }}
        >
          {child.content}
        </View>
      ))}
      <Modal
        visible={props.open}
        transparent
        animationType="fade"
        onRequestClose={() => props.onOpenChange(false)}
      >
        <View
          style={{ flex: 1, flexDirection: 'row', backgroundColor: '#0005' }}
        >
          <View
            accessibilityViewIsModal
            style={{
              width: 300,
              backgroundColor: '#f7f5ef',
              padding: 24,
              paddingTop: 70,
              gap: 20,
            }}
          >
            {props.children.map((child) => (
              <Pressable
                key={child.key}
                accessibilityRole="button"
                accessibilityState={{ selected: child.key === props.selected }}
                onPress={() => props.onSelect(child.key)}
              >
                <Text>{child.title}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => props.onOpenChange(false)}
            >
              <Text>Close navigation</Text>
            </Pressable>
          </View>
          <Pressable
            style={{ flex: 1 }}
            accessibilityLabel="Close navigation"
            onPress={() => props.onOpenChange(false)}
          />
        </View>
      </Modal>
    </View>
  )
}

// Standard navigator params are flat; TanStack keeps path params and search separate.
function standardParams(router: AnyRouter, name: string, values?: object) {
  if (!values) {
    return {}
  }
  const normalized = name.replace(/\/$/, '') || '/'
  if (!router.routesByPath[normalized] && !router.routesByPath[name]) {
    throw new Error(`Unknown TanStack route: ${name}`)
  }
  const names = new Set(
    name
      .split('/')
      .flatMap((part) =>
        Array.from(part.matchAll(/\$([A-Za-z0-9_]+)/g), (match) => match[1]!),
      ),
  )
  if (name.endsWith('/$')) {
    names.add('_splat')
  }
  return {
    params: Object.fromEntries(
      Object.entries(values).filter(([key]) => names.has(key)),
    ),
    search: Object.fromEntries(
      Object.entries(values).filter(([key]) => !names.has(key)),
    ),
  }
}

function NativeContainer({
  id,
  router,
  config = router.options.native!,
  navigation,
  state,
  selected,
  onError,
}: {
  id?: string
  config?: NonNullable<AnyRouter['options']['native']>
  router: AnyRouter
  navigation: NativeNavigation
  state: NavigationSnapshot<AnyRouter>
  selected: boolean
  onError: (error: unknown) => void
}) {
  const definitions = config.containers
  const children = navigation.getChildren(id)
  if (id && !children.length) {
    const CustomStack = config.renderStack
    if (CustomStack) {
      const entries = state.stacks[id]!
      const options = entries.map(getScreenOptions)
      // A sheet shares its preceding native page slot. Keep the last two page
      // groups renderable for native pushes/pops, not just two logical visits.
      let page = -1
      const pages = options.map((option) => {
        if (page < 0 || option.presentation !== 'formSheet') {
          page++
        }
        return page
      })
      return (
        <CustomStack
          id={id}
          kind="stack"
          selected={entries.at(-1)?.key ?? ''}
          navigation={navigation}
          routes={entries.map((entry) => {
            const match = entry.value.state.matches.at(-1)!
            return {
              key: entry.key,
              name: entry.value.routesById[match.routeId]!.fullPath,
              href: entry.href,
              params: { ...match.search, ...match.params },
            }
          })}
          children={entries.map((entry, index) => ({
            key: entry.key,
            title: options[index]!.title ?? entry.href,
            preventDismiss: navigation.isRemovalBlocked(entry.key),
            options: options[index],
            wrap: (children) => (
              <VisitProvider entry={entry}>{children}</VisitProvider>
            ),
            content: (
              <Entry
                entry={entry}
                active={
                  !!options[index]!.keepActive ||
                  navigation.isRemovalBlocked(entry.key) ||
                  (selected && pages[index]! >= page - 1)
                }
              />
            ),
          }))}
          onNavigate={(name, params) => {
            const scope = entries.at(-1)?.value ?? router
            void scope
              .navigate({
                to: name,
                ...standardParams(scope, name, params),
                target: id,
              } as never)
              .catch(onError)
          }}
          onBack={() => {
            void navigation.back({ target: id }).catch(onError)
          }}
          onSelect={(key) => {
            void navigation.popTo({ target: id, key }).catch(onError)
          }}
          open={false}
          onOpenChange={() => {}}
        />
      )
    }
    return (
      <NativeStack
        entries={state.stacks[id]!}
        navigation={navigation}
        selected={selected}
        onError={onError}
      />
    )
  }
  const selectedChild = id ? state.selectedChildren[id]! : state.selected
  const kind = (id ? definitions[id]?.kind : config.rootKind) ?? 'tabs'
  const ordered =
    kind === 'stack'
      ? (state.childHistory[id ?? '$root'] ?? [selectedChild])
      : children
  const items = ordered.map((key) => ({
    key,
    title: definitions[key]!.title ?? key,
    tab: definitions[key]!.tab,
    preventDismiss: Object.values(state.stacks)
      .flat()
      .some((entry) => {
        let id = entry.container
        while (id !== key) {
          const parent = definitions[id]?.parent
          if (!parent) {
            return false
          }
          id = parent
        }
        return navigation.isRemovalBlocked(entry.key)
      }),
    content: (
      <NativeContainer
        id={key}
        config={config}
        router={router}
        navigation={navigation}
        state={state}
        selected={selected && selectedChild === key}
        onError={onError}
      />
    ),
  }))
  const Custom = config.renderContainer
  const routes = Custom
    ? items.map((item) => {
        const entry = navigation.getActiveEntry({
          ...state,
          selected: item.key,
          overlays: [],
        })
        const match = entry?.value.state.matches.at(-1)
        return {
          key: item.key,
          name: item.key,
          href: entry?.href ?? definitions[item.key]?.initialHref,
          params: match ? { ...match.search, ...match.params } : undefined,
        }
      })
    : []
  const props: NativeContainerRenderProps = {
    id: id ?? '$root',
    navigation,
    routes,
    onNavigate: (name, params) => {
      if (!children.includes(name)) {
        throw new Error(`Unknown navigator route: ${name}`)
      }
      if (params === undefined) {
        void navigation.select(name).catch(onError)
        return
      }
      const route = routes.find((route) => route.name === name)!
      const current = route.params ?? {}
      if (
        Object.keys(current).length === Object.keys(params).length &&
        Object.entries(params).every(([key, value]) =>
          Object.is(value, current[key as keyof typeof current]),
        )
      ) {
        void navigation.select(name).catch(onError)
        return
      }
      const destination = route.href
      if (!destination) {
        throw new Error('Navigating with params requires an initialHref')
      }
      const match = router
        .getMatchedRoutes(destination.split(/[?#]/, 1)[0]!)[0]
        .at(-1)!
      let leaf = name
      while (state.selectedChildren[leaf]) {
        leaf = state.selectedChildren[leaf]!
      }
      const entry = state.stacks[leaf]?.at(-1)
      const scope =
        entry?.navigator?.getActiveEntry()?.value ?? entry?.value ?? router
      void scope
        .navigate({
          to: match.fullPath,
          ...standardParams(scope, match.fullPath, params),
          target: name,
          entryId: entry?.identity,
          stackBehavior: 'reuse',
        } as never)
        .catch(onError)
    },
    onBack: () => {
      void navigation.back().catch(onError)
    },
    kind,
    selected: selectedChild,
    children: items,
    onSelect: (key) => {
      void navigation.select(key).catch(onError)
    },
    open: state.openDrawers.includes(id ?? '$root'),
    onOpenChange: (open) => {
      void navigation.setDrawerOpen(id ?? '$root', open).catch(onError)
    },
  }
  if (Custom) {
    return <Custom {...props} />
  }
  if (kind === 'custom') {
    throw new Error('Custom navigation containers require renderContainer')
  }
  if (kind === 'drawer') {
    return <DrawerHost {...props} />
  }
  if (kind === 'stack') {
    return (
      <BranchStack
        items={items}
        selected={selectedChild}
        onBack={(native) =>
          navigation.back({ ignoreBlocker: native }).catch((error) => {
            onError(error)
            return false
          })
        }
      />
    )
  }
  return (
    <TabsHost
      items={items}
      selected={selectedChild}
      onSelect={props.onSelect}
    />
  )
}

interface Overlay {
  key: string
  id: string
  state: NavigationSnapshot<AnyRouter>
  entry: NativeEntry
  container: string
}
function retainOverlay(item: Overlay) {
  const presentation = getScreenOptions(item.entry).presentation
  return (
    Platform.OS !== 'android' ||
    !['modal', 'fullScreenModal', 'transparentModal'].includes(
      presentation ?? '',
    )
  )
}
function NativeOverlays({
  items,
  router,
  config,
  navigation,
  onError,
}: {
  config: NonNullable<AnyRouter['options']['native']>
  items: Array<Overlay>
  router: AnyRouter
  navigation: NativeNavigation
  onError: (error: unknown) => void
}) {
  const { rendered, current, forget } = useRetained(items, retainOverlay)
  const render = (index: number): React.ReactNode => {
    const item = rendered[index]
    if (!item) {
      return null
    }
    const active = current.get(item.key)
    const options = getScreenOptions(item.entry)
    const close = () => {
      void navigation
        .acknowledgeNativeDismiss(item.entry.key)
        .then((removed) => {
          if (removed) {
            forget(item.key)
          }
        })
        .catch(onError)
    }
    const requestClose = () => {
      void navigation.back({ target: item.container }).catch(onError)
    }
    const blocked = Object.values((active?.state ?? item.state).stacks)
      .flat()
      .some((entry) => {
        let id = entry.container
        while (id !== item.id) {
          const parent = config.containers[id]?.parent
          if (!parent) {
            return false
          }
          id = parent
        }
        return navigation.isRemovalBlocked(entry.key)
      })
    const content = (
      <View style={{ flex: 1 }}>
        <NativeContainer
          id={item.id}
          config={config}
          router={router}
          navigation={navigation}
          state={active?.state ?? item.state}
          selected={!!active}
          onError={onError}
        />
        {render(index + 1)}
      </View>
    )
    const event = (
      type: 'transitionStart' | 'transitionEnd',
      closing: boolean,
    ) =>
      emitNativeNavigationEvent(navigation, {
        type,
        target: item.entry.key,
        closing,
      })
    if (!options.presentation || options.presentation === 'formSheet') {
      return (
        <FormSheet
          key={item.key}
          {...options.sheet}
          isOpen={!!active}
          preventNativeDismiss={blocked}
          onWillAppear={() => event('transitionStart', false)}
          onDidAppear={() => event('transitionEnd', false)}
          onWillDisappear={() => event('transitionStart', true)}
          onDidDisappear={() => event('transitionEnd', true)}
          onDismiss={() => forget(item.key)}
          onNativeDismiss={() => {
            close()
            forget(item.key)
          }}
          onNativeDismissPrevented={requestClose}
        >
          {content}
        </FormSheet>
      )
    }
    if (
      options.presentation === 'containedModal' ||
      options.presentation === 'containedTransparentModal'
    ) {
      return (
        <ContainedModalOverContent
          key={item.key}
          isOpen={!!active}
          targetContainerId="tanstack-root"
          onDidDisappear={() => forget(item.key)}
          onPresentationRejected={requestClose}
        >
          {content}
        </ContainedModalOverContent>
      )
    }
    return (
      <Modal
        key={item.key}
        {...options.modal}
        visible={!!active}
        transparent={options.presentation === 'transparentModal'}
        presentationStyle={
          options.presentation === 'fullScreenModal'
            ? 'fullScreen'
            : options.presentation === 'transparentModal'
              ? 'overFullScreen'
              : 'pageSheet'
        }
        animationType={
          options.presentation === 'transparentModal' ? 'fade' : 'slide'
        }
        allowSwipeDismissal={!blocked}
        onRequestClose={requestClose}
        onShow={() => event('transitionEnd', false)}
        onDismiss={() => {
          forget(item.key)
          event('transitionEnd', true)
        }}
      >
        {content}
      </Modal>
    )
  }
  return render(0)
}

function NavigationSurface({
  router,
  navigation,
  config,
  selected = true,
}: {
  router: AnyRouter
  navigation: NativeNavigation
  config: NonNullable<AnyRouter['options']['native']>
  selected?: boolean
}) {
  const state = React.useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  )
  const [error, setError] = React.useState<unknown>()
  if (error) {
    throw error
  }
  const overlays: Array<Overlay> = state.overlays.flatMap((id) => {
    let container = id
    while (navigation.getChildren(container).length) {
      container = state.selectedChildren[container]!
    }
    const entry = state.stacks[container]![0]
    return entry ? [{ key: id, id, container, entry, state }] : []
  })
  return (
    <View style={{ flex: 1 }}>
      <NativeContainer
        router={router}
        config={config}
        navigation={navigation}
        state={state}
        selected={selected}
        onError={setError}
      />
      <NativeOverlays
        items={overlays}
        config={config}
        router={router}
        navigation={navigation}
        onError={setError}
      />
    </View>
  )
}

export function RouterProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRouter, TDehydrated>) {
  const navigation = getNativeNavigation(router)
  const [error, setError] = React.useState<unknown>()
  React.useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigation.canGoBack()) {
        return false
      }
      void navigation.back().catch(setError)
      return true
    })
    const open = (url: string) => {
      const prefix = router.options.native?.linking?.prefixes.find((prefix) =>
        url.startsWith(prefix),
      )
      if (!prefix) {
        return
      }
      const destination = `/${url.slice(prefix.length).replace(/^\/+/, '')}`
      void router.navigate({ to: destination } as never).catch(setError)
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
    let previous = AppState.currentState
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        void flushNativeNavigation(navigation).catch(setError)
      }
      if (
        state === 'active' &&
        previous !== 'active' &&
        router.options.native?.invalidateOnResume
      ) {
        void router.invalidate().catch(setError)
      }
      previous = state
    })
    return () => {
      back.remove()
      link.remove()
      appState.remove()
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
    <RouterContextProvider router={router} {...rest}>
      <ContainedModalProvider containerId="tanstack-root" style={{ flex: 1 }}>
        <NavigationSurface
          router={router}
          navigation={navigation}
          config={router.options.native!}
        />
      </ContainedModalProvider>
    </RouterContextProvider>
  )
}
