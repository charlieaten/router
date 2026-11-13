# Per-visit nested navigator ownership: validation and measurements

## Baseline and method

Baseline: `49249d88db` (the previous native implementation, a prerequisite Metro
export-layout fix, and tests/benchmarks only). Implementation was stashed while
recording BEFORE results. Node 26.12.1 / pnpm 12.18.0. Tests run through Nx with
CI=1, NX_DAEMON=false, remote cache disabled. Performance families run separately,
in production mode, with verbose output and identical workloads before/after.
Five independent reviews covered navigation transactions, execution leases,
native rendering, shared web/SSR behavior, and performance/restore complexity.

These are local CPU/jsdom measurements, not UIKit frame-time measurements.
Nested functionality has no semantically equivalent baseline: candidate-only
nested measurements must not be described as an improvement over absent behavior.

## BEFORE

- Core: 3,684 tests passed; 12 new ownership/lease regressions failed as expected.
  Missing new APIs also produced expected typecheck diagnostics.
- Native: 15 tests passed; 5 new nested rendering/navigation regressions failed.
- Existing web React suite passed (1,240 tests).
- Logs: `/private/tmp/router-ownership-before-tests.log`,
  `/private/tmp/router-ownership-before-perf.log`,
  `/private/tmp/router-ownership-before-web-perf.log`.

Core presentation push/back, mean / P99 ms:

| Inactive visits |     Mean |      P99 |   RME | Samples |
| --------------- | -------: | -------: | ----: | ------: |
| 0               | 0.001611 | 0.002083 | 2.62% |  620877 |
| 100             | 0.001662 | 0.002167 | 2.39% |  601624 |
| 1000            | 0.001645 | 0.002250 | 0.50% |  607761 |

Blocker queries scan all retained screen keys once per iteration:

| Visits | No blockers mean ms | One blocker mean ms |
| ------ | ------------------: | ------------------: |
| 10     |           0.0000240 |           0.0000387 |
| 100    |           0.0002852 |           0.0003262 |
| 1000   |           0.0027411 |           0.0036196 |

Full 18-scenario browser baseline is saved in
`benchmarks/bundle-size/results/runs/nested-ownership-before/current.json`.

## AFTER

The affected integration run passed 25 targets: React web unit tests, compiled
native public-entry tests, compiler unit tests, native types, lint, and all six
Start web end-to-end flows (including the workspace and cold native-only RPC).
The core suite/type matrix/lint also passed separately. Additional regressions
were added after the initial checkpoint for rejected reuse, explicit initial
locations, local parent traversal, outer/inner host-kind isolation, and ancestor
loader dependency changes; their individual failing-before logs are retained in
`/private/tmp/router-ownership-*-before.log`.

The native host tests now consume the compiled native public entry, with an
explicit own-build dependency. The same updated fixture failed five cases on the
baseline and passed on the candidate. Generated Vitest incremental compiler cache
was cleared after switching the baseline/candidate source to obtain a fresh full
core typecheck; no type checks were disabled.

| Workload                                   | BEFORE mean ms | AFTER mean ms | AFTER P99 ms |
| ------------------------------------------ | -------------: | ------------: | -----------: |
| Flat push/back, 0 inactive                 |       0.001611 |      0.001750 |     0.002750 |
| Flat push/back, 100 inactive               |       0.001662 |      0.001754 |     0.002458 |
| Flat push/back, 1000 inactive              |       0.001645 |      0.001864 |     0.003541 |
| React browser loop (10 navigations)        |       1.231063 |      1.145011 |     2.325834 |
| Native execution preparation, 100 routes   |       0.028626 |      0.033910 |     0.058500 |
| Native execution preparation, 1000 routes  |       0.028672 |      0.031427 |     0.047242 |
| Native execution preparation, 10000 routes |       0.028755 |      0.032411 |     0.049437 |

The required ownership/transaction bookkeeping has a measured cost: approximately
0.09–0.22 microseconds per primitive flat push/back pair and 2.8–5.3 microseconds
per native execution preparation in these runs. The native preparation RME is
3.9–6.1%, with GC tails around 1.3–1.5 ms; do not infer device transition latency.
The browser run showed no regression (RME 0.69%, 8734 samples), and remains a local
CPU comparison rather than a claim of a production speedup.

An initial candidate added unnecessary descendant work to flat navigation
(0.002225–0.002300 ms per pair). Skipping absent blocker/ownership work and keeping
the original flat blocker query recovered most of that overhead. Flat blocker
queries match or improve on the baseline: querying 1000 visits measured 0.002694 ms
without blockers and 0.003439 ms with one blocker (RME below 0.08%).

The new nested capability has no equivalent baseline. Its direct mechanism
comparison is against the initial implementation of the same behavior:

| Dirty child visits / parent queries | Initial scan mean ms | Ancestor-count index mean ms |
| ----------------------------------- | -------------------: | ---------------------------: |
| 10                                  |             0.000406 |                     0.000055 |
| 100                                 |             0.045522 |                     0.000598 |
| 1000                                |             7.846546 |                     0.006271 |

