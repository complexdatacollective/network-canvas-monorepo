---
'@codaco/background-creator': patch
---

The Background Creator now honours the operating-system "reduce motion"
setting.

Motion is off by default in the animation library it uses, so the preference
previously reached only the one place that had been written to ask for it.
Movement in the rest of the interface — dialogs, overlays and selection
feedback — now settles into place without travelling for anyone who has asked
their device for less movement.
