---
'@codaco/studio-client': patch
---

Merge `@codaco/protocol-builder`'s own message catalog into the one the Studio
client serves. The stage editors Studio mounts come from that package and
declare their own `protocolBuilder.*` ids; without this layer an en-GB reader
saw every one of them fall through to the source string.
