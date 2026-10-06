---
'fresco': patch
---

Fresco's own error reports are more reliable. A page that fails to load now
reports the identifier the server recorded alongside it, so a failure can be
traced to its cause. Deployments whose settings cannot be read are told that
error reporting is off rather than being left to assume it is working. Self-hosted
deployments no longer report a failure of their own for the cache directory. A
deployment that mounts a volume there has its ownership corrected as the
container starts, whichever account owns it on the host, and deployments on
platforms that assign their own user account can now write there as well. The
application itself still runs as an unprivileged user. Where the path genuinely
cannot be made writable, such as a read-only filesystem, the container says so as
it starts rather than only failing later.
