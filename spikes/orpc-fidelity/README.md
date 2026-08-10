# Spike: oRPC v2 as the contract machinery (ADR #1248 course correction)

Reruns the OpenAPI-fidelity acceptance gate (`spikes/openapi-fidelity`,
`spike/1248-openapi-fidelity`) against **oRPC v2** (beta), following setup-PR
review feedback directing Studio's client↔server communication to oRPC: the
same discriminated-union schemas and routes, expressed as oRPC procedures,
generated to OpenAPI 3.1 via `OpenAPIGenerator` + `ZodToJsonSchemaConverter`
(Zod 4's native `z.toJSONSchema`), then through `openapi-python-client`.

**Result: gate passes.** The generated Python models are typed discriminated
models equivalent to the accepted `@hono/zod-openapi` chain, and two of that
chain's documented degradations do not occur here. Full findings are posted on
the ADR issue:
https://github.com/complexdatacollective/network-canvas-monorepo/issues/1248

## Reproduce

Prerequisites: Node ≥ 24, `uv` (for `uvx`).

```bash
npm install

# 1. Generate openapi-3.1.json from the oRPC router (4 routes, same shapes as
#    the original spike; named components come from Zod's registry via
#    .meta({ id }))
node generate-spec.ts

# 2. Generate the Python client from the committed document
mkdir -p gen && (cd gen && uvx openapi-python-client@0.29.0 generate --path ../openapi-3.1.json --overwrite)

# 3. Inspect the models
#    gen/**/models/session.py           → last_event: None | SessionAbandonedEvent | ...
#    gen/**/models/attributes.py        → dict[str, bool | float | list[str] | None | str]
#    gen/**/api/default/get_entity.py   → EdgeEntity | EgoEntity | NodeEntity dispatch
#    gen/**/models/node_entity.py       → entity_type: Literal["node"]

# 4. The original spike's headline hazard does NOT reproduce: use-site
#    .nullable() on a registered component leaves the shared component intact
#    (prints the untouched SessionEvent oneOf and the property-site
#    anyOf: [$ref, null])
node nullable-hazard.ts

# 5. One router served as REST + RPC simultaneously, plus a typed no-codegen
#    client over RPCLink
node dual-surface.ts

# 6. The scaffold's Hono topology (#1326) with oRPC mounted: /healthz,
#    /api/v1 REST via OpenAPIHandler, the 3.1 document served from within the
#    versioned path, /rpc via RPCHandler, problem-JSON 404 fallback
node hono-mount.ts
```

## Findings vs the accepted `@hono/zod-openapi` chain

- All 14 named components land in `components.schemas`; unions are `oneOf` of
  `$ref`s; path/query parameters split correctly with formats and constraints.
- **Original degradation 1 (registered-component contamination) is absent**:
  Zod's native registry does not mutate shared components when a use site
  applies `.nullable()`, so the registered-component-wrapper lint the original
  spike proposed becomes unnecessary.
- **Original degradation 2 is absent**: property-site nullability emits
  `anyOf: [$ref, {"type": "null"}]` — the `$ref` survives instead of inlining
  every variant.
- **Regression: no `discriminator` keyword** on generated unions (the hono
  chain emitted it with a complete `mapping`). Does not affect the Python
  gate — `openapi-python-client` ignores `discriminator` and trial-parses by
  required literal fields (original spike, finding 3) — but the spec is
  normative; if wanted, it is a deterministic post-processing step on the
  generated JSON.
- **Regression: no built-in OpenAPI 3.0 export** (no `doc()`/`doc31()` pair).
  The ADR's "3.0 alongside" deliverable needs a downgrade-converter step, or a
  decision that 3.1-only is acceptable (the original spike showed 3.0 types
  nullability strictly worse anyway).

## Files

- `schemas.ts` — the original spike's schemas ported to plain Zod 4 + oRPC
  idiom: `.meta({ id: 'Name' })` replaces `@hono/zod-openapi`'s
  `.openapi('Name')`.
- `generate-spec.ts` — the same four routes as oRPC procedures
  (`os.meta(openapi({ method, path }))`); writes `openapi-3.1.json`.
- `nullable-hazard.ts` — reproduction attempt for the original spike's
  headline hazard (it does not reproduce).
- `dual-surface.ts` — one router → `OpenAPIHandler` (REST) + `RPCHandler`
  (RPC) + typed `RPCLink` client, in-process.
- `hono-mount.ts` — the scaffold topology end to end in Hono.
- `openapi-3.1.json` — committed snapshot from `generate-spec.ts` (oRPC emits
  `openapi: 3.1.2`). Regenerating produces a formatting-only diff (the repo's
  pre-commit formatter re-wraps arrays); the JSON content is identical.

Versions pinned exactly by `package.json`: `@orpc/*@2.0.0-beta.26`,
`zod@4.4.3`, `hono@4.13.1`; the Python generator is invoked pinned as
`openapi-python-client@0.29.0`.
