---
'@codaco/studio-client': patch
'@codaco/studio-server': patch
'@codaco/studio-rpc': patch
---

Update oRPC to 2.0.0-beta.40. The RPC transport now checks serialized values
before restoring them (rejecting a non-Blob value sent where a file is
expected) and no longer mutates payloads while deserializing them. The
published `/api/v1/openapi.json` document is unchanged.
