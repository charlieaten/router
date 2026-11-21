# Explicit native navigator ownership — 2026-11-19

## Result

Tab and drawer leaf branches render visit content directly, without an implicit Screens stack. A layout visit can introduce an explicit stack navigator through its Outlet. Existing entry providers and match execution boundaries continue to own route hooks, headers, loaders and nested navigation state.

Tastebuds now exposes `nativeStack`, `bottomTabs`, and `materialTopTabs` through its local `@tastebuds/navigators` package. Root and Map/Search stacks are explicit. Saved's Archive/Buds pages render directly. The existing native stack/TrueSheet presenter is passed only to `nativeStack`, not to the tab definitions.

## Fork changes

- Initial branch matching treats `/` as a fallback and prefers more specific paths, preserving direct links such as `/search` through an explicit slash-root Map stack. A public-API regression failed before this correction and passes after it.
- Native leaf presentation recognizes direct tab/drawer/custom branches and explicit stack containers. Nested containers that omit kind inherit the same tabs default as non-leaf presentation.
- Direct rendering retains React state for any visits held by low-level branch history. Earlier visits are hidden without adding stack screens. Dirty visits remain active so their removal blockers are not unregistered by Activity.
- Native container `keepActive` permits pager branches to render while unfocused. Focus still follows the shared navigation ownership path.
- Core `navigation.initialize(container?)` accepts an optional container to prepare an inactive branch without selecting it or changing tab history. Existing argument-less initialization is unchanged. This is a small extension using the existing transaction/ensure machinery, not another history owner.
- Native root redirect and persistence wrappers forward the optional argument. Passive initialization does not redirect the active owner through the root redirect recovery path.
- The native surface initializes unvisited eager leaf branches after the active visit exists, and stops scheduling when its effect is superseded.

There is no new route registry, router wrapper, loader API, or global navigator-instance lookup.

## Correctness coverage

The original direct-tab regression failed on baseline: plain tabs rendered an unwanted native-back screen. It passes after the change. The inactive-initialization regression also failed on baseline (the requested branch remained empty) and passes now.

Added regressions cover direct-tab state retention; nested default tab containers; explicitly nested stacks across tab switches; duplicate Saved owner visits; low-level history push/back retention; an offscreen dirty tab keeping its blocker; eager but unfocused page content; inactive initialization idempotence/selection/history; and forwarding through persisted initialization.

Reviewed by five independent read-only agents. Their findings led to blocker retention, nested-kind consistency, eager initialization, native text-label correction, default bottom-tab labels, and app leaf-presentation fixes. Tastebuds uses the existing `InnerWrap` for screen presentation independent of stack/sheet presenters. Its new pathless Map web layout preserves the nearest presented outlet.

The app uses built artifacts of these local changes, recorded with source hashes in `apps/native/lib/navigation/router-snapshot.json`. All Start/router consumers are pinned to those same vendored router/core artifacts. Existing history and other dependency pins are retained. No push was performed.

## Controlled native rendering benchmark

Same two/five-tab workload, same benchmark file, identical retained-visit and mount-count assertions, same environment. Production implementation files were temporarily replaced by HEAD for BEFORE and restored automatically before AFTER; tests and benchmark support remained identical. No user index reset, stash, or commit was needed. All source swaps were confined to the fork.

React/jsdom with mocked native hosts; these numbers do not measure UIKit/Android screens CPU, allocations, memory or animation smoothness. All pages were initialized before timing retained switches. No cold-start claim is made.

| Tabs | Before mean ms | After mean ms | Before p99 ms | After p99 ms | Before RME | After RME | Before samples | After samples |
| ---- | -------------: | ------------: | ------------: | -----------: | ---------: | --------: | -------------: | ------------: |
| 2    |         0.3858 |        0.3781 |        1.2683 |       1.1984 |      1.49% |     1.33% |           2593 |          2645 |
| 5    |         1.7427 |        1.8256 |        2.8093 |       4.2093 |      6.73% |     2.93% |            574 |           549 |

