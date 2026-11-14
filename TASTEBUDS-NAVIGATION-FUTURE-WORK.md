# Tastebuds navigation: future integration work

Source audit: 14 November 2026. This document compares the current Tastebuds
navigation code in `../tastebuds` with this repository's native TanStack Router
experiment. It is a migration plan, not a completed migration or device audit of
Tastebuds. See [NATIVE-PARITY.md](./NATIVE-PARITY.md) for the implementation's
current capabilities and broader limitations.

## Standard Navigation implementation update

The router now supports the version-one `standard-navigation` contract through
`integrateStandardNavigator`. The existing Start native example includes a
Tastebuds-shaped fixture with five custom bottom tabs (Groups omitted by request),
matching animated My/avatar icon, copied Lottie assets,
intercepted Post presses, and Saved's Archive/Buds Material-style swipe pager.
The demo is a root-stack route outside the main Discover/Search tabs. Both
custom navigators use the standard contract rather than React Navigation routing. TanStack still owns all routes, loaders, per-visit histories, blockers,
and nested navigator lifetimes.

See [STANDARD-NAVIGATION.md](./STANDARD-NAVIGATION.md) for APIs, action semantics,
run instructions, native stack mapper limitations, and the demo source. See
[the measurement report](./RESULT-optimization-standard-navigation.md) for
validation. This completes the initial custom-host/pager fixture work below;
it does not migrate Tastebuds itself or finish auth and linking integration.

## Assessment

Tastebuds' navigation hierarchy can be expressed with the per-visit navigator
ownership architecture. No further fundamental ownership redesign was apparent
from the audited structure. Achieving equivalent behavior still requires integration of the demonstrated custom
hosts, authentication integration, nested linking, and migration of screen
infrastructure. Structural compatibility does not establish production parity.

The active native entry point registers `App.tsx`, which explicitly constructs
React Navigation navigators. The `app/` directory and Expo Router dependency do
not define the active native hierarchy.

## Current hierarchy

```text
Root native stack
├─ Tabs
│  ├─ Map
│  │  └─ Native stack: Map → Search
│  ├─ Explore
│  ├─ Post action → authenticated Create Review flow
│  ├─ Groups
│  ├─ Activity
│  └─ Saved
│     └─ Swipeable top tabs: Archive / Buds
├─ Venue / Review / User / Collection screens
├─ Review creation and review-session steps
├─ Settings and password-reset steps
├─ Authentication screens, conditionally available
└─ Onboarding screens, conditionally available
```

Primary sources in the adjacent Tastebuds checkout:

- [Native entry](../tastebuds/apps/native/entry.tsx)
- [Root navigator, auth groups, linking, navigation adapter, analytics](../tastebuds/apps/native/App.tsx)
- [Bottom tabs and Map stack](../tastebuds/apps/native/screens/tabs.tsx)
- [Saved top tabs and tab-press behavior](../tastebuds/apps/native/app/%28tabs%29/saved.tsx)
- [Custom tab buttons and Post action](../tastebuds/apps/native/components/tabs.tsx)

These links describe the audited working tree and may move as Tastebuds evolves.

## Capability mapping

| Tastebuds pattern                                   | Current experiment                                          | Future work                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Root stack above retained tabs                      | Supported                                                   | Configure and test detail-screen return behavior.                                  |
| Independent bottom-tab state                        | Supported                                                   | Preserve current initialization and Back policy.                                   |
| Map → Search nested stack                           | Supported through visit-owned navigators                    | Test selection, Search Back, and Map state retention.                              |
| Saved Archive/Buds tabs                             | Ownership and selection supported                           | Demo implemented through Standard Navigation; integrate and validate in Tastebuds. |
| Repeated venue visits                               | Independent visit keys and execution lifetimes supported    | Verify scroll, drafts, and nested state on duplicate visits.                       |
| Review-session steps                                | Push, replace, pop-to, and reset supported                  | Translate each flow and verify its resulting history.                              |
| Transparent modal venue picker and password success | Presentation types available                                | Verify these exact overlays, gestures, and underlying state on devices.            |
| Dirty bio/username confirmation                     | Native `useBlocker` and descendant removal checks available | Port confirmation UI and test every removal path.                                  |
| Focus refresh and analytics                         | Focus, blur, state, and transition events available         | Adapt React Navigation consumers and verify focused visit identity.                |
| Component-owned sheets                              | Can remain component-owned                                  | Retain their own close prevention and sheet-stack behavior.                        |

## Proposed route organization

