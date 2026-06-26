# Declarative entity-attribute references

Date: 2026-06-22
Packages: `@codaco/protocol-validation` (source of truth + extractor + validator),
`apps/architect-web` (consumer migration)

## Problem

Many fields in a protocol hold the **id of a codebook variable** — a reference
to an attribute of some entity (node, edge or ego). Examples: a prompt's
`variable`, a layout's `layoutVariable`, a sort `property`, a validation rule's
`greaterThanOrEqualToVariable`.

Today, "where can a variable be referenced?" is **hand-maintained in several
disconnected places**, each a flat list of locations that drifts from the
others:

1. `apps/architect-web/src/selectors/indexes.ts` — `paths.variables`, a list of
   ~30 path strings, drives codebook "in use" / "unused" detection.
2. `apps/architect-web/src/components/Codebook/helpers.ts` — a regex that turns
   a usage path back into a "Used as validation for X" label.
3. `packages/protocol-validation/.../schema.ts` `superRefine` — 8 hand-placed
   `variableExists(...)` calls that check a referenced variable exists on a
   subject, each re-deriving the subject inline.

These have already drifted in production. PR #686 fixed a case where
`paths.variables` omitted four comparison-validation rules: a variable
referenced only by `greaterThanOrEqualToVariable` was flagged "unused", and
deleting it (which the UI invited) broke the cross-reference the schema
enforces, invalidating the protocol. That PR also consolidated the validation
_key list_ into a single `VARIABLE_REFERENCE_VALIDATIONS` const — but that only
unifies the six validation key names. The _locations_ (the ~30 paths and the 8
existence checks) remain two independent hand-maintained encodings of the same
fact.

The deeper issue: there is no structural guarantee that adding a new
variable-bearing field updates all three lists. Nothing connects a field that
_holds_ a variable reference to the machinery that _detects usage of_ and
_validates_ that reference.

## Goal

Make the **schema** the single source of truth for entity-attribute references.
A field declares once — at its definition — that it holds a reference to an
attribute, and _how to find the subject that attribute must belong to_. From
that single declaration, derive:

- **Usage detection** (architect: "in use" / "unused" / "where used").
- **Presence validation** (the referenced variable exists on its subject).
- **Type validity** (the referenced variable is of an allowed type, where
  constrained).

Adding a new reference field with the helper must make it impossible to forget
existence/usage handling — it is wired automatically.

## Background: current behaviour

- **Usage index** — `getVariableIndex` runs `collectPaths(paths.variables,
protocol)` producing `{ pathString: variableId }`. `makeGetIsUsed` turns the
  set of referenced ids into an "in use" map; `getUsageAsStageMeta` maps each
  usage path to a display location (stage link, or "Used as validation for X"
  via `codebookVariableReferenceRegex`).
- **Existence validation** — `superRefine` checks existence at 8 sites (form
  fields, `prompt.variable`, `otherVariable`, `edgeVariable`, `layoutVariable`,
  `additionalAttributes[]`, and the validation cross-refs), each computing the
  subject inline. `edgeVariable` additionally requires the variable be
  `ordinal`.
- **Filter / skip-logic rule attributes** (`filter.rules[].options.attribute`,
  panels, skipLogic) are referenced too, but their subject is the _rule's own_
  entity/type and they already have dedicated validation
  (`filterRuleAttributeExists` + operator/value-type checks). They are listed in
  `paths.variables` for usage detection but are **not** part of the 8
  `variableExists` checks.

## Design

### 1. The tag: `entityAttributeReference(descriptor)`

A single helper in `@codaco/protocol-validation` that brands the field type and
attaches a runtime descriptor as Zod metadata:

