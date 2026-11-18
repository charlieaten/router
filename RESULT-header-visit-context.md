# Shared native visit context

## Result

Replaced the previous per-header-slot context fix with a shared visit boundary in the React Native binding. No router-core, TanStack Start runtime/compiler, route-matching, file-route, or navigation-action changes were needed.

The default presenter scopes custom header configuration and page content together. With no custom header configuration it keeps the boundary inside the content Activity instead of introducing an unnecessary outer chrome boundary. Standalone/content-only custom presentations still scope their content.

Custom presenters rendering native chrome must use the additive `item.wrap(children)` render function around both chrome and content:

```tsx
const content = (
  <>
    <Stack.HeaderConfig title={item.title} {...item.options?.header} />
    {item.content}
  </>
)

return (
  <Stack.Screen key={item.key} screenKey={item.key}>
    {item.wrap ? item.wrap(content) : content}
  </Stack.Screen>
)
```

`wrap` returns a normal, stable-type React boundary with the latest entry as a prop. It is a render function, not a component to mount as `<item.wrap>`. The initial `item.Provider` idea was discarded: caching component types by entry object would remount state when reuse replaces an entry while preserving its visit key. The final approach has no provider cache and no per-slot descriptor rewriting.

This supersedes the earlier compatibility-fallback proposal, following the user's authorization to simplify unreleased fork APIs. Existing content-only presenters continue to work. Custom presenters with header hooks must adopt `wrap`; they no longer receive automatically scoped slot callbacks. Standard Navigation adapters that render chrome outside descriptor content likewise need their navigator to cooperate with a common screen wrapper; `descriptor.render()` alone only scopes the content.

Tanner's local `upstream/feat/react-native` experiment was inspected for its native options and rendering approach. This change keeps our existing `staticData.native` and renderStack model rather than adding another screen factory, route registry, or presentation DSL. Our independent per-visit navigator ownership remains intact.

## Lifecycle and context

The common scope supplies entry identity, the visit's router, and its nearest route match. Page route matches still establish their own match boundaries below it.

Native screen keys, transition/dismiss handlers, outlet placement and page Activity boundaries remain intact. App `Wrap` stays inside page content; it is not moved around native screens or instantiated per header slot. Global app providers above the navigator remain available to both regions. Page-local providers do not become visible to headers.

`Wrap` now executes inside the visit routing scope. Previously RouterContextProvider placed Wrap outside its own router context. Consequently hooks inside Wrap can now observe the owning visit; this is an intentional context refinement, not a claim of identical behavior for every wrapper.

## Validation

- Default and custom shared presenters; iOS title and Android center slots.
- Nested stacks, distinct parameters, and duplicate visits to the exact same URL.
- Header and page state retained across push/pop.
- Same-key child reuse with changed search, and ancestor reuse rebuilding nested entries.
- Explicit route params, nearest-match params, loader data, and live invalidation updates.
- Header-initiated Back uses the owning nested navigator.
- Header Suspense fallback while body remains rendered; correct title on resolution.
- A host-rendering application Wrap does not become a parent of native screen hosts.
- Public wrapper API type coverage.
- 34 native tests and 1,240 web unit tests passed (one web test skipped). Native/web types, ESLint and package checks passed.

These are React/native-host simulation tests, not simulator or physical-device verification. No app dependency was changed and nothing was pushed. Tastebuds staging was left untouched.

## Paired performance comparison

Baseline is the previous per-slot fix, not upstream main. Identical benchmark source was used against saved baseline and final candidate source, with builds through Nx. The workload reads nearest params from header hooks and performs push plus pop with 10/100 retained visits and zero/three title/action slots. Eight focused cases use one-second sampling (Vitest can exceed this to collect its minimum sample count).

| Presenter | Visits | Slots | Before mean ms | After mean ms | Change |
| --------- | -----: | ----: | -------------: | ------------: | -----: |
| default   |     10 |     0 |          1.043 |         1.082 |  +3.7% |
| default   |     10 |     3 |          2.143 |         1.782 | -16.9% |
| default   |    100 |     0 |          7.757 |         8.167 |  +5.3% |
| default   |    100 |     3 |         20.981 |        15.861 | -24.4% |
| shared    |     10 |     0 |          0.647 |         0.720 | +11.2% |
| shared    |     10 |     3 |          1.231 |         1.021 | -17.1% |
| shared    |    100 |     0 |          4.388 |         4.910 | +11.9% |
| shared    |    100 |     3 |         10.383 |         8.453 | -18.6% |

Three-slot cases improved by approximately 17–24%. Zero-slot cases showed approximately 4–12% increases, or 0.04–0.52 ms per pair. The custom zero-slot fixture deliberately installs a common wrapper even though no chrome is rendered. These are measured tradeoffs, not a universal optimization win.

The shared scope removes repeated slot providers, but it does not eliminate reconciliation of retained headers. Final mean RME was approximately 0.9–2.7%; tails are noisier. These short jsdom runs do not establish native frame times, gesture performance or memory retention. Mount/render counts were collected; mount counts include newly pushed visits and should not be compared without normalizing for iterations. State-retention regressions separately verify retained visits do not remount.

Attribution: the first shared candidate still used a component factory and an unnecessary forwarding component; this was slower in some cases and had the same-key remount defect identified in review. The final version replaces it with the generic render wrapper and skips unnecessary outer chrome scope in the default no-header path. These changes form one dependent boundary/lifetime correction; no unrelated core optimization was retained. Five read-only reviews covered context, lifecycle, API, slot coverage and benchmark gaps.

## Bundle size

Sum of individually gzipped unminified native ESM modules: 36,583 → 36,266 bytes (-317). This is not a minified Metro app bundle measurement.

Full web/Start comparison uses `shared-visit-before` and `shared-visit-final` under `benchmarks/bundle-size/results/runs/`. Generated timing logs are local artifacts. All 18 final web/Start scenarios were byte-identical to the per-slot baseline (raw, gzip, Brotli and initial-load totals).
