# Owner-aware native destinations

Implemented 2026-11-19 in the local TanStack fork, and linked into Tastebuds with source/checksum provenance in `apps/native/lib/navigation/router-snapshot.json`. No commit, push, staging, unstaging or reset was performed.

## App API

```tsx
const navigate = useNavigate()

// Unwind covering pages and restore Saved's selected tab and nested stack.
await navigate({ to: '/saved' })
// Select Archive without losing Buds' independent state.
await navigate({ to: '/saved/archive' })
// Restore the existing Map owner and navigate/reuse Search.
await navigate({ to: '/search' })
```

For a nested stack layout, `/saved/buds` restores its current stack, while `/saved/buds/` explicitly targets its index. Tastebuds currently renders Buds directly, but the fork regression fixture gives it an independent stack to verify this distinction. Normal leaf navigation within the current stack still pushes visits; explicit `stackBehavior: 'push'`, `replace`, `target` and `entryId` retain explicit handling. Explicit root `reuse` with `stackMatch: 'oldest'` can choose the oldest matching owner. Scoped callers stay anchored to their own live visit; stale callers cannot activate another owner's navigator.

`useSelectAppTab`, `selectAppTab` and the deep-link tab map are removed. Existing screen calls, authentication fallbacks and remembered destinations use TanStack navigation. Account/stale-visit guards in authentication action continuations remain. Web's pending group-invite continuation now lives in the home route's `beforeLoad`; native skips browser storage. Phoenix/Ash, GraphQL, route loaders, the shared Start file-route tree and `item.wrap` are unchanged.

## Why core coordination is necessary

The old helper performed Back/pop-to-owner, bottom-tab selection and nested selection sequentially. A blocker or newer navigation could interrupt between those operations. A destination needs to represent the complete ownership path before removing anything.

The native resolver matches route ancestry and bound path parameters, walks the caller's owning chain, and chooses the nearest applicable existing navigator. Declared tab `routePath` (or its initial href) maps destinations to branches; presenters do not route URLs. Different parameter values do not borrow another visit's execution prefix. Layout owners preserve their child state; changed loader-dependency identities require a fresh execution.

Core `Navigation.activate` plans child/ancestor snapshots through the existing shared coordinator and AbortController. Blockers receive the final leaf as `change.destination`; native `useBlocker` and history blockers consume it. Cancel/supersession releases abandoned prepared entries, without committing any selection or owner truncation. Accepted snapshots commit before observers run, and one tree event describes the compound operation. Participating hosts are captured before callbacks so synchronous observer disposal does not invalidate later publication lookups. Push/replace/reuse history actions remain visible to blockers.

The added coordinator host map is deleted on navigator disposal. The resolver does not maintain a second route tree or a global cache of owner visits. Native navigator defaults are canonicalized using TanStack's location builder, preventing trailing-slash/search normalization from creating duplicate index visits.

## Correctness evidence

Public native-router tests cover:

- Returning to an existing tab owner beneath covering pages.
- Bottom tabs → Saved top tabs → nested Buds stack, retained component drafts and Back.
- Cancel/proceed without partial owner/selection changes; final blocker destination.
- Superseding a blocked activation before it can commit.
- Active duplicate owners, older scoped callers, stale callers and explicit oldest reuse.
- Two parameter-distinct collection owners and restoring only the matching one.
- Layout destinations through `href`, Search reuse, explicit index stack depth and search updates preserving visit keys.

Core tests additionally cover atomic tree publication, blocker rollback, exactly-once abandoned-subtree disposal, supersession during deferred preparation, history actions and synchronous observer disposal. Five independent read-only reviews informed these cases.

Core and React package unit/types checks, native unit/types checks, builds/export checks and lint passed (existing warnings remain). Tastebuds: 70 native unit tests, 49 web-node tests, 7 navigator-package tests and 470 Phoenix precommit tests passed. Web typechecking passed. Native app typechecking still has the pre-existing testing-library RenderResult mismatch at `lib/navigation/route-presentation.test.tsx:111`; no new type errors were reported.

## Controlled performance comparison

The baseline is the exact source at the start of this task, including the earlier explicit-navigator changes—not upstream HEAD. Source snapshots were temporarily substituted only in the fork and automatically restored; the user's index was never touched. Identical benchmark files and correctness assertions ran before and after. Native resolver runs rebuilt core for each source version. Node 26.12.1, the same machine, jsdom/mocked native hosts. These are coordinator/execution timings, not UIKit/Android animation, CPU or memory measurements.

### Atomic activation versus the old sequential helper

Each return iteration pushes a covering page then restores bottom/top tabs; same-tab iterations restore an already active branch. Inactive histories contain 1 or 100 visits. The optional registered blocker accepts removal. Mean/p99 are microseconds.

