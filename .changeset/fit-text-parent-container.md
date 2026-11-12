---
'@codaco/fresco-ui': patch
---

`useFitText` now fits the text again when its container resizes, even when a parent component renders that container. Before, such a container was never observed, so the text kept the size it was first given.
