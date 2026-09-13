# Public specification publication layout

## Publication source

This directory is the reviewable source for the public Network Canvas Template
Registry specifications. Publication copies the files below without semantic
rewriting:

| Monorepo source           | Public repository path                      | Role                                                               |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `LICENSE`                 | `template-registry/v1/LICENSE`              | CC0 1.0 legal text for the specifications.                         |
| `README.md`               | `template-registry/v1/README.md`            | Entry point, status, and artifact provenance.                      |
| `openapi.json`            | `template-registry/v1/openapi.json`         | Normative OpenAPI 3.1 contract generated from runtime Zod schemas. |
| `openapi-3.0.json`        | `template-registry/v1/openapi-3.0.json`     | Generated compatibility document for OpenAPI 3.0 tooling.          |
| `template-exchange-v1.md` | `template-registry/v1/template-exchange.md` | Normative version 1 exchange format.                               |

The public repository does not yet exist. As of 2026-09-13, the Complex Data
Collective organization has no repository named `network-canvas-specifications`
and no other repository dedicated to Network Canvas API specifications. The
recommended repository name is
`complexdatacollective/network-canvas-specifications`: it can hold this
Registry contract and later Network Canvas specifications without implying
that the template format is only an API description.

Repository creation and publication are release actions. They are deliberately
outside this source change.

## Required publication checks

Before publishing a revision:

1. Regenerate `openapi.json` and `openapi-3.0.json` from the Zod/oRPC contract
   with `pnpm --filter @codaco/template-registry generate:openapi`.
2. Confirm the generated files have no source diff.
3. Run the pinned `openapi-python-client` localhost round-trip with
   `pnpm --filter @codaco/template-registry test:openapi-client`.
4. Confirm every file in the version directory is covered by its CC0 license
   and that template artifact licenses remain explicitly separate.
5. Copy the files to the stated paths and record the source monorepo commit in
   the public repository change.

OpenAPI 3.1 is normative. The 3.0 file is a compatibility projection and MUST
NOT be edited independently. If the documents disagree beyond a necessary 3.0
representation change, clients and reviewers MUST use the 3.1 document and the
generator must be corrected at its Zod/oRPC source.

The `v1` directory matches the API path major version. Changes within v1 MUST
remain compatible with `/api/v1/`; an incompatible API contract requires a new
path-major directory. The exchange format carries its own `format_version` and
is not implicitly changed by an API revision.

Public review should occur through repository issues and pull requests so a
proposal, rationale, and exact specification diff remain available. No runtime
service deployment or generated client package belongs in the specification
repository.
