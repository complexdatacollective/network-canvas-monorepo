---
'@codaco/fresco-ui': minor
---

Add `@codaco/fresco-ui/utils/saveBlob`, which saves a file the most reliable
way the browser offers: the Save As dialog in desktop Chrome and Edge, the
share sheet on iOS, iPadOS and Android, and a download everywhere else.
`saveBlob(blob, suggestedName, filetype)` resolves to `{ saved }`, and
`saveAction(blob, suggestedName)` says which of those it will use, so the
control that triggers it can be labelled "Save…", "Share…" or "Download".
