# Standard Navigation integration validation

## Method and BEFORE

Baseline: `ebd1a9dd73`, before Standard Navigation implementation. Browser baseline
contains all 18 scenarios and is saved in
`benchmarks/bundle-size/results/runs/standard-navigation-before/current.json`.
The initial public interoperability regression failed because the published native
entry did not export `integrateStandardNavigator`; see
`/private/tmp/router-standard-before-tests.log`.

Five independent reviews covered contract typing, visit ownership, demo behavior,
default-path overhead, and stack rendering. Their findings drove unchanged-params
reselection, disposed-emitter guards, required-prop inference, initial child URL
targeting, blocker-aware activation, native option mapping, constant-time route
lookup, and custom-host-only metadata projection.

The adapter and renderer integration are dependent correctness groups. Default
browser imports do not export or execute the adapter. Standard Navigation is a
type-only import in library implementation; the demo imports its real factory.
No optional source-size optimization is retained. New descriptor projection has
no equivalent baseline feature; direct candidate-only timings are recorded
separately from the unchanged default native preparation workload.

## AFTER: correctness and device validation

The first complete integration run passed all 26 selected/prerequisite targets:
React web and native units, native inference, TypeScript matrix, lint, shared app
types, and all six Start end-to-end flows. After the device-discovered sheet fix,
core units/types/lint, React units/types/lint/native regressions, and production
iOS export passed (29 tasks). The e2e rerun initially refused the already-running
port 3050; using the fixture's supported `PLAYWRIGHT_REUSE_SERVER=1` setting passed
its 17-task graph. No test or validator was disabled.

The native suite now includes 27 tests across navigation and persistence.
The two new Standard Navigation tests fail on the baseline's missing public
adapter and pass on the candidate. Public inference checks retain required
navigator props and cancellable typed event data. Tests cover standard actions,
params/search translation, distinct keys for duplicate stack visits, removal
blockers, unchanged-params tab reselection, stale emitters, and per-visit drafts.

A realistic native sheet fixture reproduced the device crash before its fix:
closing a sheet disposes its execution before the host releases its animated
outgoing subtree. The renderer then read an acknowledgement object that disposal
had set to undefined. Disposal now settles and empties that object while retaining
its identity for the outgoing renderer. The public test fails before the fix and
passes afterward. This is a separate required correctness hunk, not a size
optimization. The fixture now retains sheet content until native dismissal ends.

Verified on iPhone 18 Pro simulator, iOS 27.2:

- Map pushed page two and retained its draft.
- Saved's Material pager swiped from Archive to Buds; Buds pushed page two and
  retained a different draft.
- Repeated Saved presses toggled Archive/Buds and restored Buds' page and draft.
- Post opened the review sheet without selecting Post; closing it returned to
  Saved without a render error after the fix.
- A duplicate parent visit started with counter zero and Map page one. Native
  header Back restored the original counter one, selected Buds tab, page two,
  and draft. Returning to Map restored its independent page-two draft.
- Child Back popped Map to page one without removing the parent visit.

Android and release-mode interaction quality were not device-tested. The iOS
production JavaScript export and rebuilt development client both succeeded.

## Runtime measurements

The same default native preparation workload ran in the baseline checkout and
candidate: new execution/load plus push/back, with 100/1,000/10,000 route trees.
Times are milliseconds, not device frame latencies.

| Routes | Baseline mean / P99 / RME   | Candidate repeat mean / P99 / RME | Baseline / candidate samples |
| ------ | --------------------------- | --------------------------------- | ---------------------------- |
| 100    | 0.032257 / 0.055750 / 4.01% | 0.032834 / 0.054393 / 4.12%       | 31,001 / 30,457              |
| 1,000  | 0.032892 / 0.058827 / 4.19% | 0.032700 / 0.055891 / 2.98%       | 30,403 / 30,582              |
| 10,000 | 0.033541 / 0.065037 / 5.38% | 0.036233 / 0.057044 / 16.01%      | 29,814 / 27,599              |

An earlier candidate measured 0.035894 / 0.034635 / 0.034289 ms. The large-tree
repeat has substantial variance and GC tails; these runs support no precise
speedup or regression claim. The new custom-host projection is gated off for
default hosts, and name resolution uses the route-path index instead of scanning
all route definitions. The final sheet fix only changes disposal acknowledgement
handling; these default-preparation timings precede that device-driven correction.

