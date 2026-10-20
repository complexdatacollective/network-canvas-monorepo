---
'@codaco/architect': minor
'@codaco/fresco-ui': patch
---

Architect 8 can now run inside Architect 9, at `/v8/` on the same site, so you can keep editing schema 8 protocols after Architect 9 ships. There it is the protocol editor alone: Architect 9 opens schema 8 protocols in it, and closing the editor takes you back to Architect 9.

The app update check now offers the highest released version, rather than the release GitHub lists first. A fix released for an older major version (for example Architect 8 after Architect 9 is out) is no longer offered as an update to the newer one. On an archived version's own site, such as `v8.architect.networkcanvas.com`, the update notes describe the newest release of that version, which is the update that site installs.
