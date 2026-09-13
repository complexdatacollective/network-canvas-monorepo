---
'@codaco/fresco-ui': minor
'fresco': patch
---

Added `@codaco/fresco-ui/hooks/useHasHydrated`, the one implementation of "is this tree past hydration" for the handful of things only a browser can answer. It replaces eight hand-rolled copies across the design system and the apps.

In Fresco, the anonymous recruitment URL and the passkey option on the sign-in and sign-up forms now appear as soon as the page is interactive, without the extra render pass they used to wait for.
