# Schema 8 Corrections and Version-Compatibility Plan

**Status:** Approved direction (2026-08-25). Supersedes the "Protocol Schema 9
Creation and Migration Plan" draft: review against the released baseline
concluded that creating schema 9 now is not required.

**Doctrine:** The post-release schema tightenings correct flaws in schema 8;
they are not contract changes. They remain in schema 8 and produce validation
errors. Alongside them, we build the version-compatibility plumbing so that a
future schema version bump lands without app-side gaps.

## 1. Release Baseline (ground truth)

- The Version Packages merge `523d05cd3` (2026-08-07) shipped
  protocol-validation 12.1.1, Architect 8.1.0, and Fresco 4.1.1 from one tree.
  Interviewer 8.1.3 (2026-08-13 hotfix) contains no protocol-validation
  changes.
- protocol-validation has no consumers outside Architect, Interviewer, and
  Fresco. The classic apps read schema 7 and below.
- Released schema 8 already constrained node and edge colors to positions 1–8
  and ordinal colors to 1–10. Narrative Pedigree disease color and Geospatial
  color accepted arbitrary strings — an oversight, not a design decision.
- Released Architect authored geospatial colors through a constrained,
  required picker (`ord-color-seq` 1–8). Its disease picker wrote constrained
  tokens but offered positions 9 and 10 against an 8-color palette, and the
  released CEGRM template carried one such value. Both app defects are already
  fixed on main.
- Architect Classic's node palette has 10 positions, so v7 protocols can
  legitimately contain `node-color-seq-9` and `-10`. Its edge and ordinal
  palettes (8 each) fit schema 8. The v1–v7 protocol corpus contains only
  in-range values, and no `primary-color-seq` value appears in any protocol —
  that name is CSS theming only.

## 2. Schema 8 Corrections (protocol-validation)

All post-release tightenings remain in schema 8 as validation errors:

1. Form fields cannot write the same variable twice (all form types).
2. Narrative Pedigree disease uniqueness: exact variable mappings and
   normalized, case-insensitive labels.
3. Family Pedigree structural-variable exclusivity.
4. Interface-owned variables must carry the canonical option sets.
5. Panel `dataSource` values must be nonempty.
6. Disease colors are `NodeColorReference`; geospatial colors are
   `ColorReference`. Raw or empty strings are errors.
7. Disease colors `node-color-seq-9` and `-10` are validation errors — no
   wrap, no repair (Decision A, 2026-08-25). Affected content is
   CEGRM-template instantiations and swatches 9/10 clicked in released
   Architect; the remedy is re-picking a color in the editor.

Changes to the v7→v8 migration:

- **Add** a wrap for out-of-range codebook node colors, because Classic can
  author them: `node-color-seq-9` → `-1`, `node-color-seq-10` → `-2`. Record
  the wrap in the migration notes shown at import.
- **Remove** the duplicate-form-field deduplication (added post-release).
  Duplicates fail post-migration validation with a clear error.
- **Drop** the `primary-color-seq` mappings entirely — no evidence in any
  corpus.

Move the interface-owned definitions out of `@codaco/shared-consts` into
`src/schemas/8/`: `BIOLOGICAL_SEX_OPTIONS`, `GAMETE_ROLE_OPTIONS`,
`RELATIONSHIP_TYPE_OPTIONS`, `FRAMING_IDS`, `INHERITANCE_PATTERNS`. They
export through the package root; the interview runtime updates its imports.
Convention: these files are copied into the new directory when a future schema
version is created. Genuine utility functions (`validation-helpers`,
`collectEntityAttributeReferences`, `normalizeForComparison`, and the rest)
stay outside the schema directory as shared, cross-version code.

## 3. Migration-Rule Invariants

Two requirements bind every migration rule, present and future:

1. A migration never adds, removes, or reorders stages.
2. A migration never changes the shape of collected answer values.

These are what make Fresco's deploy-time migration safe underneath
in-progress interviews (resume positions are stage indices) and let
Interviewer repoint sessions without rewriting interview data. A future rule
that must break either one forces the Fresco and Interviewer handling to be
redesigned in the same change. Record both in the migration module's
documentation.

