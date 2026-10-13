---
'fresco': patch
---

The Fresco Docker image builds again. Version 4.3.0's image build stopped
because uploading error-reporting source maps needed git history that the image
build does not have, so no 4.3.0 image was published. Builds now name the
release version explicitly.
