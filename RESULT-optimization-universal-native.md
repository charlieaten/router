# Universal native router: correctness and measurement

## BEFORE: upstream main production code

Baseline: upstream `e7358c36d8cde5275fc3c32cd5fd5bbf7ecc30f9` plus
coverage-only commit `078f999b80`. Implementation changes were stashed.
Node 26.12.1 / pnpm 12.18.0, same installed dependencies and benchmark workload.
The new native API has no implementation on main; its new-feature tests and
benchmarks cannot constitute a before/after comparison against main.

- Full bundle run: `pnpm --silent benchmark:bundle-size:run --name universal-native-before`.
  All 18 scenarios succeeded; metrics retained under
  `benchmarks/bundle-size/results/runs/universal-native-before/current.json`.
- Existing React blocker/not-found regression tests passed through Nx.
- Existing production React client-nav benchmark, ten navigation steps per
  sample: mean 1.137325 ms, p99 2.290719 ms, p999 2.707812 ms,
  relative margin of error 0.672%, 8,793 samples; reported mean throughput 919.68 Hz.
  This is host wall-clock timing, not a simulator frame-time or CodSpeed claim.

Five independent agent reviews found and motivated regression coverage for
reentrant abort navigation, consistent destination identity, exactly-once
resource disposal, partial restore acquisition cleanup, hidden draft blockers,
stale async blocker prompts, public constructor support and per-entry providers.

## AFTER

Full candidate run: `pnpm --silent benchmark:bundle-size:run --name universal-native-after --baseline universal-native-before --analysis`.
All 18 scenarios succeeded. Source attribution for the Rsbuild outlier contains
the ordinary browser router and extracted error UI, and no native controller or
Screens code. These are required host-separation/correctness changes; no
optimization-only production hunks were retained.

### Hunk attribution

Each independent browser-facing group was applied alone to main and measured
against the same minimal React Router baseline (86,046 gzip bytes):

| Group                                    | Gzip delta | Reason retained                                                   |
| ---------------------------------------- | ---------: | ----------------------------------------------------------------- |
| Shared router/provider modules           |          0 | Native resolution must avoid recursive `.native` basename imports |
| Host error/not-found boundary separation |        -10 | Native errors must render native UI                               |
| Blocker public type extraction           |          0 | Share the existing API types without importing browser effects    |
| No-document scroll guard                 |         +1 | Native memory routers must not execute browser scrolling          |
| Composed candidate                       |         -9 | Final measured composition                                        |

Core presentation history is an opt-in subpath. Native types/options are erased
from browser JS. The largest full-run gzip increase is 82 bytes (<0.1%) in a
Start Rsbuild scenario. Different compressors/chunk boundaries can move in
opposite directions; raw/Brotli/initial gzip deltas are included below.

### All bundle scenarios

| Scenario | Before gzip | After gzip | Δ gzip | Δ initial gzip | Δ raw | Δ Brotli |
| -------- | ----------: | ---------: | -----: | -------------: | ----: | -------: |

| react-router.minimal | 86,046 | 86,037 | -9 | -12 | +24 | +62 |
| react-router.full | 89,677 | 89,677 | +0 | -3 | +26 | -19 |
| solid-router.minimal | 34,131 | 34,135 | +4 | +4 | +30 | -56 |
| solid-router.full | 39,172 | 39,176 | +4 | +5 | +30 | +37 |
| vue-router.minimal | 50,603 | 50,610 | +7 | +8 | +30 | +71 |
| vue-router.full | 56,325 | 56,327 | +2 | +3 | +30 | -18 |
| react-start.minimal | 99,109 | 99,106 | -3 | +0 | +26 | +23 |
| react-start.query-integration | 106,707 | 106,706 | -1 | -1 | +26 | +84 |
| react-start.deferred-hydration | 99,834 | 99,831 | -3 | -3 | +26 | -43 |
| react-start.full | 102,248 | 102,249 | +1 | +4 | +26 | +60 |
| react-start.rsbuild.minimal | 98,996 | 99,073 | +77 | +37 | +124 | +132 |
| react-start.rsbuild.minimal-iife | 99,397 | 99,479 | +82 | +41 | +124 | +60 |
| react-start.rsbuild.full | 102,363 | 102,443 | +80 | +40 | +116 | +85 |
| solid-start.minimal | 47,268 | 47,275 | +7 | +5 | +30 | +47 |
| solid-start.deferred-hydration | 50,387 | 50,389 | +2 | +3 | +30 | +83 |
| solid-start.full | 52,405 | 52,413 | +8 | +6 | +30 | -30 |
| vue-start.minimal | 66,954 | 66,955 | +1 | +5 | +30 | -55 |
| vue-start.full | 70,768 | 70,776 | +8 | +7 | +30 | -55 |

