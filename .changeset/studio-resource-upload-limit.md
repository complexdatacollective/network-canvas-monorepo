---
'@codaco/studio-client': patch
'@codaco/studio-server': patch
'@codaco/studio-rpc': patch
---

The protocol editor now refuses a resource larger than Studio stores (100 MB)
before reading the file, instead of reading and sending it only for the server
to refuse it. The limit lives in `@codaco/studio-rpc/uploads`, so the editor and
the server read one value.
