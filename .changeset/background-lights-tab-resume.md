---
'@codaco/art': patch
---

Fixed the animated background (`BackgroundLights` and `BackgroundBlobs`) vanishing after a tab was left in the background for a while. The animation clock kept advancing while `requestAnimationFrame` was paused, so the first frame after returning teleported every blob far off-screen in a single step. Frame deltas are now capped so motion stays continuous across background/foreground cycles.
