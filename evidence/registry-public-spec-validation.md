# Registry public specification review validation

Validated from Registry PR #1745 head `5a9b15f76135addea3f9f15006dac8eba083f4c1`
and public specification PR #1 on 2026-09-13.

## Review findings covered

- Public spec: `PRRT_kwDOUY3-os6h4mg1`, `PRRT_kwDOUY3-os6h4mg2`,
  `PRRT_kwDOUY3-os6h4mg5`, `PRRT_kwDOUY3-os6h4mg7`,
  `PRRT_kwDOUY3-os6h5BU5`, `PRRT_kwDOUY3-os6h5BU9`,
  `PRRT_kwDOUY3-os6h5BVB`, and `PRRT_kwDOUY3-os6h5BVC`.
- Registry service: `PRRT_kwDOKqiw4s6h5FVD`, `PRRT_kwDOKqiw4s6h5FVE`,
  `PRRT_kwDOKqiw4s6h5FVF`, and `PRRT_kwDOKqiw4s6h5FVG`.

The raw read-only review snapshots are retained next to this file.

## Verification

- Template exchange: 57 tests passed.
- Registry contract and recovery reconciliation: 101 tests passed.
- Registry HTTP behavior against PostgreSQL 18: 32 tests passed.
- `@codaco/studio-sync` and `@codaco/template-registry` typechecks passed.
- Oxlint completed with pre-existing warnings only; Oxfmt passed.
- Knip completed with only the two existing redundant-entry configuration hints.
- `openapi-python-client` 0.29.0 generated without warnings and completed the
  localhost list, artifact, and null-publisher account round trip.

`registry-public-spec-mutants.log` records failing controls for multiple reusable
subjects, leading markup in CSV, recursively non-finite JSON numbers, ambiguous
duplicate recovery members, and the incompatible OpenAPI 3.0 nullable-reference
shape.
