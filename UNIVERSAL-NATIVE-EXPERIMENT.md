# Universal TanStack Start: native navigation experiment

For the current implementation, per-visit navigator architecture, and remaining
work, see [Native parity work](NATIVE-PARITY.md). This document records the initial
experiment and includes historical limitations.

## Goal and baseline

One application should retain TanStack's route definitions, typed params/search,
loaders, context, guards, and errors, with Start serving full-stack web and the
backend and native containers presenting screens on iOS/Android.

This is a clean implementation on upstream main `e7358c36d8`. The fork matched
upstream when work began. No commit from `feat/react-native` was merged or
cherry-picked. References:

- [Tanner's native experiment](https://github.com/TanStack/router/tree/feat/react-native)
- [Its renderer](https://github.com/TanStack/router/blob/af97669e8aa5f20c94802882f5ed1ec2024ee939/packages/react-native-router/src/Matches.tsx)
- [Its reuse/identity resolution](https://github.com/TanStack/router/blob/af97669e8aa5f20c94802882f5ed1ec2024ee939/packages/react-native-router/src/nativeNavigation.ts)
- [Screens 5 beta 1](https://github.com/software-mansion/react-native-screens/tree/3c5535f1c383828d3069eb58171c5c656a871f67)

This is an experiment, not a completed React Navigation replacement. The parity
gaps and verification status are explicit below.

## Current implementation

- Opt-in `@tanstack/router-core/navigation` presentation-history controller.
- Distinct destination identities, visit keys, and owning containers.
- Independent tab stacks, push/replace, nearest/oldest reuse, pop, reset, overlays.
- Async preparation with one transaction owner; superseded work cannot commit.
- Removal blockers and disposal of uncommitted acquired resources.
- Versioned serialization of destinations; restore runs preparation again.
- Native conditional entry on the existing `@tanstack/react-router` package.
- Main's route classes, hooks, match renderer, and loader engine remain shared.
- Screens v5 stack, tabs, form sheet, native dismissal reconciliation, hardware back.
- Entry-scoped rendering, retained stack state, and Activity for inactive entries.
- Start example with shared file routes, server functions for web, and an HTTP
  transport from native to the same backend.

## Route and navigation APIs

Both platforms use ordinary `createFileRoute`, `Route.useParams`,
`Route.useSearch`, `Route.useLoaderData`, `Route.useNavigate`, and `Link`.
The native binding adds optional navigation intent without changing destinations:

```tsx
await navigate({
  to: '/venues/$venueId',
  params: { venueId: '123' },
  search: { section: 'reviews' },
  target: 'search',
  stackBehavior: 'reuse',
  stackMatch: 'nearest',
})
```

The default is a new visit (`push`). Reuse is scoped to its target stack. A
matching identity does not discard changed search: the changed location is
validated/loaded while preserving the visit's React key. Optional `entryId`
controls reuse identity; data-cache identity is a separate concern.

Native container configuration is an optional `native` object in router options:

```tsx
native: {
  initialContainer: 'feed',
  containers: {
    feed: { initialHref: '/', title: 'Discover' },
    search: { initialHref: '/search', title: 'Search' },
    composer: { initialHref: '/compose', overlay: true },
  },
}
```

The example passes a portable options object. The browser router ignores native
presentation metadata. Native UI can use `useNavigation()` and `useIsFocused()`.

## Architecture changes and tradeoffs

### A destination is not a visit

`/venues/123` can exist simultaneously in Discover and Search, with different
drafts, scroll positions, and back destinations. A URL cannot encode every tab's
history and its overlays. Presentation state therefore contains `selected` and a
map of container stacks, with `{ key, container, href, identity, value }` entries.
The opaque value is an execution/render resource and is never persisted.

This controller is an opt-in subpath. Ordinary browser routers do not acquire an
always-running second history state machine.

### Execution scope is per visit

Main RouterCore owns one active location/match publication and navigation
transaction. Its React hooks read per-route match stores. Two simultaneous visits
to the same route cannot share those live stores safely.

This prototype gives each visit a Router instance with its own memory history,
stores, matches, context, and loader ownership. Instances share route definitions,
not user data. Returning to a retained visit reveals its existing scope; relative
navigation resolves against its originating visit. Initial loader redirects run
inside the preparing scope before it is connected to native presentation.

Tradeoff: built-in loader caches are currently per visit. They do not
automatically share cached loader data. An external QueryClient can be supplied
through context. A production implementation should consider a first-class
execution-scope API in router-core, sharing immutable matching metadata and data
generations while keeping match publication, context, and rendering per entry.
That change requires loader-lifetime coverage across all framework bindings,
SSR, preload, and invalidation; private-store mutation or copied transaction flags
are not an acceptable substitute.

### Reuse the React adapter, isolate host-specific behavior

The `react-native` export selects `src/index.native.tsx`. Metro selects `.native`
implementations for Link, provider, navigation/blocker hooks, error/not-found UI,
and scroll restoration. Most React code remains shared with main.

Shared router/provider modules avoid native basename imports resolving back to
the native module itself. Browser error UI is separated from generic boundary
mechanics. Native runtime compilation remains Metro-owned; native declaration output is built into `dist/native`. Native TypeScript consumers currently need `customConditions: ["react-native"]` and `moduleSuffixes: [".native", ""]`. A release compatibility matrix remains future work.

### Native acknowledgement and React lifetime differ

Screens v5 separates `onNativeDismiss`, `onDismiss`, and dismissal prevention.
Reconciliation uses visit keys so repeated native events cannot pop another entry.
Outgoing stack trees survive logical removal until native detachment finishes.
Tab selection uses Screens' provenance protocol; uncoordinated native repeated-tab
side effects are disabled.

Mounting, native attachment, focus, visibility, and effects are distinct. The
prototype keeps the current/previous selected stack entries active for back
transitions, pauses deeper/off-tab entries with Activity, and has keep-active
metadata. Transparent and adaptive presentation need a real visibility policy.

### Start is the server; native does not render HTML

The example uses platform-specific files deliberately:

```text
src/routes/*.tsx                 shared file routes
src/data.ts                      Start server-function transport for web
src/data.native.ts               native HTTP transport to Start endpoints
src/data.server.ts               backend implementation
src/ui/*.tsx                     web UI and HTML document shell
src/ui/*.native.tsx              native UI and shell
src/routeTree.gen.ts             generated web route tree
src/routeTree.gen.native.ts      generated native tree excluding api.* routes
```

The native tree is generated with the actual router generator. Server handlers
are excluded from the native dependency graph. This does not compile
`createServerFn` in Metro or claim native SSR/hydration. A later native Start RPC
compiler can replace the transport without changing routes or screens.

## Run

Use `.nvmrc` and the root packageManager pin. Install at the root and build
workspace dependencies through Nx before running the example:

```sh
CI=1 pnpm install --frozen-lockfile
CI=1 NX_DAEMON=false pnpm nx run-many \
  -p @tanstack/react-start,@tanstack/router-generator,@tanstack/react-router \
  -t build --skipRemoteCache
pnpm --filter tanstack-start-example-native dev
# Another terminal:
pnpm --filter tanstack-start-native-client ios
```

Native commands generate their tree first. Set `EXPO_PUBLIC_API_ORIGIN` for the
backend: localhost on an iOS simulator, usually `http://10.0.2.2:3050` on Android
emulators, or a reachable LAN URL on physical devices. Screens 5 requires a
matching development build; an arbitrary Expo Go binary is insufficient.

## Demonstration flows

1. Open Venue 123, enter a private note, push another visit, then return.
2. Open Venue 123 in both tabs and compare independent local state/history.
3. Reuse a visit with changed search to display reviews without adding an entry.
4. Open the composer sheet, enter a draft, and keep/discard it when leaving.
5. Swipe back and verify exactly one entry is removed.
6. On web, exercise shared routes, validated search, blocked navigation, server
   functions, and the API endpoint.

## Remaining parity work

| Area         | Further work                                                                                |
| ------------ | ------------------------------------------------------------------------------------------- |
| Containers   | Arbitrary nested stacks/tabs, drawer, pager, custom reducers                                |
| Actions      | Typed popTo, fallback/bubbling, nested instance targeting                                   |
| Presentation | All modal variants, transparent/adaptive layouts, sheet lifecycle polish                    |
| Root state   | Documented global focused-state projection, full imperative history compatibility           |
| Lifecycle    | Complete transition/gesture/focus events and visibility-driven policies                     |
| Blocking     | Exhaustive async cancellation, multiple blockers, native/JS races and tab policies          |
| Loading      | Shared cache generations, focus/resume invalidation, memory budgets                         |
| Linking      | Notifications, container selection, cold-link ancestry                                      |
| Persistence  | App migrations, auth-session invalidation, limits and restoration policies                  |
| Start/native | Metro server-function compilation and typed RPC/package/tooling parity                      |
| Publication  | Compiled native runtime exports, release type matrix, native devtools, Android verification |

### Deliberate prototype limits

Native requires React 19.2+ (`Activity`); this example uses React 19.3.0,
React Native 0.88.1, Expo 58.0.24, and Screens 5.0.0-beta.1. The browser's
React 18 peer support remains unchanged. One overlay container is supported;
multiple overlays are rejected rather than presented in an ambiguous order.
Only configured `native.linking.prefixes` are accepted. Expo bootstrap URLs
are ignored.

Dirty entries keep their effects active so Activity does not unregister removal
blockers. Outgoing entries stay active until native detachment. `InnerWrap`
runs per entry, while `Wrap` surrounds the whole app.

The following familiar APIs still need native semantics before production use:
custom navigation `state`, external Link URLs, the complete Link host-prop and
active matching contract, browser-style global Router state, and route
`onLeave`/`onStay` semantics when an entry is retained or removed. `useBlocker`
currently exposes the basic resolver, not the complete browser resolver payload.
Scoped `clearCache()` does not yet provide a first-class cancellation boundary
for every active pending loader; cancelled presentation work cannot publish, but
underlying work may continue until it settles. Per-entry scope disposal and
shared loader generations should be designed together.

## Validation log

Verified locally:

- iOS simulator native build succeeded (iPhone 18 Pro, iOS 27.2).
- Device checks: typed venue loading, duplicate visits, independent local draft
  retention after back, changed-search reuse, native tab switching, form sheet,
  keep/discard blocker resolution.
- Metro source map: 1,041 modules inspected; no `data.server`, API route,
  `react-dom`, or `@tanstack/react-start` runtime modules.
- Core/React unit suites, native host tests, consumer type inference, TypeScript
  compiler matrix, package export validation, example web/native types and web
  build have passed during implementation. The final combined 42-task run passed. Details are recorded
  in the measurement report below.
- Browser Playwright checks cover Start API/server data, typed navigation/search,
  and blocked composer navigation.

Native host tests use DOM stubs for deterministic adapter behavior; they do not
replace the real-device checks. Android has not been verified. Performance and
bundle comparisons are recorded in `RESULT-optimization-universal-native.md`.
