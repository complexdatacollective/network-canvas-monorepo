---
'@codaco/fresco-ui': patch
'fresco': patch
---

Opening a newly created interview no longer crashes with "Maximum update depth
exceeded" on a slow connection. The overlay container behind dialogs and
toasts reacted to being detached while the page was still waiting for the
interview to download, and that reaction re-rendered the page in a loop until
React gave up. The interview now waits for its data and opens normally.
