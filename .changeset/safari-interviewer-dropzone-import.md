---
'@codaco/interviewer': patch
---

Fix protocol import in Safari installed apps by moving Interviewer's import card onto a mounted `react-dropzone` file input, matching Architect's working file-picker pattern. The import card still supports click, keyboard activation, and drag-and-drop, but no longer relies on an ephemeral input created only when the card is clicked.
