---
"@codaco/interview": prerelease
---

Switch the `Shell.tsx` interview-theme import to the new `@codaco/tailwind-config/fresco/themes/interview.css` path introduced in tailwind-config 0.5.0. Required so consumers of `@codaco/interview` resolve the theme under the package's exports field. No runtime behaviour change.
