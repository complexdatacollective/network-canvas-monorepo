---
'@codaco/fresco-ui': patch
---

Fix the styled Select trigger so a long selected value truncates with an
ellipsis instead of overflowing its container. The value already used
`truncate`, but without `min-w-0` the flex item could not shrink below its
content width, so long labels spilled past narrow triggers.
