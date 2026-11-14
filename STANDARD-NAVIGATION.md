# Standard Navigation on native TanStack Router

The native entry exports `integrateStandardNavigator`, an adapter for the
version-one contract published by `standard-navigation` (tested with 0.0.9).
The adapter supplies state, descriptors, actions, and a cancellable event emitter.
It does not introduce another router, reducer, or history owner.

```tsx
import { integrateStandardNavigator } from '@tanstack/react-router'
import { MyTabs } from './my-standard-navigator'

const renderTabs = integrateStandardNavigator(MyTabs, {
  screenOptions: ({ item }) => ({ title: item.title }),
  listeners: {
    tabPress(event, context) {
      // event.preventDefault() can intercept actions such as a Post button.
    },
  },
})

// In router.options.native or a route's staticData.native.navigator:
const navigator = {
  initialContainer: 'feed',
  renderContainer: renderTabs,
  containers: {
    feed: { initialHref: '/feed', title: 'Feed' },
    saved: { initialHref: '/saved', title: 'Saved' },
  },
}
```

## Ownership and action semantics

`renderContainer` adapts tab/drawer/branch groups. Standard route names and keys
are local container IDs. A selected container retains its independent stack.
Descriptors render the existing scoped subtree, including any visit-owned nested
navigator. Navigating with the descriptor's unchanged params selects the branch
without rebuilding its active destination or discarding its child history.

`renderStack` adapts leaf stacks. Each Standard route key is a presentation visit
key; repeated URLs have different keys. Route names are TanStack full-path
patterns such as `/venues/$id`. Descriptors render each visit under its own router
and entry context. Stack actions enter the existing preparation, blocker, and
transaction machinery. `actions.back()` targets the local stack and bubbles
through ownership when appropriate.

Standard navigator params are a flat object. The adapter exposes validated search
values and path params together; path params win on name collisions. On navigate,
path-pattern parameter names (including optional params and `_splat`) are
partitioned from search. TanStack's normal route validators and loaders still
run. Existing TanStack calls retain their ordinary `to`, `params`, and `search`
shape and full route inference.

The `screenOptions` mapper receives the Standard route, rendered item, and owning
navigation. Stack items expose `options` (native header/presentation options) and
`preventDismiss`. Integrations can supply additional navigator props through
`props`, either as an object or a mapper `(context) => props`; required custom
props must be provided. A mapper can bind native dismissal callbacks to the
specific owning navigation rather than a shared root. Listener context identifies the
owning navigator. Captured emitters from removed visits cannot invoke listeners
against a surviving ancestor.

The minimal Standard Navigation contract does not specify native gesture
acknowledgements or outgoing-view retention. A third-party native stack may need
a mapper that distinguishes completed native dismissal
(`navigation.acknowledgeNativeDismiss(key)`) from requested Back, supplies removal
prevention, and coordinates transition events and retained outgoing views. Do not
substitute a second Back action for a native dismissal acknowledgement. The
existing default Screens v5 stack remains available and handles these details.
This adapter is not an automatic compatibility layer for React Navigation-specific
navigators, hooks, or reducers. The web entry is unchanged.

## Tastebuds-style demo

Run `mise run native`, then open **Try Tastebuds-style standard navigators** on
Discover. After installing the new Lottie and pager dependencies, rebuild the
development client once:

```sh
mise exec -- pnpm --filter tanstack-start-native-client ios
```

The demo stays in the existing full-stack example so it exercises the same Start
backend, Metro transform, and shared TanStack route tree. `/navigation-lab` is a
root-stack sibling of the pathless `/_tabs` layout that owns Discover/Search, so
those tabs do not appear underneath the demo. Native Back returns to their
retained visit. Workspace and venue detail routes are root-stack siblings too:

- A framework-independent `TastebudsTabs` Standard Navigator renders five custom
  bottom buttons and copied Tastebuds Lottie animations. Groups is omitted by
  request. My uses Tastebuds' 24-point circular avatar, Pretendard semibold label,
  and 480 ms scale curve (1 → 0.85 → 1), with light haptics and reduced-motion
  support. The sample avatar is bundled from Unsplash for offline use.
- Post emits cancellable `tabPress`; its integration opens the existing composer
  sheet without selecting Post.
- Saved owns a separate Standard Navigator wrapping `react-native-tab-view`'s
  Material `TabBar` and native pager, the presentation primitives used by React
  Navigation Material Top Tabs. It does not install a React Navigation router.
- Pressing the selected Saved button toggles Archive/Buds through its owned
  navigator. Swipes and labels request selection from the same state owner.
- Each branch has a stack with a draft per page. New visit pushes the identical
  parent URL with fresh nested state. Outer Back restores the prior visit.
- Navigator factories translate direct child URLs into initial container targets.
  The same shared routes have ordinary web fallbacks.

The reusable Standard Navigator content lives in
`examples/react/start-native/src/standard-navigators.native.tsx` and imports no
TanStack or React Navigation APIs. The TanStack integration lives separately in
`lab-navigation.native.ts`.

## Scope of validation

See [the measurement report](./RESULT-optimization-standard-navigation.md) for
public regression tests, builds, device checks, and before/after measurements.
Native release behavior, Android device coverage, and arbitrary third-party
native stack mapper compatibility must be validated separately.

## Pathless tabs, preload ownership, and nested Back

The main app tabs now belong to a pathless route. The native root owns a normal
stack, so navigating from Discover to the Tastebuds demo pushes a sibling route
and hides the main tab bar. Child links that leave a bounded execution also route
preloads through the unbounded root preload authority. Their data enters the
existing shared native cache; speculative loading does not create or select a
presentation visit. A public regression verifies sibling preload data and cache
reuse without the "Destination left its parent route execution" error.

The demo's Map and Saved child stacks have visible native Back headers. On the
current Screens v5 beta/iOS combination, hiding a UINavigationController's bar
also disables its default interactive pop behavior; the outer stack then receives
the edge swipe. Device verification with the native child header enabled confirms
page two → page one inside Map, followed by a second edge swipe at its root
returning to Discover. The demo has not implemented custom gesture arbitration
for headerless native stacks.
