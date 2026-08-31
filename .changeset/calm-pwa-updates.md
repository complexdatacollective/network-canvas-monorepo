---
'@codaco/fresco-ui': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
---

Make app updates reliable without reloading open work automatically. Fresh launches now activate an available update before the interface appears, updates found after rendering wait for an explicit install action, and the post-reload state reliably links to the release notes.
