---
'@codaco/studio-server': patch
'@codaco/studio-rpc': patch
'@codaco/studio-sync': patch
---

Serve the protocol-builder host contract over RPC and WebSocket. Studio's contract now carries `@codaco/protocol-builder`'s own contract under `protocolBuilder`, and the server implements it against the sectioned draft store: section locks over the existing lease table, whole-section writes that commit the staged resources they name in the same revision, atomic section creation with its pointer, atomic stage deletion with its pointer, compound codebook refactors that sweep every reference the protocol schema declares and refuse the ones they cannot remove, staged resources, and one ordered event channel per protocol that replays from a cursor. `/ws` serves the same router as `/rpc` in place of its echo placeholder. `@codaco/studio-sync` gains `section-references`, the reference walk in section coordinates both hosts read, and exports the per-section shape check they had each written for themselves.
