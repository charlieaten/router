# Native parity work

This document describes the current implementation after the initial universal
Start experiment. It is a progress record, not a claim of React Navigation parity.

## Run the app

From the repository root:

```sh
mise install
mise run native
```

The task builds workspace packages once, then starts the Start web/backend server
on port 3050 and Metro on port 8088 concurrently. Metro opens the installed iOS
development client. For the first native binary build, or after native dependency
changes, run `mise exec -- pnpm --filter tanstack-start-native-client ios`.
Xcode and an installed iOS Simulator runtime are prerequisites.

## Shared route definitions and server functions

The example now imports the same `src/data.ts` from both platforms. Its GET reads
and validated POST `saveReview` use ordinary `createServerFn`. There is no native
replacement module with a separately maintained REST implementation.

`@tanstack/react-start/plugin/metro` chains Start's existing compiler ahead of
Expo's Babel transformer. It removes server implementations and produces RPC
identities using the same application root and ID generator as the web compiler.
Metro's project-relative filenames are resolved against `options.projectRoot`
before generating these identities.

`configureNativeStart({ origin, fetch })` supplies the backend origin and fetch
implementation. The example uses `expo/fetch`. Serialization, middleware,
validation, errors, and cancellation use Start's existing RPC transport. Native
requests supply the configured backend's Origin when the caller did not supply
one; the server's request-origin validation remains enabled.

`serverFns.nativeEntries` in the Start build configuration discovers functions
reachable only from native entry modules for the production server manifest and
cold development-server ID validation. Development discovery uses the same Vite
identities as Metro and retains the surviving-client-graph boundary.
Native and web builds must share the same root and custom `generateFunctionId`
configuration. A native development build talking to a production backend must
select build-mode IDs in its Metro transformer.

The example saves reviews in server memory to demonstrate POST, invalidation,
and retained-view refresh. Reviews reset on server restart. This storage is not
a production database or authentication implementation.

## Presentation and execution ownership

Destination paths remain TanStack paths. Native presentation adds visit keys,
container targets, and push/replace/reuse/popTo/reset intent. Repeated visits to
one destination keep independent React state and loader execution lifetimes.

The presentation controller supports nested stacks, tabs, drawers, ordered
overlays, parent back bubbling, drawer closing on Back, entry state, and versioned
restoration. Navigator templates can be static, but route-owned instances belong
to a specific visit, including repeated visits to the same destination. Popping a branch or dismissing an overlay resets the retired
subtree's child selections as well as its entries.

Each visit owns a Router execution scope. Scope disposal retires pending work,
aborts its signals, settles render acknowledgements, and releases subscriptions.
Lifecycle callbacks are deferred until the presentation transaction commits;
reuse transfers lifecycle ownership rather than calling leave twice.

The root Router projects the focused scope's public state. It does not acquire
that scope's transaction or in-flight loader ownership. A bounded cache can share
accepted, replayable loader data; beforeLoad runs again with each scope's context.
Live streams and in-flight abort controllers are not shared across scopes.

Root invalidation refreshes retained scopes. A hidden React Activity releases its
paint acknowledgement ownership so background refresh can complete. It reacquires
that ownership when its layout effects reconnect.

## Native host reconciliation

Import `stack` from `@tanstack/react-router/stack`. The factory is also
importable in shared route files for platform-specific configuration.
Use it as the root router's `native` option or as a layout route's
`staticData.native.navigator`. Routes without a stack navigator render directly.
The default stack uses Screens v5 `Stack.Host` and `Stack.Screen`. A stack with
custom presentation needs can supply a `presenter` to `stack`.

```tsx
import { stack } from '@tanstack/react-router/stack'

const navigator = stack({ initialRoute: '/settings/profile' })
// Set staticData.native.navigator to navigator on the settings layout.
```

Set `stackHost` on the navigator to pass `colorScheme` and
`direction` to Screens. Route headers use Screens' `Stack.HeaderConfig` props.
When a host is the direct stack child of an iOS Screens split column, Screens
automatically opts into its native column navigation.

Registered overlay containers use Screens `FormSheet` by default.
`presentation: 'pageSheet'` opts into Screens `PageSheet`: UIKit presents a page
sheet on iOS, and Android presents a bottom sheet. Plain `'modal'` also uses
`PageSheet` on iOS unless the route supplies React Native `modal` props. On iOS,
`'containedModalReplacingContent'` hides the provider's content until dismissal;
`'containedModal'` and `'containedTransparentModal'` continue to overlay it.
Android uses a React Native modal for contained presentations. Ordinary stack
entries are pushed; custom stack renderers can interpret presentation options for
their own entries.

Drawer presentation uses a controlled sidebar. Use `renderContainer` to supply
another host.

Programmatic Back requests native detachment, then retains the outgoing React
view until the host confirms dismissal. Native Back is different: UIKit has
already removed the screen, so reconciliation removes the React view without
sending another `activityMode="detached"` command. A regression host enforces
this distinction and reproduced the double-pop crash before the fix.

