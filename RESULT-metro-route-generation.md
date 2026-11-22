# Metro-owned route generation

## Result

Route generation and watching now belong to the fork’s `@tanstack/router-plugin/metro` integration. Expo directly runs through its normal commands; `scripts/native-dev.mjs`, the app route-generation script and Vite catalog plugin are removed. The existing Start Metro compiler and RPC transformer remain separate and unchanged.

Metro generates a native-filtered JavaScript runtime tree and the complete shared TypeScript route catalog. Vite generates the web-filtered runtime and the same catalog. Adjacent declaration files export the catalog; web Start registration stays in the web declaration. Native runtime imports exclude dashboard routes while shared route types retain them. Route paths, per-visit ownership, Phoenix/Ash and authentication are unchanged.

```js
const { withTanStackRouter } = require('@tanstack/router-plugin/metro')

module.exports = withTanStackRouter(config, {
  root: webRoot,
  config: {
    routesDirectory: './src/routes',
    generatedRouteTree: './src/routes.runtime.native.js',
    disableTypes: true,
    routePlatform: 'native',
    routeTypes: {
      generatedRouteTree: './src/routes.gen.ts',
      routeFileIgnorePattern: '^__generated__$',
    },
  },
})
```

The helper awaits initial generation before Metro builds its graph. It creates a watcher only when the server starts, rescans after watcher readiness, uses the generator’s existing event queue and unchanged-write suppression, and closes the watcher with Metro. Middleware forwards generation and downstream middleware failures. Merely loading the config or doing a production build does not leave a watcher running. Catalog paths cannot collide with runtime modules or declarations.

This follows upstream `feat/react-native`’s Metro integration shape, with asynchronous initial generation, lifecycle cleanup and shared platform-independent types added. Metro/Expo accept the returned configuration promise. No navigation runtime redesign is involved.

## Controlled comparison

Reference: upstream `feat/react-native` at `af97669e8aa5f20c94802882f5ed1ec2024ee939`. Both adapters used identical current generator dependencies and fixtures, with byte-identical generated output, under Node 26.12.1. These measure adapter/generation work, not total Expo launch time or native navigation performance.

Startup means in milliseconds: two discarded warmups, ten fresh-process samples per case; missing and existing outputs measured separately.

| Leaf routes | Output | Upstream adapter | Fork adapter |
| --- | --- | ---: | ---: |
| 50 | Missing | 197.62 | 61.06 |
| 50 | Existing | 198.50 | 65.29 |
| 300 | Missing | 267.26 | 108.88 |
| 300 | Existing | 237.83 | 101.10 |

Watcher comparison: five samples, 100 existing routes and a 30-file burst. Upstream mean burst completion was 29.90 ms; the fork was 58.18 ms. Both performed two generation passes. An unrelated text-file burst caused four upstream passes and zero fork passes. Initial middleware readiness averaged 192.89 ms upstream and 71.33 ms in the fork. The edit-burst regression remains a development-time optimization opportunity; it is not evidence of a native navigation bottleneck.

Generating a shared catalog does extra development work. The repeatable `test:perf:metro` benchmark measured warm generation means of 5.57 ms versus 15.71 ms for 50 leaves, and 29.71 ms versus 92.14 ms for 300 leaves, without/with a shared catalog. This adds no per-navigation work. No device CPU or resident-memory improvement is claimed.

All 18 existing Router/Start bundle-size scenarios were unchanged in raw, gzip, initial gzip and Brotli bytes.

## Validation and limits

- Generator, Router plugin and Start plugin build, unit, type, lint and export checks passed (24 targets). Final middleware regression and plugin checks passed (11 targets).
- Tests cover platform filtering, full catalog exports, registration placement, conflicting paths, startup, edits, adds, deletes, renames, readiness failures, middleware errors and shutdown.
- Actual app Metro config loading generates outputs and exits without a watcher. Vite and Metro generate identical shared catalogs. The web runtime is byte-identical to the previous generator configuration.
- Native unit tests: 78 passed. Web node tests: 49 passed. Phoenix `mix precommit`: 470 passed.
- Vite client and Worker bundles built. Full app type checking remains blocked by existing native navigator/web export and Sentry version/type errors. Replacing the new declaration facade with the previous one produced the same six web error locations; the shared catalog and affected source files match their pre-task staged versions.
- RPC smoke testing confirmed the native production function ID exists in the server bundle. The local Worker then failed during HeroUI module loading (`reactNativeVersion` unavailable in `scroll-shadow.constants.js`), preventing live RPC validation. The runtime route graph is unchanged. This separate SSR dependency problem is not fixed here.
- No device navigation verification was performed for this build-tooling change.

## Dependencies and commands

The platform route declarations now come from the fork itself, so the two TanStack platform patches are removed. Seroval and unrelated patches remain. Sixteen active archives form a complete local dependency closure; obsolete archives are removed. Snapshots record archive checksums and local source hashes. Neither app needs an absolute path to a local fork.

Run `bun run start`, `bun run ios`, or `bun run android` from `apps/native`. See [Android shell setup](android-shell-setup.md) for the Java/Android environment formerly supplied by the wrapper.