## 4. Version-Compatibility Plumbing

An app's schema compatibility is defined by the interview package it embeds
(Fresco, Interviewer) or the protocol-validation contract it implements
(Architect).

- `@codaco/interview` exports a compatible-schema-version constant, derived
  from protocol-validation's `CURRENT_SCHEMA_VERSION`.
- **Fresco** derives from that constant: the supported-versions list in
  `fresco.config.ts`, the interview payload's `schemaVersion` (read from the
  validated document, never a literal), and the deploy-time migration
  script's target version — currently hard-coded in five places under a
  version-specific filename. The script's "schema 8 was never released"
  premise comment is removed.
- **Interviewer** derives its app schema version from the constant and gains
  a launch-time migration: any stored protocol below the compatible version
  is migrated, its hash recomputed, and its sessions repointed to the new
  hash, all in a single transaction, with a toast notifying the user. This is
  a no-op today; it ships built and tested against synthetic lower-version
  rows, closing the orphaned-sessions gap.
- **Architect** keeps its own app schema version constant, typed against
  protocol-validation, with every protocol-type derivation flowing through
  it. Opening a library protocol whose stored version is below current
  migrates it in place with a toast (Decision B). Import-time migration keeps
  its existing approval dialog.
- `SyntheticInterview` in protocol-utilities derives its `schemaVersion` from
  `CURRENT_SCHEMA_VERSION`.

Deferred, with the trigger for revisiting stated:

- Validation provenance on Architect's stored rows — re-validating
  `validated: true` rows when the validating package version changes
  (Decision C). Until then, stored rows that violate the corrected rules are
  admitted and surface errors when the user edits. Accepted.
- Interactive migration machinery (plan/apply API, wizard, Fresco quarantine
  handling) — until a migration rule actually requires a human decision. No
  current rule does.
- Per-target post-validation in `migrateProtocol` (it validates against the
  current schema regardless of `targetVersion`). Harmless while migrations
  only target the current version; must be fixed when a new schema version is
  created. Leave a comment at the site.

## 5. Release Communication

- Extend the pending protocol-validation major changeset and the app
  changesets to enumerate what previously-accepted content now reports
  validation errors: drifted interface-owned option sets, duplicate form
  fields, empty panel data sources, disease colors `node-color-seq-9`/`-10`
  (including protocols created from the released CEGRM template), and raw
  disease or geospatial color strings in hand-authored protocols.
- State the remedy: fix the protocol in Architect's editor. State the limit
  plainly: an exported `.netcanvas` file that violates the corrected rules
  cannot be imported, because import validates before storing — the fix path
  applies to protocols already in a library.
- Fresco: stored rows violating corrected rules keep running (read-time
  parsing is structural); new uploads of violating protocols are rejected
  with clear errors. Accepted.

## 6. Verification and Delivery

- Schema tests: for each correction, a fixture accepted by released 12.1.1
  and rejected now, asserting a precise, actionable error message.
- v7→v8 tests: the node-color wrap (9 → 1, 10 → 2) from a v7 fixture; a
  duplicate-form-field v7 fixture failing validation with a clear error; a
  full migration run over the v1–v7 corpus in
  `packages/protocols/documentation/protocols/`.
- Interviewer: a transaction test — stored lower-version protocol migrates,
  hash recomputed, sessions repointed, toast fired; failure rolls back both
  protocol and sessions.
- Architect: library-open migrates in place with a toast; the import approval
  dialog is unchanged.
- Fresco: the generalized script targets the constant; its tests derive the
  expected version from it.
- Constants: no literal schema version remains in app version logic; every
  reference resolves to the interview package constant or Architect's typed
  constant.
- Every bundled protocol and template validates (already conformant on main).
- Standard gates: typecheck, lint, knip, unit suites, the interface matrix,
  and affected E2E suites. Inspect any changed visual baselines before
  adoption.

Delivery: one corrective PR before the release train proceeds. Update the
existing pending changesets rather than adding new ones. Commit this document
as `docs/superpowers/specs/2026-08-25-schema-8-corrections-design.md` in the
same PR.
