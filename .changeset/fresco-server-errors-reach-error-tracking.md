---
'fresco': patch
---

Fresco's own error reports are more reliable. A page that fails to load now
reports the identifier the server recorded alongside it, so a failure can be
traced to its cause. Deployments whose settings cannot be read are told that
error reporting is off rather than being left to assume it is working. The
container also no longer reports a failure of its own when it cannot write a
cache directory it does not need.
