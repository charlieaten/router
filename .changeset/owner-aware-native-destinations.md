---
'@tanstack/react-router': patch
'@tanstack/router-core': patch
---

Resolve native navigation destinations through their calling visit's owning navigators. Restore matching layout owners and nested tab state, with covering-page removal and destination changes committed atomically after blockers accept. Explicit push, replace, target and entry intents retain their behavior.

Add coordinated navigation activation and final-destination blocker metadata. Canonicalize native navigator defaults to avoid duplicate index visits.