### Repeated browser timing

Same production React workload and benchmark file, ten navigation steps per
sample. First runs had the demo servers running; paired repeats stopped those
servers. All values below are milliseconds except Hz/RME/sample count.

| Run               |     Mean |     Hz |      p99 |     p999 |    RME | Samples |
| ----------------- | -------: | -----: | -------: | -------: | -----: | ------: |
| Main initial      | 1.137325 | 919.68 | 2.290719 | 2.707812 | 0.672% |   8,793 |
| Candidate initial | 1.283093 | 827.21 | 2.880262 | 3.933074 | 0.808% |   7,794 |
| Candidate repeat  | 1.239971 | 855.34 | 2.708809 | 3.404841 | 0.934% |   8,065 |
| Main repeat       | 1.187967 | 892.08 | 2.512739 | 3.746239 | 1.493% |   8,418 |

The last paired candidate mean is about 4.4% slower than main, with mixed tail
results. This is a possible regression, not evidence of performance parity.
Between-process/system variation is larger than the within-run confidence
intervals suggest. The browser hot navigation algorithm is unchanged; further
controlled CPU simulation/paired runs are needed before production adoption.
Native scope construction remains intentionally heavier than reusing one web
Router, and should be replaced with first-class execution scopes before claiming
React Navigation performance parity.

### Focused new-mechanism measurements

The new feature has no main counterpart, so these are candidate cost measurements,
not claimed before/after wins. The fixtures assert resource disposal/retained
entry identity before/after timed work. Native scope cases use React/DOM host
stubs, not simulator frame timing. Metrics and final validation follow below.

| New mechanism                                 |  Mean ms |   p99 ms |  p999 ms |    RME | Samples |
| --------------------------------------------- | -------: | -------: | -------: | -----: | ------: |
| Scope creation/load + push/back, 100 routes   | 0.067813 | 0.115712 | 1.165203 | 1.728% |  14,747 |
| Scope creation/load + push/back, 1,000 routes | 0.545641 | 1.229770 | 1.789659 | 1.130% |   1,833 |
| Controller push/back, 0 inactive visits       | 0.001889 | 0.004917 | 0.028250 | 1.442% | 529,505 |
| Controller push/back, 100 inactive visits     | 0.013222 | 0.020625 | 0.126889 | 0.390% |  75,630 |
| Controller push/back, 1,000 inactive visits   | 0.113370 | 0.215625 | 0.254158 | 0.304% |   8,821 |

These figures expose linear retained-history scans and route-tree construction
cost. Vitest also warned that module-export getters add overhead in scope cases;
treat them as directional host costs. No claim of device navigation latency,
RSS stability, or production parity follows from them.

## Final verification

- Final combined Nx run: **42 tasks succeeded**, zero cache hits. Includes
  core/React/Solid/Vue units, types, lint, build/export checks; native adapter
  tests/types; example web/native types/build and three browser flows.
- Native adapter host regression suite: **6 tests passed**. Core presentation
  histories: **15 tests**, plus the no-document navigation regression.
- Production Nitro browser check: **3 Playwright tests passed**.
- Real iOS build and interactive flows recorded in `UNIVERSAL-NATIVE-EXPERIMENT.md`.
- Focused benchmarks rerun serially through Nx: 4 tasks succeeded.
- Final full 18-scenario bundle run `universal-native-final` reproduced the
  composed candidate exactly for gzip, initial gzip, raw, Brotli and JS files.
- This is a working experiment with explicit architectural/performance limits,
  not a claim of full React Navigation feature parity or production readiness.
