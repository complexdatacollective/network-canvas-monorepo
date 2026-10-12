---
'@codaco/studio-api': patch
'@codaco/studio-sync': patch
---

An author keeps the section they are editing when the API restarts.

The process that granted an edit lock was the only thing renewing it, so after
a restart nothing kept it alive and it expired within 30 seconds. The editor
still showed the section as the author's, and their next save was refused and
the form reset. Now, when the editor's live connection comes back, the server
renews every lock that browser tab still holds and keeps renewing it. A lock
that has already expired is not revived, and another author's lock is never
touched.