```ts
export const ENTITY_ATTRIBUTE_REFERENCE = 'entityAttributeReference' as const;

type SubjectResolution =
  | 'stageSubject' // enclosing stage's subject (ego when stage is EgoForm)
  | 'ego' // always { entity: 'ego' }
  | 'owningVariable' // the codebook entity/type the owning variable lives under
  | 'filterRule' // usage-only; existence-checked by the dedicated filter-rule validation
  | { sibling: string; entity: 'node' | 'edge' }; // type read from a sibling field

type EntityAttributeReferenceMeta = {
  [ENTITY_ATTRIBUTE_REFERENCE]: {
    subject: SubjectResolution;
    requireType?: readonly VariableType[]; // allow-list; omitted = any type
  };
};

export const entityAttributeReference = (
  descriptor: EntityAttributeReferenceMeta[typeof ENTITY_ATTRIBUTE_REFERENCE],
) =>
  z
    .string()
    .brand<'EntityAttributeReference'>()
    .meta({ [ENTITY_ATTRIBUTE_REFERENCE]: descriptor });

export type EntityAttributeReference = z.infer<
  ReturnType<typeof entityAttributeReference>
>;
```

Why brand **and** meta (verified against the installed Zod 4):

- `.brand<...>()` is purely **type-level** — the runtime `_zod.def` is identical
  to an unbranded string, so a runtime walk cannot detect it. The brand exists
  only to give the inferred type a distinct identity (`prompt.variable:
EntityAttributeReference` instead of `string`), which documents intent and
  lets the compiler catch a plain-string assignment.
- `.meta({...})` is the **runtime** marker the extractor walks. It round-trips
  reliably, including when wrapped by `.optional()` (the meta lives on the inner
  string — the walker unwraps), arrays, and records.

Sites apply wrappers as needed:

```ts
variable: entityAttributeReference({ subject: 'stageSubject' }).optional();
highlight: z.array(entityAttributeReference({ subject: 'stageSubject' }));
edgeVariable: entityAttributeReference({
  subject: { sibling: 'createEdge', entity: 'edge' },
  requireType: ['ordinal'],
});

// Mock generation wraps the produced value so it satisfies the brand:
field: entityAttributeReference({ subject: 'stageSubject' }).generateMock(() =>
  asEntityAttributeReference(getNodeVariableId()),
);
```

### 2. Subject resolution

The four subject-resolving strategies, derived from the 8 existing checks (a
fifth, `filterRule`, is usage-only — it resolves to no subject because those
references are existence-checked by the dedicated filter-rule validation):

| Strategy              | Resolves to                                                                                    | Fields                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `stageSubject`        | enclosing stage's `subject` (or ego for `EgoForm`)                                             | most prompt/stage references                                                           |
| `ego`                 | `{ entity: 'ego' }`                                                                            | EgoForm fields, FamilyPedigree `egoVariable`                                           |
| `owningVariable`      | entity/type derived from the `codebook.{entity}.{type}` path segment (positions codebook+1/+2) | validation cross-refs (`sameAs`, comparisons, …)                                       |
| `{ sibling, entity }` | `{ entity, type: <value of sibling field> }`                                                   | `edgeVariable`→`createEdge`; FamilyPedigree config refs→`nodeConfig`/`edgeConfig.type` |

The extractor's walker threads **ambient context** as it descends (current
stage subject; current owning-variable entity/type), so `stageSubject` and
`owningVariable` resolve without per-field wiring — the descriptor only names
which ambient/structural source to use. `{ sibling, entity }` reads a named
sibling field from the same object.

### 3. The extractor: `collectEntityAttributeReferences(protocol)`

A pure function in `@codaco/protocol-validation` that traverses the v8 schema's
`_zod.def` tree alongside the protocol instance and returns one record per
reference:

```ts
type EntityAttributeReferenceHit = {
  path: (string | number)[];        // concrete instance path (for issue paths & links)
  variableId: string;               // the referenced id (instance value)
  subject: StageSubject | undefined; // resolved subject; undefined when unresolvable
  requireType?: readonly VariableType[];
};

export const collectEntityAttributeReferences = (
  protocol: Protocol,
): EntityAttributeReferenceHit[];
```

Traversal reuses the established pattern from
`utils/zod-mock-extension.ts` (`generateMockData`), which already walks every
relevant node kind (object, array, record, union, optional, default, nullable).
The extractor adds three things to that pattern:

1. Walk the **instance in parallel** with the schema, collecting concrete values
   and paths rather than generating data.
2. **Resolve discriminated unions by the instance discriminator** (e.g. stage
   `type`) instead of choosing a branch arbitrarily.
