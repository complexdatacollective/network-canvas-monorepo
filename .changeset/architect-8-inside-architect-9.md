---
'@codaco/architect': minor
'@codaco/fresco-ui': patch
---

Architect 8 can now run inside Architect 9, at `/v8/` on the same site, so you can keep editing schema 8 protocols after Architect 9 ships. Inside Architect 9, Architect 8 shows a banner in the protocol editor, and a library menu item, that open Architect 9's upgrade for the protocol. Architect 9 creates a schema 9 copy and leaves the original unchanged. Architect 8 can also open a protocol from a link, and files you open in it from your computer are passed on to Architect 9.

The app update check now offers the highest released version, rather than the release GitHub lists first. A fix released for an older major version (for example Architect 8 after Architect 9 is out) is no longer offered as an update to the newer one.
