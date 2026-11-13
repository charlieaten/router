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
reachable only from native entry modules for the production server manifest.
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

The presentation controller supports static nested stacks, tabs, drawers, ordered
overlays, parent back bubbling, drawer closing on Back, entry state, and versioned
restoration. Popping a branch or dismissing an overlay resets the retired
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

Screens v5 Stack, Tabs, FormSheet, and contained modal primitives provide native
presentation. Other modal variants use React Native Modal. Drawer presentation
currently uses a controlled sidebar; `renderContainer` can supply another host.

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

- Per-visit nested navigator instances: the current nested container tree is
  static. Two visits to a parent route cannot yet each instantiate an independent
  child navigator with shared ancestor loader ownership.
- A native gesture-driven drawer and default pager host.
- Complete deep-link source integration, destination/container mapping, and
  stricter URL-prefix boundaries.
- Comprehensive device coverage of stacked modals, interrupted gestures, rapid
  back/push sequences, restoration, Android system back, and native accessibility.
- Production deployment verification for native-only function manifests across
  Vite and Rsbuild, plus release-mode native builds.

The per-visit nesting gap needs a core architecture change: one presentation
transaction should prepare a bounded parent execution and its child executions,
with explicit leases for borrowed ancestor matches. Mounting a second full Router
inside a route would duplicate ancestor loaders and lifecycle ownership and can
recurse through the same layout. That is not an acceptable implementation.
