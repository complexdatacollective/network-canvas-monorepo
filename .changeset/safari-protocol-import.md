---
'@codaco/interviewer': patch
---

Fixed protocol import on Safari: selecting a `.netcanvas` file from the file picker now imports correctly, including when Interviewer is installed as an app (Add to Dock). Previously the picker could silently fail because Safari discards a file input that isn't part of the page while the picker is open.
