---
'fresco': patch
---

Fresco's own error reports are more reliable. A page that fails to load now
reports the identifier the server recorded alongside it, so a failure can be
traced to its cause. Deployments whose settings cannot be read are told that
error reporting is off rather than being left to assume it is working. Self-hosted
deployments no longer report a failure of their own for the cache directory.
Deployments that give it a named volume, and those on platforms that assign their
own user account, can now write to it. Where the directory is mounted from a
location belonging to another account, the container now explains how to grant
access — including starting it once as root, which corrects the ownership and
then hands straight over to the unprivileged account Fresco always runs as. Where
the path cannot be made writable at all, such as a read-only filesystem, the
container says so as it starts rather than only failing later.
