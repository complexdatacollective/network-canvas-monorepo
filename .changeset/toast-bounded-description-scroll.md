---
'@codaco/fresco-ui': patch
---

`Toast`'s description no longer grows without limit. A toast is anchored to the bottom of the screen and grows upward, so a consumer rendering a lot of content (a long message, a list of errors) could push the toast's own title and Close control off the top — clipped by the browser window with no way to read or dismiss it. The description is now capped and scrolls internally instead, keeping every toast's title and Close control on screen and reachable regardless of how much content it renders.
