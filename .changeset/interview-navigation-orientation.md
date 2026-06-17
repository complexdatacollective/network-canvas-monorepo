---
'@codaco/interview': minor
---

Stop the interview navigation from flipping orientation when a portrait tablet's
software keyboard resizes the viewport. The automatic aspect-ratio threshold for
switching the nav between a side rail (`vertical`) and a bottom bar
(`horizontal`) is now more generous (`5/4` instead of `3/4`), so a keyboard
opening on an iPad in portrait no longer pushes the aspect ratio past the
breakpoint and snaps the nav to the side mid-interview.

Hosts that know their device context can also bypass the automatic detection
entirely with the new optional `navigationOrientation` prop on `Shell`
(`'horizontal' | 'vertical'`, exported as the `NavigationOrientation` type).