Removal blockers prevent native dismissal before it happens. A native dismissal
acknowledgement records an already completed removal and bypasses blockers; it
cannot retrospectively cancel UIKit's completed action.

Persistence restores once and writes snapshots in order. Storage read/cleanup
failures are reported while fresh navigation initialization remains available.

## Remaining substantial gaps

- A native gesture-driven drawer. A Standard Navigation Material-style pager
  is now demonstrated; there is still no built-in default pager host.
- Complete deep-link source integration, destination/container mapping, and
  stricter URL-prefix boundaries.
- Comprehensive device coverage of stacked modals, interrupted gestures, rapid
  back/push sequences, restoration, Android system back, and native accessibility.
- Production deployment verification for native-only function manifests across
  Vite and Rsbuild, plus release-mode native builds.

## Per-visit nested navigator ownership

A route can declare a native navigator without changing its URL, loader, params,
search validation, navigation calls, or use of `<Outlet />`:

```tsx
staticData: {
  native: {
    navigator: (match, location) => ({
      initialContainer: 'feed',
      backBehavior: 'none',
      containers: {
        feed: { initialHref: `/workspaces/${match.params.workspaceId}/feed/1` },
        search: { initialHref: `/workspaces/${match.params.workspaceId}/search/1` },
      },
    }),
  },
}
```

The factory is accepted once per prepared parent execution. Its optional
`initialLocation: { href, target }` maps incoming deep locations to a child stack.
The example supplies this explicitly for feed/search deep links. Container IDs
are local to an instance; two workspace visits can both have a `feed` stack.
Explicit targets search the local namespace then owning ancestors. Navigating
to a parent route or outside the current boundary bubbles to its owning stack.

The implementation changes ownership in two places:

- `router-core/navigation`: an entry owns its child navigator. All instances in
  a tree share one transaction coordinator, key space, blocker registry, and
  cancellation authority. Initial descendants prepare before the parent becomes
  visible. Removing a parent checks descendant blockers and disposes descendants
  before their parent. Stale instances cannot dispatch Back or cancel a new
  transaction. Reuse preserves compatible nested entry keys and histories while
  repreparing execution scopes; React state remains associated with those keys.
- `router-core/execution-scope`: a parent execution ends at its navigator route.
  Children borrow ancestor match data/context through an explicit lease and run
  only the owned suffix of the route tree. Borrowing never transfers loader
  flights or abort-controller ownership. Parent resources retire after the last
  child lease releases, including when leave callbacks throw. Lifecycle callbacks
  only run for owned matches. Child viewports start after their borrowed parent,
  so ancestor layouts do not recursively render themselves.

Root invalidation refreshes independent visits concurrently, but refreshes each
parent before its children borrow updated data/context. Escaping loader redirects
reject the bounded candidate and retarget after that presentation transaction
settles. Ancestor not-found UI renders in the child viewport; failed parent
loaders render their error UI without instantiating children.

Snapshots are version 4, with structured nested objects and one outer JSON
serialization. Restoration has a cumulative entry budget, byte limit, and nesting
limit. It reconstructs route executions, not arbitrary React component state.
In-memory drafts survive retained visits; persist important drafts explicitly.

### Try the app demonstration

Run `mise run native`, then tap **Try independent nested stacks** on Discover.

1. Increment the parent counter. Push Feed page 2 and write a draft.
2. Switch to the inner Search tab and push another page.
3. Tap **Open another visit**. It opens the same workspace URL with a fresh
   parent counter, execution ID, Feed selection, and child stacks.
4. Use the top parent Back button to return. The first visit still has its
   Search selection, both stack histories, parent counter, and retained drafts.
5. Use the child Back button or header to pop inside that visit; at a child root,
   Back bubbles to the owning parent when no local action remains.

The web version uses the same route tree and ordinary URL/Outlet navigation.
Native navigator definitions live in a platform-specific module; no separate
native route tree is authored by hand. Generated trees remain generator-owned.

## Per-visit ownership device verification

Verified on iPhone 18 Pro simulator (iOS 27.2): open the workspace lab, push Feed
and Search independently, enter a different draft on each second page, then open
another visit to the same workspace URL. The second visit starts with fresh
child stacks and parent counter. Native child-header Back pops only its child
stack; native outer-header Back returns to the earlier visit with its counter,
selected tab, stack positions, and drafts preserved. Inner edge-swipe Back and
outer edge-swipe Back at the child root both completed without a crash.

Android device behavior remains unverified in this change.

## Standard Navigation integration

Version-one Standard Navigators can now be adapted with
`integrateStandardNavigator` while TanStack retains route and per-visit ownership.
The app demonstrates custom Tastebuds-style Lottie tabs and Saved Archive/Buds
Material-style swipe tabs, including cancellable Post presses and repeated-visit
state retention. See [STANDARD-NAVIGATION.md](./STANDARD-NAVIGATION.md) for the
API, demo, and native-stack mapper limitations.

Device verification also exposed a retained-sheet disposal bug. The core now
settles and clears pending paint acknowledgement contents without deleting the
object still referenced by an outgoing native view. Closing Post's sheet now
returns to the retained nested navigator without a render error.
