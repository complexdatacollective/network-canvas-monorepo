# Template Registry API

`openapi.json` is the normative OpenAPI 3.1 contract for the independent Network
Canvas Template Registry. Regenerate it with
`pnpm --filter @codaco/template-registry generate:openapi`. The running service
serves the same generated contract at `/api/v1/openapi.json`.

The contract and the template exchange format specification are dedicated to
the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
This dedication covers the specifications, not the licensed template artifacts
that the registry serves. Each artifact declares its own license.

Registry entries locate an artifact. The artifact's Merkle root identifies its
immutable content independently of any registry. A registry-issued publisher
credential authenticates writes; a Studio instance API token does not.

These files are the publication source. Release qualification must separately
record their publication to the public specification repository; a local build
or this directory alone does not satisfy that requirement.
