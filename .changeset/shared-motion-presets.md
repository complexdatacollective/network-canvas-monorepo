---
'@codaco/fresco-ui': minor
'@codaco/tailwind-config': minor
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'@codaco/background-creator': patch
'fresco': patch
---

Animations now share one small set of springs, so that similar movements have the same speed and bounce in every app. Some animations are faster or bounce less than before. `@codaco/fresco-ui/motion` exports the springs (`press`, `snap`, `pop`, `settle`, `heavy`, `bouncy` and `glide`), a short exit tween, stagger delays, a `reduced()` helper for reduced motion, and shared enter and exit variants. `@codaco/tailwind-config` no longer provides the `spring-*` utility classes; use the Motion springs instead.