3. At each node, read `.meta()[ENTITY_ATTRIBUTE_REFERENCE]`; on a hit with a
   string instance value, resolve the subject from ambient/sibling context and
   emit a record.

Living in `protocol-validation` keeps the dependency direction correct
(architect already depends on it; no cycle).

### 4. The validator: `validateEntityAttributeReferences(protocol)`

Iterates the extractor's records and, for each:

1. **Presence** — if `subject` resolves and the variable is absent from that
   subject's codebook variables, emit the existing-style "does not exist" issue
   at `path`.
2. **Type validity** — if `requireType` is set and the variable's codebook
   `type` is not in the allow-list, emit a type issue at `path`.

`superRefine` calls this once and drops the 8 hand-placed `variableExists`
blocks plus the `edgeVariable`-must-be-ordinal check. The `variableExists` /
`getVariablesForSubject` helpers remain (the validator uses them).

**Escape hatch:** checks that are not "exists on subject, of allowed type" stay
as bespoke `superRefine` logic — specifically the filter/skip-logic rule
attributes (rule-scoped subject + operator/value-type validation, already
handled by `filterRuleAttributeExists`) and the layout string-vs-object guard.
Those fields are still tagged for _usage detection_ but are excluded from the
declarative _validator_ (their descriptor omits a resolvable subject, or the
validator skips the `filterRule` case). This is called out per-field in the
inventory.

### 5. Consumer migration

**`@codaco/protocol-validation`**

- Add the helper module and the extractor/validator.
- Migrate the ~30 fields from `z.string()` to `entityAttributeReference(...)`.
- `superRefine`: replace the 8 existence checks + validation-key loop with
  `validateEntityAttributeReferences`.

**`apps/architect-web`**

- Replace `getVariableIndex` (the variable portion of `paths.variables`) with a
  selector wrapping `collectEntityAttributeReferences`, producing the
  `{ pathString: variableId }` shape `makeGetIsUsed` already consumes.
- `getUsageAsStageMeta` consumes the records' resolved context directly →
  **delete** `codebookVariableReferenceRegex` and the path-string reverse
  parsing. Stage links come from the record path; "Used as validation for X"
  comes from the `owningVariable` subject context.
- `paths.edges`, `paths.nodes`, `paths.assets` are unchanged (separate concern,
  out of scope).