| Case               | Before mean | After mean | Before p99 | After p99 | RME before/after | Samples before/after |
| ------------------ | ----------: | ---------: | ---------: | --------: | ---------------: | -------------------: |
| return-1-false     |        3.72 |       4.43 |       5.58 |      6.25 |    0.88% / 0.93% |      161299 / 135392 |
| same-tab-1-false   |        1.96 |       1.71 |       2.46 |      2.17 |    0.24% / 0.25% |      306850 / 350750 |
| return-1-true      |        7.07 |       7.72 |       8.71 |      9.54 |    0.49% / 0.46% |        84904 / 77734 |
| same-tab-1-true    |        3.64 |       1.94 |       4.58 |      2.42 |    0.29% / 0.27% |      164654 / 309394 |
| return-100-false   |       12.33 |      12.94 |      16.75 |     18.84 |    0.48% / 0.51% |        48652 / 46379 |
| same-tab-100-false |        6.40 |       1.72 |       7.75 |      2.25 |    0.26% / 0.26% |       93740 / 348529 |
| return-100-true    |       27.73 |      34.80 |      35.88 |     47.63 |    0.27% / 0.30% |        21636 / 17240 |
| same-tab-100-true  |       14.54 |       1.92 |      20.00 |      2.46 |    0.24% / 0.26% |       41278 / 312430 |

Atomic returns cost about 0.6–7.1 µs more here; the largest case grows from 27.73 to 34.80 µs. This is a measured correctness cost, not a speedup claim. Already-active selection improves because unchanged top-owner stacks keep their reference and avoid recursive reindexing. Independent attribution removed only that fast path: the 100-visit blocked same-tab case rose from 1.92 to 17.68 µs (p99 2.46 → 21.17 µs; RME 0.26%/0.18%). The fast path is therefore retained.

### Real native resolver, ordinary leaf push/Back

These cases call native `router.navigate`, prepare/load a visit, then Back, at local stack depths 1/50/200. Mean/p99 are microseconds.

| Depth | Before mean | After mean | Before p99 | After p99 | RME before/after | Samples before/after |
| ----- | ----------: | ---------: | ---------: | --------: | ---------------: | -------------------: |
| 1     |       38.97 |      41.50 |      69.26 |     72.86 |    5.00% / 3.41% |        17990 / 16866 |
| 50    |       60.16 |      59.02 |     166.10 |     96.41 |    9.28% / 2.62% |        11661 / 11862 |
| 200   |      107.26 |     102.72 |     452.79 |    374.36 |    5.25% / 2.58% |          6527 / 6815 |

Confidence ranges overlap; these runs do not establish a meaningful ordinary-navigation regression or improvement. p999 values remain noisy (roughly 0.52–1.39 ms), so tail-performance claims are unwarranted. Resolution adds branch matching and a local-stack search; it does not eliminate the cost of retaining large stacks.

Logs: `/tmp/owner-perf-{before,after}.log`, `/tmp/owner-native-perf-{before,after}{0,1}.log`, `/tmp/owner-fastpath-attribution.log`. Full statistical records are in the corresponding Nx terminal logs. Benchmark assertions verify restored visit identity and stack depth.

## Bundles and retained hunks

Full web runs `owner-aware-before`, `owner-aware-final` and `owner-aware-final-composed` under `benchmarks/bundle-size/results/runs` compare all 18 Router/Start scenarios across React/Solid/Vue/Rsbuild. Raw, gzip, initial gzip and brotli bytes are unchanged. Native-only controller and standalone navigation are not imported into those web scenarios.

Identical esbuild TS/TSX-to-ESM transforms (ES2022), measured per module rather than summed as an app bundle:

| Module                | Before raw | After raw | Before gzip | After gzip |
| --------------------- | ---------: | --------: | ----------: | ---------: |
| navigation.ts         |      38562 |     44047 |        8293 |       9400 |
| controller.ts         |      16862 |     25032 |        4217 |       6056 |
| useBlocker.native.tsx |       2597 |      2619 |         922 |        935 |

The transaction refactor + resolver + blocker/context bridge form a dependent correctness group. Canonical initialization independently fixes a failing duplicate-index regression. The unchanged-owner fast path is the only optimization-specific hunk and was measured independently above. No other optimization-only changes are retained. Web bundle measurements cannot quantify these native module costs, and this ledger does not establish native app memory usage.

## iOS app verification

Verified the installed artifact on Tastebuds Empty Bites QA (iOS 27.2):

- Buds → Settings → direct `/saved` link restored Buds as selected.
- Settings → direct `/search` selected the existing Map stack.
- Switching Saved/Map retained Buds and Search; Search edge Back returned to Map.
- Create-list sheet → direct `/saved/buds` showed the discard prompt. Keep editing preserved the sheet; later cancelling it revealed Archive still selected, proving the cancelled destination had not partially selected Buds.
- Repeating and accepting discard dismissed the sheet and selected Buds.

No list or comment was created. Android was not tested in this pass. Startup briefly showed an unavailable-server error while Metro restarted; Reload succeeded after Metro was ready. No navigation crash was observed.
