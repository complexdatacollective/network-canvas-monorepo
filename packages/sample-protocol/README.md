# @codaco/sample-protocol

The **Sample Protocol** for Network Canvas — the gentle onboarding/demo protocol shown in
Architect's "Templates" tab. It is vendored here (rather than fetched from a remote URL) so the
repository is self-contained, mirroring `@codaco/development-protocol`.

- `protocol.json` — the protocol at the current schema version (migrated from the original v7
  `Sample Protocol v4.netcanvas`).
- `assets/` — the images, videos, and CSV roster data referenced by the protocol's
  `assetManifest` (keyed by the `source` filename of each manifest entry).

The package entry (`.`) resolves to `protocol.json`; individual asset files are exposed under
`./assets/*` so consumers (e.g. `@codaco/architect-web`) can bundle them.