Use a pathless tabs layout that owns the six bottom-tab containers. Give the Map
branch its own native navigator and Saved its own Archive/Buds navigator. Keep
detail, authentication, settings, and review-flow screens in the root
presentation stack so they can cover the tabs without destroying their state.

Pathless layouts and platform-specific navigator modules should preserve public
URLs such as `/`, `/search`, `/saved/archive`, and `/saved/buds`. Shared TanStack
routes, params, search validation, loaders, links, and `Outlet` remain the route
API. Native navigator definitions describe presentation ownership rather than a
second set of destination definitions.

Do not infer native stack nesting from every URL prefix. In the current app,
many related paths are sibling root-stack screens. Preserve that behavior unless
a deliberate product change calls for nesting.

## 1. Custom tabs and Saved pager

The bottom bar is application UI, not just a list of native tab icons:

- Its position and chrome animate with the Map sheet.
- Buttons have Lottie animations, haptics, and long-press behavior.
- Post launches an authenticated action rather than selecting its tab normally.
- Pressing Saved toggles its nested Archive/Buds selection.
- Saved uses a swipeable material top-tab navigator with custom labels.

The demo now uses `integrateStandardNavigator` through `renderContainer` for the
custom bar and Material-style pager. Cancellable typed `tabPress` events implement
Post interception and selected-Saved toggling. Standard actions request selection
from the owning TanStack navigator; the hosts do not keep a second selection
history. The default native tabs remain available for platform-provided UI.

Remaining work is integration with the actual Map sheet animation, haptics,
long-press behavior, authentication gate, badges, and app-specific styling.
The Material pager uses `react-native-tab-view`, the presentation primitives of
Material Top Tabs, rather than embedding a React Navigation navigator.

Acceptance: all six tabs retain their state; Post leaves the previous tab
selected; Saved press and swipe stay synchronized; Map sheet/bar animation,
haptics, long press, safe areas, and accessibility remain functional.

## 2. Authentication handoff and history cleanup

Tastebuds conditionally registers auth/main screen groups and uses
`UNSTABLE_routeNamesChangeBehavior: "lastUnhandled"`. Its Effect-based
[AuthGate](../tastebuds/apps/native/lib/effect/auth.ts) suspends protected actions,
resumes them after login, and cancels them when authentication is dismissed.

TanStack route guards can express access rules, but a `beforeLoad` redirect alone
does not reproduce conditional screen removal or the pending-action lifecycle.
Retain AuthGate and explicitly integrate:

- Opening authentication once for concurrent protected actions.
- Successful login and continuation of the original action.
- Cancellation on auth removal without cancelling a successfully resumed action.
- Removal of obsolete auth screens after login.
- Protected-history cleanup and reset on logout or account change.
- Required profile-name setup and direct protected deep links.

The experiment's event API has no `beforeRemove` equivalent. Choose an explicit
visit-lifecycle integration for AuthGate cancellation; do not assume blur means
removal. Authentication currently uses a removal listener in
[auth.tsx](../tastebuds/apps/native/screens/auth.tsx).

Acceptance: cancelled login never resumes a protected action; successful login
resumes it exactly once; Back cannot reveal stale auth or protected screens after
a session transition. Test both retained tabs and direct links.

## 3. Return data to an existing review draft

The [venue picker](../tastebuds/apps/native/app/reviews/create/venue.tsx) currently
uses `StackActions.popTo("reviews/create", { venue }, { merge: true })`.

The experiment's plain `popTo` returns to an existing entry without updating its
search values. Its existing reuse operation can prepare the updated destination,
preserve the visit key, and remove entries above it:

```tsx
navigate({
  to: '/reviews/create',
  search: { venue: venue.id },
  stackBehavior: 'reuse',
})
```

This is a proposed translation, not a tested Tastebuds migration. Search merging
must be explicit if other search values exist. Current default visit identity
uses the pathname, excluding search/hash. If concurrent drafts become possible,
use an explicit draft identity so reuse targets the intended draft.

Acceptance: selecting a venue closes the picker and updates the original draft
without losing text, images, ratings, or participants. Verify repeated picker
opens, cancellation, and fallback when no draft exists.

Other history-sensitive flows include review confirmation's pop-to-top,
invitation-to-rating replacement, and password reset's pop-to-account followed
by replacement with success. Translate sequential dispatches into awaited
operations and test the final history; do not assume asynchronous native
transactions behave like synchronous React Navigation dispatches.

## 4. Nested links and notifications