Two-tab means differ by about -2%; five-tab means by +4.8%. The noisy baseline five-tab sample includes a 17.16 ms p999 versus 7.75 ms afterward. Confidence ranges overlap, so this does not establish a speed improvement or significant regression. No speculative optimization was added based on these numbers.

Logs: `/tmp/explicit-tabs-perf-before.log`, `/tmp/explicit-tabs-perf-after.log`.

## Bundle checks and attribution

Full bundle baseline/candidate runs: `explicit-tabs-before` and `explicit-tabs-final` under `benchmarks/bundle-size/results/runs`. All 18 Router/Start scenarios across React, Solid, Vue and Rsbuild are byte-for-byte unchanged, including raw, gzip, initial gzip and brotli bytes. The changed navigation entrypoint and native-only rendering code do not enter these web scenarios.

Native ledger (individual modules, gzip with mtime=0; not an app-bundle sum):

| Module                | Before raw | After raw | Before gzip | After gzip |
| --------------------- | ---------: | --------: | ----------: | ---------: |
| Native provider       |      19508 |     20671 |        5234 |       5459 |
| Standalone navigation |      31480 |     31640 |        7468 |       7487 |

The rendering and inactive-initialization changes are correctness work. Initialization and its native forwarding/eager-effect changes form one dependent group; direct leaf rendering is the other group. Web measurements cannot attribute native cost because both groups are excluded from all web scenarios; native module sizes and the focused renderer benchmark cover that limitation. No independent optimization-only hunk is retained. Further shrinking these paths would remove lifecycle/blocker/retention safeguards or obscure their invariants.

## App verification and limits

Tastebuds package tests and native navigation/presentation tests pass. Web typechecking and pathless-layout presentation regressions pass. Phoenix precommit passes 470 tests. Native app typechecking still reports the unchanged testing-library RenderResult mismatch at `lib/navigation/route-presentation.test.tsx:111`.

On the booted iOS QA simulator: Archive/Buds presses and swipe; restoration after leaving Saved; Settings push/swipe Back; Map/Search push, tab restoration, a direct `/search` link, Back button and Map reselect; collection-create and nested collaborators open/close/discard; and comments → author → edge Back with the draft retained were verified. Search's nested-stack edge Back was confirmed from a fresh launch; the earlier attempt over a horizontal carousel was consumed by that carousel. Back and reselect also work. Typed Search-query retention could not be verified because text entry did not take. Android was not exercised.

One test comment was accidentally submitted by the automation while clearing its retained draft. It was removed from the local database by a transaction constrained to its exact review, author, content and recent timestamp; dependent activity records cascade. No collection was created.

## Why useSelectAppTab remains

A temporary public-API diagnostic attempted to return from a covering root page using `router.navigate({ to: '/saved', stackBehavior: 'reuse' })`. It produced three root visits instead of returning to the original tab owner. The expectation for owner reuse failed; the temporary diagnostic was removed after recording the evidence.

The helper therefore is not redundant. Removing it needs generic nearest-owner destination activation, route-to-branch resolution and atomic handling of owner unwinding/blockers. That should live in shared native destination resolution, not in top/bottom-tab presenters. This presentation change deliberately does not intercept or change the public navigate operation.

## Separate Expo development-client crash found during verification

One cold-launch/reload attempt produced `Tastebuds-2026-11-19-172552.ips` (SIGTRAP/EXC_BREAKPOINT). The faulting stack is Swift `_assertionFailure` → `DevLauncherNetworkInterceptor.__deallocating_deinit` → `ExpoRequestCdpInterceptor.dispatchEvent` on its background queue. The installed Expo Dev Launcher 58.0.21 source has an explicit `assert(Thread.isMainThread)` in `deinit`; the CDP interceptor uses a weak delegate and accesses it from `dispatchQueue.async`. This identifies a development-client network-interceptor teardown assertion, not a native router frame. Reopening succeeded and the fresh-root Search nested swipe test passed. No Expo dependency workaround or native rebuild was made; an upstream lifetime/threading fix should be evaluated separately.
