# Native parity: review and before/after measurements

## Revisions and method

Production baseline: `9d8093ada2`. Tests and measurement support were committed
separately as `08404118de` and `606804b02a`; implementation was then stashed as
`codex-native-parity-implementation-before-measurement`. Node 26.12.1 and pnpm
12.18.0 are used throughout. Finite validation runs through Nx.

Five independent reviews covered presentation history/ownership, runtime and
cache performance, Metro/RPC boundaries, native host reconciliation, and browser
compatibility/publication. Their confirmed findings produced regressions for
native back acknowledgement, hidden Activity refresh, deferred lifecycle entry,
activation reentrancy, context isolation, sheet blockers, Android modal cleanup,
provider context, restoration, and native-only function discovery.

The initial prototype supports fewer behaviors, so its failures for new APIs are
expected. A missing implementation module is reported separately from a runtime
regression. Browser unit behavior remained at 1,240 passing tests on the baseline;
the baseline web test target reported a new native-persistence type error.

## BEFORE

### Correctness

`/private/tmp/router-parity-baseline-tests.log` records 11 successful and five
failed targets. The retained test set reproduces seven native failures, nine
presentation parity failures, and absent execution-scope/native RPC/Metro modules.
The native-back test reproduces the double-pop host failure observed on iOS.

Individual pre-fix runs additionally reproduced stale cached route context,
storage cleanup preventing startup, dirty-sheet blocker bypass, hidden Activity
invalidation hangs, bad relative Metro RPC IDs, server-only function exposure,
and missing Android JavaScript manifest entries.

### CPU

Serial production-mode runs use the same committed benchmark files. Full metrics
are in `/private/tmp/router-parity-before-perf-metrics.log`. Means below are
milliseconds per push/back pair, not frame times or device animation latency.

| Workload                           |  Mean ms |   P99 ms |   RME | Samples |
| ---------------------------------- | -------: | -------: | ----: | ------: |
| Presentation, 0 inactive visits    | 0.001619 | 0.002084 | 2.34% |  617599 |
| Presentation, 100 inactive visits  | 0.012615 | 0.016334 | 0.27% |   79272 |
| Presentation, 1000 inactive visits | 0.113618 | 0.198041 | 0.25% |    8802 |
| Native preparation, 100 routes     | 0.067209 | 0.104717 | 1.52% |   14880 |
| Native preparation, 1000 routes    | 0.525769 | 1.150039 | 1.01% |    1903 |
| Native preparation, 10000 routes   | 6.363336 | 8.988122 | 1.98% |     158 |

The retained-screen lookup mechanism benchmark checks identical results before
timing. At 1000 visits, repeated `findIndex` averages 0.952408 ms versus 0.018704 ms
for one index map. At 10 visits the map costs 0.000209 ms versus 0.000121 ms;
the absolute small-stack difference is below one microsecond.

The production React client navigation loop averages 1.156831 ms (P99 2.456925,
RME 1.26%, 8645 samples), recorded in `/private/tmp/router-web-before-perf.log`.
This loop contains ten navigation steps per sample.

### Bundles

All 18 browser scenarios were measured in
`benchmarks/bundle-size/results/runs/native-parity-before/current.json`.
Representative gzip bytes: React Router minimal 86037; React Start minimal 99106;
React Start Rsbuild minimal 98993. Final comparison must include all scenarios.

The production iOS export is Hermes bytecode: 2,689,762 raw bytes, 1,177,432 gzip,
942,084 Brotli. These are bundle bytes, not an IPA size or an OTA download estimate.
Its metrics are also saved in `/private/tmp/router-native-bundle-before.json`.

## AFTER

Pending restoration of implementation and identical validation/measurement runs.

## Attribution and limits

Required correctness and feature hunks are distinct from optional optimizations.
Shared Router execution/metadata, React renderer lifetime, Start compiler/runtime,
and native-only host code must be attributed separately. Browser bundle scenarios
do not measure native-only code; the Expo production export covers that artifact.
Native JavaScript controller benchmarks do not measure UIKit/Android frame rates.
Per-visit nested navigator instances and other remaining parity work are tracked
in `NATIVE-PARITY.md`; passing this checkpoint does not imply full parity.
