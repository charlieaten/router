# Native sheet activity correction

This is a correctness change to custom renderStack activity projection, with no public API change. Logical formSheet entries attach to a preceding native page; activity must preserve the last two page groups rather than the last two logical entries.

## BEFORE

Tests/benchmark support committed first in 3d18bccc8a. Implementation was stashed and rebuilt. The new ordinary-page/sheet/author and consecutive-sheet public API regressions failed because the background page was hidden. The four focused custom stack rendering benchmark cases completed successfully (10/100 entries, pages/mixed sheets). Console timing output was suppressed by the harness; no quantitative performance claim is made.

Full bundle baseline: sheet-activity-baseline, all 18 scenarios.

## AFTER

Restored implementation. Native unit/types/lint passed (Nx 6 tasks succeeded). The same four focused benchmark cases completed (Nx performance run 3 tasks succeeded). Web unit and type matrix passed in the broader candidate checks.

Full bundle candidate: sheet-activity-candidate compared with sheet-activity-baseline. All 18 scenarios have zero raw, gzip, initial gzip and Brotli byte delta. These browser scenarios exclude the changed native-only module; they are browser regression evidence, not a native application bundle measurement.

The production diff is one dependent correctness group: resolve options once per entry, project native page groups, and use those groups for Activity visibility. It remains linear in stack entries and resolves options once rather than repeatedly. No speedup is claimed. Keeping the background page mounted is intentionally required for correct native presentation.

Five focused reviewers covered activity, ownership, performance, route matching and coverage. Added consecutive/initial sheet coverage; app renderer tests additionally cover stale completion callbacks, reset ownership, native close and blocked dismissal.

Real iOS production verification in Tastebuds: Review -> Comments TrueSheet route -> ordinary author profile -> edge-swipe Back restores unsent draft. The routed fixture preserves component identity, scroll and reply target. No API, loader, Start RPC or per-visit execution ownership redesign.
