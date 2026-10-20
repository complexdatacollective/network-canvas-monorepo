---
'@codaco/fresco-ui': patch
---

`SubmitButton` now always shows its spinner and stays disabled while its form
submits. Before, a caller's own `icon` replaced the spinner, and
`disabled={false}` let the form be submitted a second time during the first
submission.
