---
'@codaco/background-creator': patch
---

The Background Creator now honours the operating-system "reduce motion"
setting.

Motion is off by default in the animation library it uses, so the preference
reached only the one component that had been written to ask for it. Movement in
the shared interface components — dialogs, menus and overlays — now settles into
place without travelling for anyone who has asked their device for less
movement, while gentle fades are kept.