The 1000-case index result has P99 0.007750 ms, RME 0.073%, and 95,685 samples.
This removes quadratic descendant scans. Registration/removal updates ancestor
counts; per-screen native dismissal queries stay constant-time.

Structured snapshots measured 409 / 1205 / 3207 bytes at depths 1 / 5 / 15;
serialization means were 0.000557 / 0.001533 / 0.004017 ms. The depth-15 public
roundtrip and cumulative restore budget are also unit-tested.

Logs: `router-ownership-after-perf-final.log`,
`router-ownership-after-web-perf.log`, `router-ownership-after-native-perf.log`,
`router-ownership-blocker-before-index.log`, `router-ownership-final-integration.log`,
and `router-ownership-core-final.log` under `/private/tmp`.

Final all-scenario browser and iOS export metrics are recorded below.

## Production hunk attribution

Required groups:

1. Core lane/lifecycle ownership hooks and opt-in execution-scope leases.
2. Core recursive navigator ownership, one transaction coordinator, restoration,
   retained visit identity, and descendant removal blockers (native subpath).
3. Shared React bounded match rendering and platform Outlet fallback.
4. Native host/controller integration and the app demonstration.

Both independent shared groups were measured against the same 86,131-byte gzip
React Router minimal baseline in an isolated worktree:

| Group alone            | Gzip bytes | Delta | Browser loop mean ms / P99 ms / RME |
| ---------------------- | ---------: | ----: | ----------------------------------- |
| Core ownership hooks   |      86201 |   +70 | 1.197648 / 2.650092 / 1.15%         |
| Shared React rendering |      86228 |   +97 | 1.213056 / 2.789993 / 1.29%         |

The full composed measurement checks their interaction. The navigation tree and
native host/controller are opt-in native/subpath code; direct native mechanism
measurements cover their runtime cost. Ancestor blocker counts and flat-path work
removal were retained for their measured improvements. Remaining runtime overhead
is the documented cost of the requested ownership semantics, not an optional
optimization retained despite a regression.

The prerequisite Metro export-layout fix is in the baseline. A subsequent cold
native-only development RPC regression was reproduced through the real Start app
and fixed by discovering only explicitly configured surviving native client
entries with matching development IDs. Production identity defaults are unchanged.

## Final production bundles

All 18 browser scenarios passed. Sizes below are total JavaScript gzip bytes.

| Scenario                         |  Before |   After | Delta |
| -------------------------------- | ------: | ------: | ----: |
| react-router.minimal             |  86,131 |  86,293 |  +162 |
| react-router.full                |  89,773 |  89,967 |  +194 |
| solid-router.minimal             |  34,179 |  34,249 |   +70 |
| solid-router.full                |  39,223 |  39,291 |   +68 |
| vue-router.minimal               |  50,659 |  50,724 |   +65 |
| vue-router.full                  |  56,375 |  56,447 |   +72 |
| react-start.minimal              |  99,214 |  99,399 |  +185 |
| react-start.query-integration    | 106,812 | 106,990 |  +178 |
| react-start.deferred-hydration   |  99,938 | 100,125 |  +187 |
| react-start.full                 | 102,355 | 102,538 |  +183 |
| react-start.rsbuild.minimal      |  99,075 |  99,248 |  +173 |
| react-start.rsbuild.minimal-iife |  99,478 |  99,647 |  +169 |
| react-start.rsbuild.full         | 102,458 | 102,612 |  +154 |
| solid-start.minimal              |  47,326 |  47,391 |   +65 |
| solid-start.deferred-hydration   |  50,441 |  50,504 |   +63 |
| solid-start.full                 |  52,471 |  52,538 |   +67 |
| vue-start.minimal                |  67,007 |  67,077 |   +70 |
| vue-start.full                   |  70,832 |  70,901 |   +69 |

## Final iOS export and device proof

The exact final production iOS export and native type check passed all 18 Nx
prerequisite/selected targets in an isolated worktree. The Hermes bundle measured
2,893,786 raw bytes, 1,267,092 gzip bytes, and 1,013,410 Brotli bytes, compared with
2,859,057 / 1,250,599 / 1,000,754 before. The gzip increase is 16,493 bytes (1.32%).
This is the complete example, including the new workspace routes and demo UI;
it is not a measurement of library-only overhead.

On the iPhone 18 Pro iOS 27.2 simulator, visit A retained its parent counter,
Feed page-two draft and Search page-two draft while visit B to the identical URL
started with fresh state. Child native-header Back popped B's child only; outer
native-header Back restored A's Search page and draft. Switching to Feed restored
its separate page and draft. An inner edge swipe popped Feed; an outer edge swipe
at a fresh child's root restored A. No crashes occurred in these flows. Android
was not device-tested.

The final 13-case ownership suite and full compiled native navigation suite
passed after the last owning-drawer Back-priority regression. The local
`useCanGoBack` regression also confirms that a parent's availability is not
mistakenly derived from a deeper child navigator. Retained native screens render
multiple child instances in the test host, so the assertion intentionally checks
all matching child instances.

Final logs: `/private/tmp/router-ownership-drawer-final.log`,
`/private/tmp/router-ownership-native-final-suite.log`, and
`/private/tmp/router-ownership-final-export.log`.
