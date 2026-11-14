---
'@tanstack/react-router': minor
'@tanstack/router-core': patch
---

Support version-one Standard Navigation navigators through the native
integrateStandardNavigator adapter. Project visit-owned stacks and nested
containers into standard state/descriptors/actions, retain scoped route execution,
and support cancellable typed navigator events without adding another history
owner.

Keep retired execution render acknowledgements valid until native exit animations
release their retained views, preventing sheet-dismissal render crashes.
