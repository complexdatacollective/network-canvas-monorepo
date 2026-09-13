# Template Registry API

`openapi.json` is the normative OpenAPI 3.1 contract for the independent Network
Canvas Template Registry. `openapi-3.0.json` is a generated compatibility export
for tooling that has not adopted OpenAPI 3.1. In the source monorepo, regenerate
both with `pnpm --filter @codaco/template-registry generate:openapi`. The
running service serves the same generated contract at
`/api/v1/openapi.json`.

[`template-exchange-v1.md`](template-exchange-v1.md) is the normative,
standalone specification for the content-addressed artifact carried by publish
and fetch operations.

Source-repository CI generates a client from `openapi-3.0.json` with a hashed,
pinned `openapi-python-client==0.29.0` environment and its checked-in media-type
override, then uses that generated client against an actual Registry HTTP
listener bound to localhost. Generation warnings fail the gate.

The contract and the template exchange format specification are dedicated to
the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The canonical legal text is included in `LICENSE` so this directory can be
published without inheriting the monorepo's software license.
This dedication covers the specifications, not the licensed template artifacts
that the registry serves. Each artifact declares its own license.

Registry entries locate an artifact. The artifact's Merkle root identifies its
immutable content independently of any registry. A registry-issued publisher
credential authenticates writes; a Studio instance API token does not.

These files are the publication source. Each published revision records the
exact monorepo source commit. Runtime deployment and operational qualification
remain separate from specification publication.
