# Update search on the active native route

Tastebuds uses the `form` search parameter on `/bites` to show the Create group or Join with code modal. The native router can keep the same stack entry when `form` changes, but it creates a fresh scoped router for that entry. The app needs an in-place search update that preserves the active route execution and the state of the screen underneath the modal.

## Reproduce

1. In a signed-in Tastebuds native build, open Bites from the main tabs.
2. Open the group actions menu and choose **Create a group**. Close the modal, then repeat with **Join with code**. The same actions are available from the empty list.
3. Compare the Bites route before opening, while the modal is open, and after closing. Log the object returned by `useRouter()` separately from a mount and cleanup probe in the Bites component. A local React state value or list scroll position can help distinguish a React remount from a route execution change.

The app uses this navigation shape when opening the create modal. Join uses `"join"`, and close sets `form` to `undefined`.

```tsx
await navigate({
  to: '/bites',
  search: (current) => ({ ...current, form: 'create' }),
  replace: true,
  stackBehavior: 'reuse',
})
```

A minimal fork fixture can use a single leaf route with `validateSearch`, a button that increments local state, and buttons that set and clear `form` using the options above. Render the current search value and assert that the counter survives both updates. Also capture the scoped router returned by `useRouter()` and check its identity after each update. The existing owner-aware search test verifies the stack key and rendered search value. Extend that coverage to check route execution identity and component state. [Native navigation tests](packages/react-router/tests/native-navigation.test.tsx)

## Current behavior

The `reuse` branch matches the stack entry by identity. When the URL changes, it calls `prepare` for a replacement and retains the previous entry key. Native `prepare` constructs a fresh memory history and router execution scope. The resulting entry has the same key and a different router value, so the previous scope is disposed after the transaction commits. The identity check in the fixture should catch that behavior even if React preserves component state in a particular host. [Stack planning](packages/router-core/src/navigation.ts#L383) · [Native execution preparation](packages/react-router/src/native/controller.ts#L246)

## Potential fix

Add an explicit native search-replace operation for the active visit. Use TanStack's normal location builder and search validation. Restrict the operation to a query change on the same matched route and path params, and reject stale callers whose visit is no longer active. Reuse the existing scoped router and update its backing history and matches without passing through the native stack replacement path.

Publish the new location through the navigation transaction so `useSearch()`, the active entry's `href`, and serialized navigation agree. Define how the operation handles search-dependent loader inputs. Bites can exercise the simpler case where `form` is presentation state and has no loader dependency. Keep the existing push and reuse behavior for transitions between routes.

The regression should cover setting and clearing `form`, stable scoped router identity and component state, unchanged stack depth, and Back reaching the route that preceded Bites. Also verify that serialization records the updated URL and that a direct link with `form` still initializes the correct modal.
