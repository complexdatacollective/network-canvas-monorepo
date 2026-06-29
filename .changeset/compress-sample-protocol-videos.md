---
'@codaco/sample-protocol': patch
---

Re-encode the bundled video stimulus assets (H.264, CRF 24) to cut their size by
~88% (~16.5 MB → ~2 MB) with no visible quality change (SSIM ~0.998). Same
filenames, container, and codec, so consumers need no changes.
