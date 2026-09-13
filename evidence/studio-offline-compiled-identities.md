# Studio compiled identities without upload credentials

Linux distribution qualification of c98282c8 failed because the actual Docker client had no provider compiled-file identifiers: the Studio plugin skipped processing when upload credentials were absent. Studio now uses the existing offline provider-compatible processor in this case. The upload stub and Studio share one implementation; credentialed uploads and other apps retain their existing lane.

Validation: the old credential-free plugin failed the new regression test. The corrected plugin passed a real Vite build and VM execution test; the existing upload-stub test also passed (three tests total). Server typecheck, focused lint and Knip passed (two existing configuration hints).

The actual Studio Docker image built successfully, manifest list sha256:a1f175d77de06d456246ae28ebd832ecd6acbb994e86378e9edc2295797a94fa. Read-only, network-disabled inspection found identifiers in all 11 browser chunks and all 24 source-mapped server chunks; two generated server shim/runtime files have no source maps. Neither output ships private .map files. The server entrypoint registers its identifier.

Full Linux distribution/privacy qualification must still run on this pushed candidate. This evidence does not establish a published signed release or managed production qualification.
