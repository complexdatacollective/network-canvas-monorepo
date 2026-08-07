# Spike: OpenAPI fidelity (ADR #1248 acceptance gate)

Runs realistic Studio discriminated-union response schemas (entity-type union,
session lifecycle event union, nested session/network payloads, heterogeneous
attribute values, pagination envelope) through
`@hono/zod-openapi` → OpenAPI 3.1 (and the 3.0 export) → `openapi-python-client`,
and checks whether the generated Python models are typed discriminated models.

**Result: gate cleared.** Full findings, measurements, and degradation list are
posted on the ADR issue:
https://github.com/complexdatacollective/network-canvas-monorepo/issues/1248

## Reproduce

Prerequisites: Node ≥ 24, `uv` (for `uvx`).

```bash
npm install

# 1. Generate openapi-3.1.json + openapi-3.0.json from the canonical schemas
node generate-spec.ts

# 2. Generate the Python client from each document
mkdir -p gen31 && (cd gen31 && uvx openapi-python-client@0.29.0 generate --path ../openapi-3.1.json --overwrite)
mkdir -p gen30 && (cd gen30 && uvx openapi-python-client@0.29.0 generate --path ../openapi-3.0.json --overwrite)

# 3. Inspect the models
#    gen31/**/models/session.py        → last_event: None | SessionAbandonedEvent | ...
#    gen31/**/models/network.py        → ego: EgoEntity | None
#    gen31/**/api/default/get_entity.py → EdgeEntity | EgoEntity | NodeEntity dispatch

# 4. Reproduce the registered-component contamination hazard
node generate-spec.ts schemas-nullable-hazard.ts
#    → components/schemas/SessionEvent loses its discriminator and absorbs
#      {"type":"null"}; the Python client then names Ego "EgoEntityType0" and
#      injects a spurious None into the Entity union.
```

## Files

- `schemas.ts` — canonical contract schemas following the disciplined pattern:
  never call `.nullable()` (or any wrapper) directly on a **registered**
  component; wrap at the property site with `z.union([Ref, z.null()])`.
- `schemas-nullable-hazard.ts` — identical except `SessionEventSchema.nullable()`
  / `EgoEntitySchema.nullable()` at use sites, demonstrating that a use-site
  wrapper mutates the shared registered component.
- `generate-spec.ts` — builds the OpenAPIHono app (4 routes) and writes both
  spec documents.
- `openapi-3.1.json`, `openapi-3.0.json` — committed snapshots from the
  canonical schemas.

Versions pinned by `package.json` / this README: `@hono/zod-openapi@1.5.1`,
`zod@4.4.3`, `openapi-python-client@0.29.0`.
