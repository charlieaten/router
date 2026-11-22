---
'@tanstack/router-generator': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Add an async withTanStackRouter Metro integration that generates before bundling and owns development watching through the Metro server lifecycle. Initial and watched generation honor the same inline configuration and propagate failures.

Support routeTypes to emit one complete route catalog and declaration facades alongside platform-filtered JavaScript trees. Preserve generated type exports and Start registration in declarations, without injecting TypeScript into runtime output.
