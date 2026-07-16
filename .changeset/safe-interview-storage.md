---
'@codaco/interviewer': patch
---

Warn clearly when unexported interview data is at risk in Safari or Firefox,
while using a calmer notice for low-risk Chromium storage and matching the Install
action to each warning level. Persistent storage is now requested after the first
user interaction instead of during page load.