Direct production descriptor projection has no baseline equivalent:

| Standard routes |  Mean ms |   P99 ms |   RME |   Samples |
| --------------- | -------: | -------: | ----: | --------: |
| 6               | 0.000229 | 0.000375 | 0.64% | 4,366,928 |
| 50              | 0.001601 | 0.002125 | 0.20% |   624,626 |
| 500             | 0.022417 | 0.073334 | 0.37% |    44,611 |

The measurement invokes the production argument/descriptor builder used by the
adapter. It includes descriptor/options/render callback construction, not native
layout or Lottie/pager frame performance. The timing follows expected linear
route projection; no speculative caching was added.

## Final bundles and attribution

All 18 final browser scenarios are byte-for-byte unchanged in raw, gzip, Brotli,
and initial JavaScript size relative to the pre-adapter baseline. Results:
`benchmarks/bundle-size/results/runs/standard-navigation-release/current.json`.
For example, React Router minimal remains 86,293 gzip bytes and React Start
minimal remains 99,399 gzip bytes. Native-only exports and type-only library
imports keep the adapter out of browser graphs.

The initial complete iOS Hermes bundle was 3,071,960 raw bytes, 1,332,832 gzip bytes,
and 1,064,494 Brotli bytes. The prior nested-navigation app measured
2,893,786 / 1,267,092 / 1,013,410 bytes. The complete example increase includes
Lottie, native pager/TabView JavaScript, copied animation assets, and new demo
routes/UI; it must not be presented as library-only adapter overhead. Native
binary growth from Lottie/pager pods was not separately measured.

Required production groups retained: standard contract projection/emitter;
visit-owned renderer/action integration; demo hosts/routes/assets; and the
independently reproduced retained-sheet correctness fix. Browser measurements
show no cross-platform bundle leakage. Descriptor timings directly cover the
new adapter mechanism. Further reduction by dropping params, cancellable events,
per-visit render context, or native dismissal correctness would remove requested
behavior, so those groups remain.

Logs and retained metrics are under `/private/tmp/router-standard-*`, including
`final-checks.log`, `sheet-before.log`, `sheet-final-checks.log`, `final-e2e.log`,
`baseline-perf-metrics.log`, `final-native-perf-metrics.log`,
`projection-metrics.log`, `release-bundles.log`, and `native-release.json`.

Baseline validation initially needed fixture dependency installation and a
runtime-deferred import for the candidate-only benchmark, so filtered baseline
benchmarks did not attempt to resolve a feature that did not yet exist. These
were test-harness corrections; both workloads use the same benchmark source.

## Final five-tab fixture and reported bug fixes

The final fixture removes Groups, uses Tastebuds' matching animated My/avatar
icon and copied font, and places the demo outside the pathless main-tabs layout.
It adds Reanimated, SVG, font, and haptic support through Expo-compatible packages.
The production iOS bundle for this expanded fixture measured 4,339,341 raw bytes,
1,773,634 gzip bytes, and 1,400,123 Brotli bytes. The copied 1.5 MB font and small
avatar JPEG are separate assets. These whole-demo costs include the added
animation packages; they are not adapter-only costs.

After these changes, the final application validation passed all 22 tasks,
including types, all web e2e flows, and the iOS export. All 18 browser bundle
scenarios remain byte-for-byte unchanged; the latest retained run is
`standard-navigation-complete`.

The public sibling-preload regression fails before the fix and passes afterward:
a link leaving a pathless tab execution now uses the root preload authority and
shares cached data without selecting or creating a visit. The full native suite,
native inference checks, and lint passed after this correction (six tasks).
Logs: `/private/tmp/router-standard-pathless-preload-before.log`,
`/private/tmp/router-standard-preload-fixed.log`, and
`/private/tmp/router-standard-final-app-checks.log`.

On iOS, opening the demo from Discover no longer logs the parent-execution error.
Native edge Back inside Map now pops page two to page one, keeps the demo open,
and then dismisses the demo only on a second swipe at the child's root. This
verification uses a visible child native header; headerless gesture enablement
in the current Screens beta remains an upstream integration requirement.
The demo's main Discover/Search tab bar is absent while it is open. My/avatar
and the five-tab bar were visually inspected in the rebuilt native client.
