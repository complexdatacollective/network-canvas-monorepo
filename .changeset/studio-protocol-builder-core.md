---
'@codaco/studio-client': patch
'@codaco/studio-rpc': patch
'@codaco/studio-server': patch
---

Take the protocol-authoring contract from `@codaco/protocol-builder-core`
rather than `@codaco/protocol-builder`. The contract, its schemas and its typed
errors are unchanged — they now live in a package with no React and no
`@codaco/fresco-ui` in its dependency closure, so a change to the stage
editors' UI no longer invalidates the server's build and test selection.