- `VARIABLE_REFERENCE_VALIDATIONS` (PR #686): the validation fields are now
  tagged individually, so it is no longer needed for path/regex generation. It
  may be retained **only** if `options.ts`'s per-variable-type validation _menu_
  (`isValidationWithListValue`) still needs it; the plan will confirm and remove
  it otherwise.

### 6. Field inventory

References to tag, grouped by subject strategy. (Authoritative source: the
current `paths.variables`; the plan enumerates exact schema files.)

**`subject: 'stageSubject'`** — `quickAdd`, `form.fields[].variable` (ego when
EgoForm), `cardOptions.additionalProperties[].variable`, `prompts[].variable`,
`otherVariable`, `additionalAttributes[].variable`, `highlight.variable`,
`layout.layoutVariable`, `presets[].layoutVariable`/`groupVariable`/
`highlight[]`, `bucketSortOrder[].property`, `binSortOrder[].property`,
top-level `presets[].layoutVariable`/`groupVariable`/`highlight[]`,
`searchOptions.matchProperties[]`.

**`subject: { sibling: 'createEdge', entity: 'edge' }`** — `prompts[].edgeVariable`
(`requireType: ['ordinal']`).

**FamilyPedigree config** — `nodeConfig.egoVariable` (`ego`);
`nodeConfig.nodeLabelVariable`/`biologicalSexVariable`/`relationshipVariable`,
`nodeConfig.form[].variable` (node, via `nodeConfig.type`);
`edgeConfig.relationshipTypeVariable`/`isActiveVariable`/
`isGestationalCarrierVariable` (edge, via `edgeConfig.type`);
`nominationPrompts[].variable`.

**`subject: 'owningVariable'`** — `codebook.{ego,node,edge}.variables[].validation.{sameAs,
differentFrom, greaterThanVariable, lessThanVariable,
greaterThanOrEqualToVariable, lessThanOrEqualToVariable}`. `requireType` for the
four comparison rules = numeric/datetime/scalar types; `sameAs`/`differentFrom`
= any.

**Tagged for usage only, validator-excluded (escape hatch)** —
`filter.rules[].options.attribute`, `skipLogic.filter.rules[].options.attribute`,
`panels.filter.rules[].options.attribute` (rule-scoped subject + existing
dedicated validation).

**Newly validated as a side effect** — sort properties, `highlight`, presets,
and FamilyPedigree config references are in `paths.variables` (usage) but are
**not** among today's 8 existence checks. Once tagged with a resolvable subject
they gain presence validation. This is desirable (catches genuinely broken
references) but may surface issues in existing hand-authored protocols — see
Risks.

### 7. Module layout

- `packages/protocol-validation/src/schemas/8/entity-attribute-reference.ts` —
  helper, meta key, brand type, descriptor types.
- `packages/protocol-validation/src/utils/collectEntityAttributeReferences.ts` —
  extractor + `validateEntityAttributeReferences`.
- Public surface: exported through the existing `schemas` barrel chain so
  architect imports from `@codaco/protocol-validation`.

### 8. Testing

- **Extractor unit tests** over a fixture protocol exercising every category:
  stage refs, array refs, record/codebook refs, validation refs × ego/node/edge,
  FamilyPedigree config, `edgeVariable` via sibling. Assert the full record set
  (paths, ids, resolved subjects, requireType).
- **Completeness guard**: a test that walks the schema, counts meta-tagged
  fields, and asserts the fixture covers each — so a newly tagged field without
  fixture coverage fails CI rather than silently going untested.
- **Validator tests**: presence failures and type-validity failures, preserving
  (or deliberately updating) the messages/paths asserted by the existing 69
  `schema8-superrefine-validation` tests.
- **Architect**: existing `indexes`, `isUsed`, and `helpers` suites adapted; the
  unused-flag and where-used behaviours re-verified end to end.

### 9. Risks & considerations

- **Brand migration churn.** Changing ~30 field output types to branded strings
  can surface type errors wherever architect/interview code assigns or compares
  a plain string to these fields. This is the desired safety, but it is a real
  audit + migration cost across consumers and must be budgeted. (`z.input` still
  accepts plain strings at parse time; only typed code sees the brand.)
- **Behaviour change from newly-validated references.** Tagging fields not
  currently existence-checked extends validation to them; existing protocols
  with latent broken references will newly fail validation. Acceptable and
  arguably a fix, but the migration should surface which categories become
  newly-strict.
- **Error-message parity.** The 69 superrefine tests assert specific
  messages/paths. The generic validator must reproduce them or update tests
  deliberately.
- **Discriminated-union resolution** in the walker (resolve branch by the
  instance discriminator) is the main new traversal complexity.
- **`siblingField` resolver** is the only non-trivial subject strategy
  (`edgeVariable` + the FamilyPedigree config refs).
- **v8-only.** The extractor targets `CurrentProtocolSchema` (v8); v7 is not
  tagged. Architect edits v8 only, so this matches current usage.
- **Validation hot-path cost.** One extra traversal per validation; protocols
  are small, so negligible.

## Out of scope

- Edge-type, node-type, and asset references (`paths.edges`/`nodes`/`assets`)
  — a parallel mechanism could reuse the same pattern later, but is not part of
  this work.
- Migrating filter/skip-logic rule-attribute _validation_ into the declarative
  validator (they keep their richer dedicated checks; they are still tagged for
  usage).
- A full codebase rename of "variable" → "entity attribute"; only the new
  symbols use the `EntityAttributeReference` name.

## Resolved decisions

- **Name:** `EntityAttributeReference` / `entityAttributeReference()` /
  `collectEntityAttributeReferences()` (new concept only; no broad rename).
- **Scope:** full single source of truth — tag all attribute-reference fields,
  build the extractor, migrate architect usage detection **and** the schema's
  existence checks.
- **Mechanism:** Zod brand (type identity) + inline `.meta()` descriptor
  (runtime), not a separate registry.
- **Validity:** presence **and** type constraints (`requireType`).
