---
'@tanstack/react-router': patch
---

Scope native headers and page content through a shared visit boundary. Custom stack presenters can wrap each screen with its item.wrap(children) render function, keeping direct route hooks and nested navigation bound to the owning visit without per-slot providers.
