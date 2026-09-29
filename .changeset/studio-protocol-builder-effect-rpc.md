---
'@codaco/studio-server': minor
'@codaco/studio-client': minor
'@codaco/studio-rpc': minor
---

The protocol editor talks to Studio over Effect rpc. The editor's socket at
`/ws` carries imported files as raw bytes, as it did before, and a unary
fallback for clients that cannot open a WebSocket is served at
`/rpc/protocol-builder`. Locks, presence and live updates behave as before; a
tab whose connection drops keeps its locks for the same reconnect grace. The
oRPC protocol-builder contract is no longer exported from `@codaco/studio-rpc`.
