---
'@codaco/fresco-ui': minor
---

Export `storybook-support/awaitPassiveEffects`. It is what a Storybook play
function awaits before its first synthetic interaction, so the story's passive
effects have run and the event is not swallowed by a listener that is not
attached yet. Stories outside this package had no way to reach it, and the only
alternative was a second copy of the same three lines.
