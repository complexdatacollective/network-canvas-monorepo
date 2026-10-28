---
'@codaco/fresco-ui': minor
'@codaco/tailwind-config': minor
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Reduced motion now follows `AnimationProvider`'s `reducedMotion` setting everywhere, not only in Motion components. `@codaco/fresco-ui/reducedMotion` adds `usePrefersReducedMotion()` (use it instead of Motion's `useReducedMotion()`, which reads only the operating system) and `prefersReducedMotion(node)` for code outside React. The provider marks the document root with `data-reduced-motion` when it overrides the system, and `@codaco/tailwind-config`'s `motion-reduce:` / `motion-safe:` variants and its global reduced-motion rule follow that mark. With the default setting nothing changes: motion follows the operating system's preference as before.