Tastebuds accepts Expo development URLs, `tastebuds://`, and
`https://tastebuds.space` links. Notifications currently select Activity.

The experiment integrates initial and incoming URLs, but currently strips a
matching prefix and navigates to the remaining path. Complete:

- Strict scheme/host/path-prefix boundaries.
- Destination-to-container mapping for nested routes.
- Correct initial tab and child selection on cold launch.
- Warm-link behavior with retained visits and existing histories.
- Authentication continuation for protected links.
- Notification navigation to Activity without unnecessary parent duplication.

Acceptance: `/search`, `/saved/buds`, a venue detail, and a protected review-session
link work on cold and warm launches. Verify custom scheme and HTTPS separately,
with query values preserved and malformed or foreign URLs rejected appropriately.

## 5. Screen helpers, visit identity, and integrations

Tastebuds' [screen helpers](../tastebuds/apps/native/lib/navigation/create-screen.ts)
provide typed params, query metadata, layouts, and options. Its
[shared destination adapter](../tastebuds/apps/native/lib/navigation/destinations.ts)
already uses TanStack-shaped `to`, `params`, and `search` targets, which makes it a
useful migration boundary.

Replace React Navigation-specific hooks and option setters with TanStack route
hooks and native presentation APIs. Preserve runtime validation: some existing
web route wrappers use type assertions for search rather than validation.

The [scroll registry](../tastebuds/apps/native/components/scroll.tsx) uses
`route.key`. Map it to a presentation visit key, not a route ID or pathname, and
prune it when visits are disposed. Repeated visits must not share scroll state.

Adapt focus-based refresh, bottom-tab-height consumers, PostHog screen tracking,
and Sentry navigation instrumentation. Existing React Navigation instrumentation
is not automatically compatible with the new navigator. Verify events against
the focused leaf visit, including nested tabs and repeated destinations.

Keep Relay and the Phoenix/Ash GraphQL backend. Navigation migration does not
require replacing their data model or transport with Start server functions.
Tastebuds already has a TanStack Start web app whose wrappers embed React
Navigation screens; progressively replace those wrappers while preserving SSR,
Relay integration, metadata, and existing browser navigation behavior.

## 6. Removal guards and component sheets

Port dirty bio/username screens from `usePreventRemove` to native `useBlocker`.
Verify header Back, swipe Back, Android Back, replacement, reset, and removal of
an owning parent visit. A descendant's unsaved state must guard ancestor removal.

Tastebuds also uses Gorhom sheets, TrueSheet, and component-owned sheet stacks.
Keep those where appropriate, including their separate `usePreventSheetClose`
behavior. Route-level blockers do not automatically govern arbitrary component
sheet dismissal. Test sheet dismissal and route removal together when a sheet
contains editable state.

## Suggested implementation order

1. Use the implemented Standard Navigation fixture as the migration harness.
   Expand it to reproduce Tastebuds' exact Map/Search URLs and screen policies.
2. Integrate the demonstrated bottom bar/pager with real Map sheet animation,
   haptics, long presses, badges, and authentication.
3. Add the review-draft picker round trip as a public regression.
4. Complete nested linking and notification targeting.
5. Integrate authentication continuation and explicit history cleanup.
6. Migrate screen helpers, scroll identity, analytics, and removal guards.
7. Validate the complete flows on iOS and Android, including release builds,
   interrupted gestures, rapid actions, and restoration.

The fixture demonstrates the ownership and Standard Navigation boundary before
a broad Tastebuds migration. The remaining work establishes whether integration
preserves the real app's full interaction contract.

## Additional device findings from the fixture

The root-stack/pathless-tabs split is now implemented. The demo is a sibling of
the main tabs, so Discover/Search are absent while it is open. Its five tabs are
Map, Explore, Post, Activity, and My; My reproduces Tastebuds' avatar geometry,
Pretendard label, easing, 480 ms scale curve, and light haptics.

A sibling-link preload bug was reproduced and fixed: an out-of-bound destination
must preload through the root authority instead of borrowing the current tab's
parent execution. Its public test also verifies reuse of preloaded data without
changing the visible history.

Nested edge Back was verified on iOS with the child native headers visible.
Tastebuds' actual Map/Search stack hides its header, so preserving that exact
appearance while retaining interactive Back remains an integration requirement.
For the current Screens v5 beta, an upstream improvement should expose independent
iOS gesture enablement and explicit nested recognizer arbitration. The experiment
uses supported visible native headers rather than patching the dependency or
claiming headerless swipe parity.
