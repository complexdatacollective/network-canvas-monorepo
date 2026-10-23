---
'@codaco/studio-api': patch
---

The published Studio images build again with the browser source-map upload
turned on. The image's build stage lacked the system CA certificates the upload
tool needs to reach PostHog over HTTPS, so the release build stopped there.
