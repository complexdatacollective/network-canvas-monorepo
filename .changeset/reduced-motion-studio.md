---
'@codaco/studio-web': patch
---

Studio now honours the operating-system "reduce motion" setting.

Motion is off by default in the animation library behind Studio's shared
interface components, so movement in the shell, the protocol editor, dialogs
and overlays played in full for everyone. It now settles into place without
travelling for anyone who has asked their device for less movement, while
gentle fades are kept.
