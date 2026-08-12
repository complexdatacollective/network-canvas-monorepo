# Non-Null Variable Values Implementation Plan

## Overview

The persisted entity-attribute contract uses `null` as an unanswered value
while Fresco UI forms use `undefined`. Some form adapters can consequently put
own `undefined` properties into an `NcNetwork`, even though the network schema
does not accept them. This plan establishes one contract: `VariableValue` is
always defined, entity attribute records are sparse, and an absent key means
unset.

The implementation introduces a compatibility codec that accepts legacy
nullish attribute values but emits canonical sparse networks. Transitional
canonical types keep the source-first workspace coherent while Interview
writers, persistence boundaries, and exporters adopt the contract. The public
aliases narrow only after those migrations. This plan excludes
prototype-pollution remediation in the form path system.

## Planning Context

### Decision Log

| Decision                                                     | Reasoning Chain                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Use sparse attribute records                                 | The form contract uses `undefined` for unanswered fields -> storing `undefined` is unstable across structured clone and JSON -> absence is the only serialization-stable representation -> an absent key is the canonical unset state.                                                                                                           |
| Add explicit set/unset patches                               | A partial record cannot distinguish preserving a value from clearing it because both operations can omit the key -> clearing must be represented independently -> mutations carry defined `set` values and explicit `unset` keys.                                                                                                                |
| Reject overlapping patch keys                                | A key cannot be both defined and absent in canonical state -> precedence between `set` and `unset` would make malformed patches order-dependent -> patch validation rejects overlap instead of choosing a winner.                                                                                                                                |
| Accept legacy nullish input but emit strict output           | Persisted Interview and Fresco sessions can contain null attributes -> rejecting null at parsing boundaries would make those sessions unreadable -> the shared schema accepts nullish input and emits canonical sparse output without a destructive backfill.                                                                                    |
| Limit form unsets to mounted fields                          | A form submission describes only the fields mounted for that interaction -> treating every omitted codebook variable as unset would erase answers owned by other stages -> only mounted unanswered fields become `unset` entries during edits.                                                                                                   |
| Make Composer history presence-sensitive                     | Key presence is part of the sparse network state -> restoring only prior values cannot restore a previously absent key -> inverse patches record both values to set and keys to unset.                                                                                                                                                           |
| Derive declared export schema from the codebook              | Sparse storage omits fully unanswered keys -> discovering schema only from entity data would drop declared variables from CSV and GraphML -> codebook declarations define known columns and keys while defined external attributes remain data-driven.                                                                                           |
| Delete secure metadata with an attribute                     | Secure metadata describes the ciphertext stored at the same attribute key -> unsetting the attribute makes that metadata stale -> one patch applicator removes both entries atomically.                                                                                                                                                          |
| Preserve all defined empty values                            | `false`, `0`, `''`, and `[]` are valid variable values -> truthiness-based normalization would destroy responses -> normalization removes only `null` and `undefined`.                                                                                                                                                                           |
| Apply the sparse rule to Family Pedigree edge metadata       | Family Pedigree metadata copies edge attribute records outside `NcNetwork` -> allowing null in that parallel record would preserve a second serialized unset representation -> its edge attributes use the same sparse defined-value contract.                                                                                                   |
| Stage public narrowing behind transitional canonical symbols | Workspace consumers compile shared package source directly -> narrowing `VariableValue` and `NcNetwork` before their writers migrate would break intermediate typechecks -> temporary defined-value and canonical-network symbols let each consumer migrate coherently -> the public aliases swap only after every writer and boundary conforms. |
| Keep the prototype-pollution fix separate                    | Prototype-pollution remediation changes field-name and path semantics -> coupling it to entity-value normalization would combine independent review and rollback boundaries -> this plan changes only entity-value representation.                                                                                                               |
| Document the contract in owner-package READMEs               | Input compatibility, mutation semantics, and export shape span separate packages -> no single implementation file exposes the complete contract -> the owner READMEs record the cross-package invariants and tradeoffs.                                                                                                                          |

### Rejected Alternatives

| Alternative                               | Why Rejected                                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Use strict-only parsing at every boundary | Persisted Interview and Fresco records contain null, so strict-only parsing would make sync, hydration, and export fail for readable sessions. |
| Keep null in persisted attributes         | This preserves conflicting form and network sentinels and cannot provide one serialization-stable unset representation.                        |
| Store own properties with `undefined`     | Plain IndexedDB structured clone can preserve them while JSON sync and encryption omit them, creating persistence-dependent state.             |
| Use a custom unset sentinel value         | A second persisted domain value would complicate validation, filtering, and export without improving on property absence.                      |
| Backfill every database before deployment | Read-time compatibility is sufficient to preserve behavior and avoids coordinating offline Interviewer stores with server data.                |

### Constraints & Assumptions

- TypeScript remains strict: no `any`, ignore rules, or assertions used to bypass
  incompatible form and network types.
- Shared package source is consumed directly; every milestone must keep affected
  package typechecks and tests coherent.
- Legacy input includes JSON `null` and may include own `undefined` properties
  from plaintext Interviewer storage.
- No valid defined value is removed during normalization.
- Scope requires silent normalization of legacy unanswered values and the
  sparse non-null target contract.
- Package responsibilities remain authoritative: schema in shared-consts,
  interview mutations in Interview, synthetic data in protocol-utilities, and
  serialization shape in network-exporters.

### Known Risks

| Risk                                                | Mitigation                                                                                                        | Anchor                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Fresco rejects null-bearing rows                    | Use a nullable-input/strict-output codec at every parsing boundary.                                               | `apps/fresco/app/(interview)/interview/[interviewId]/sync/route.ts:L21-L29` uses `NcNetworkSchema` for request parsing.              |
| An unplaced Sociogram node disappears               | Classify a missing layout key as unplaced.                                                                        | `packages/interview/src/selectors/canvas.ts:L93-L99` requires both `has(...)` and `isNil(...)`.                                      |
| Fully unanswered variables disappear from exports   | Build declared columns and GraphML keys from the codebook.                                                        | `packages/network-exporters/src/formatters/csv/attributeList.ts:L20-L31` gathers keys from entity attributes.                        |
| Attribute clearing leaves stale encryption metadata | The shared patch applicator removes the attribute and matching secure metadata together.                          | `packages/interview/src/store/modules/session.ts:L780-L787` shallow-merges both maps.                                                |
| Composer undo cannot restore absence                | Capture set and unset operations in undo records instead of only prior present entries.                           | `packages/interview/src/interfaces/NetworkComposer/useComposerActions.ts:L341-L365` captures only entries found in the prior record. |
| Synthetic networks retain null                      | Generators represent unfinished state by omitting the attribute so their output conforms to the canonical schema. | `packages/protocol-utilities/src/generateNetwork/inProgress.ts:L55-L90` writes null as unfinished state.                             |

## Invisible Knowledge

### Architecture

```text
Form field (`undefined`) or direct interface interaction
                         |
                         v
             Interview attribute adapter
                         |
                 { set, unset }
                         |
                         v
             Shared patch applicator
                         |
                         v
               Sparse `NcNetwork`
                 /             \
                v               v
       Host persistence       Exporters

Legacy persisted network
          |
          v
Compatibility schema: accept nullish entries, omit them from output
          |
          v
Canonical sparse `NcNetwork`
```

### Data Flow

```text
Form submit: FieldValue -> type coercion -> set/unset patch -> sparse attributes
Direct clear: interaction -> unset key -> sparse attributes
Legacy read: unknown JSON/structured clone -> Zod compatibility parse -> sparse network
Export: codebook declarations + sparse values -> stable CSV/GraphML schema and cells
```

### Why This Structure

The form and network layers have different responsibilities. The form owns
transient unanswered state; the network owns serializable domain values. The
Interview adapter is therefore the correct translation boundary. A central
patch applicator prevents every interface from reimplementing deletion and
secure-metadata cleanup.

### Invariants

- An own entity attribute property always contains a defined `VariableValue`.
- An absent attribute key is the only canonical unset representation.
- Patch `set` and `unset` keys do not overlap.
- Normalization preserves `false`, `0`, empty strings, and empty arrays.
- Removing an encrypted attribute also removes its secure metadata.
- Parsing legacy input always produces canonical output.

### Tradeoffs

Read-time normalization avoids a coordinated migration across offline and
server hosts, at the cost of leaving persisted bytes non-canonical until a
subsequent write. Deriving export schemas from the codebook adds exporter
logic, but makes output structure independent of incidental response sparsity.

## Milestones

### Milestone 1: Transitional canonical network contract

**Files**:

- `packages/shared-consts/src/network.ts`
- `packages/shared-consts/src/__tests__/network.test.ts` (new)

**Flags**: needs TW rationale, needs conformance check

**Requirements**:

- Export `DefinedVariableValueSchema` and `DefinedVariableValue` for values that
  reject `null` and `undefined`.
- Export `CanonicalNcNetworkSchema`, `CanonicalNcEntity`, `CanonicalNcNode`,
  `CanonicalNcEdge`, `CanonicalNcEgo`, and `CanonicalNcNetwork` alongside the
  nullable `VariableValue`, `NcNetwork`, and `NcNetworkSchema` public contract.
- Make `CanonicalNcNetworkSchema` accept nullish legacy ego, node, and edge
  attribute entries but omit them from its output.
- Keep the existing public aliases unchanged so unmigrated workspace consumers
  remain type-correct through Milestones 2–7.
- Preserve external unknown attribute keys when their values are defined.

**Acceptance Criteria**:

- At least six schema scenarios cover null, own undefined, false, zero, empty
  string, empty array, and mixed records.
- `CanonicalNcNetworkSchema.parse()` accepts null-bearing input and returns no
  nullish attribute entries.
- Canonical entity/network output types cannot assign null or own undefined
  attribute values.
- `VariableValue`, `NcNetwork`, and `NcNetworkSchema` retain their pre-migration
  behavior until Milestone 8.

### Milestone 2: Explicit attribute patch semantics

**Files**:

- `packages/interview/src/store/entityAttributePatch.ts` (new)
- `packages/interview/src/store/entityAttributePatch.test.ts` (new)
- `packages/interview/src/store/modules/session.ts`
- `packages/interview/src/store/modules/__tests__/session.test.ts`

**Flags**: needs TW rationale, needs conformance check

**Requirements**:

- Define a typed patch carrying defined values to set and attribute keys to
  unset, using the transitional defined-value and canonical entity types.
- Validate both sets of keys against the entity codebook.
- Reject a patch when the same key appears in both `set` and `unset`.
- Apply patches without mutating inputs and remove matching secure metadata.
- Stop populating new node and edge records with null defaults.
- Express prompt-removal clearing through unset keys.

**API and Control Flow**:

```ts
export type AttributePatch = Readonly<{
  set: Readonly<Record<string, DefinedVariableValue>>;
  unset: readonly string[];
}>;

export type AttributePatchValidationResult =
  | { success: true }
  | {
      success: false;
      error: {
        code: 'unknown-keys' | 'overlapping-keys';
        keys: readonly string[];
      };
    };

type SecureAttributeMetadata = NonNullable<
  NcEntity[typeof entitySecureAttributesMeta]
>;

export function validateAttributePatch(
  patch: AttributePatch,
  allowedKeys: ReadonlySet<string>,
): AttributePatchValidationResult;

export function applyEntityAttributePatch(
  attributes: Readonly<Record<string, VariableValue | undefined>>,
  secureAttributes: SecureAttributeMetadata | undefined,
  patch: AttributePatch,
  secureSet?: SecureAttributeMetadata,
): {
  attributes: CanonicalNcEntity[typeof entityAttributesProperty];
  secureAttributes: SecureAttributeMetadata | undefined;
};
```

Validation returns before encryption or reducer mutation when either patch set
contains an unknown key or their intersection is non-empty. The thunk encrypts
only `patch.set` and preserves `patch.unset`. The applicator accepts the
legacy/current SessionState attribute shape, copies only existing entries whose
values are neither `null` nor `undefined`, deletes every unset key from that
canonicalized map and the secure metadata map, merges `set`/`secureSet`, and
returns canonical attributes plus `secureAttributes: undefined` when the
metadata map is empty. Reducers can therefore pass legacy-typed state directly,
without assertions, and install both returned maps atomically.

**Code Changes**:

- Replace node, edge, and ego update attribute payloads with `AttributePatch`;
  creation supplies only defined initial values in `set`.
- Route codebook and overlap checks through `validateAttributePatch`, preserving
  rejected-action behavior for invalid updates.
- Replace reducer shallow merges and prompt-removal null writes with
  `applyEntityAttributePatch`.
- Test immutability, nullish existing-input canonicalization, unknown and
  overlapping keys, set/unset, secure-metadata insertion/deletion, and empty
  metadata collapse.

**Acceptance Criteria**:

- Node, edge, and ego tests cover create, set, unset, invalid and overlapping
  keys, remaining prompt ownership, and secure metadata removal.
- New entities contain only supplied defined attributes.
- Applying a patch to existing null and own-undefined entries omits both from
  the returned canonical attributes without an input or output assertion.
- Reducer state never contains an own undefined attribute.

### Milestone 3: Form adapters and Composer undo

**Files**:

- `packages/interview/src/forms/coerceFormValues.ts`
- `packages/interview/src/forms/formValuesToAttributePatch.ts` (new)
- `packages/interview/src/forms/formValuesToAttributePatch.test.ts` (new)
- `packages/interview/src/interfaces/EgoForm/EgoForm.tsx`
- `packages/interview/src/interfaces/NameGenerator/components/NodeForm.tsx`
- `packages/interview/src/interfaces/SlidesForm/SlidesForm.tsx`
- `packages/interview/src/interfaces/NetworkComposer/Inspector.tsx`
- `packages/interview/src/interfaces/NetworkComposer/useComposerActions.ts`

**Flags**: needs TW rationale

**Requirements**:

- Convert form output to an attribute patch without type assertions.
- On create, omit unanswered form fields; on edit, unset mounted unanswered
  fields so prior answers are cleared.
- Make Composer undo and redo restore both defined values and prior absence.
- Use the transitional canonical entity types throughout migrated form and
  Composer paths; do not narrow the public shared-consts aliases in this
  milestone.

**API and Control Flow**:

```ts
export type FormValuesToAttributePatchResult =
  | { success: true; patch: AttributePatch }
  | {
      success: false;
      error: {
        code: 'invalid-variable-value';
        fieldNames: readonly string[];
      };
    };

export function formValuesToAttributePatch(
  values: Readonly<Record<string, FieldValue>>,
  mountedFieldNames: readonly string[],
): FormValuesToAttributePatchResult;
```

Callers run number coercion first. The adapter iterates mounted names only:
`undefined` enters `unset`, while every defined value must pass
`DefinedVariableValueSchema.safeParse()` before entering `set`. It collects
invalid names in mounted-field order and returns one failure with no partial
patch. A failure occurs before any add/update dispatch, Composer `onSave`, undo
record, success analytics, form close, or celebration, so the network is not
mutated. Submit-based forms route the error through the existing form submission
failure/error path; Composer autosave uses the same existing form-store error
path and remains dirty. Reuse existing generic submission-error copy rather
than adding participant-facing text.

**Code Changes**:

- Replace every `FieldValue`-to-network assertion in the listed paths with the
  adapter and an explicit success/error branch.
- Apply the same patch to an empty creation record or an existing edit record;
  this makes creation unsets no-ops and edit unsets clear mounted fields.
- Build Composer inverse patches from key presence: prior values enter inverse
  `set`, while keys absent before the edit enter inverse `unset`.
- Test all defined value variants plus rejection of a TipTap `JSONContent`
  object and an array containing a record; assert the error result, deterministic
  field order, no partial patch, and no mutation dispatch.

**Acceptance Criteria**:

- Tests cover untouched creation, clearing an existing value, clearing a number
  field, JSONContent and record-array rejection, and undo/redo where the prior
  key was absent.
- Invalid form values return `invalid-variable-value`, leave network state
  unchanged, and enter the existing submission failure/error path.
- No form-to-network attribute assertion remains in these paths.

### Milestone 4: Direct interface clearing and sparse selectors

**Files**:

- `packages/interview/src/interfaces/CategoricalBin/CategoricalBin.tsx`
- `packages/interview/src/interfaces/Geospatial/Geospatial.tsx`
- `packages/interview/src/interfaces/Sociogram/Sociogram.tsx`
- `packages/interview/src/selectors/canvas.ts`

**Requirements**:

- Express Categorical Bin mutual exclusion, Geospatial deselection, and
  Sociogram unplacement as explicit unsets.
- Treat a missing Sociogram layout key as unplaced.
- Use the transitional canonical entity types in each migrated writer and
  selector path.

**Acceptance Criteria**:

- Focused tests prove each clear removes the key.
- A node without a layout key appears in the unplaced drawer classification.

### Milestone 5: Synthetic network generation

**Files**:

- `packages/protocol-utilities/src/ValueGenerator.ts`
- `packages/protocol-utilities/src/SyntheticInterview.ts`
- `packages/protocol-utilities/src/generateNetwork/inProgress.ts`
- Existing adjacent tests under `packages/protocol-utilities/src/**/__tests__/`

**Flags**: needs conformance check

**Requirements**:

- Omit undrawable, unanswered, and in-progress attributes rather than returning
  or storing null.
- Produce transitional canonical network/entity values without changing the
  package's public result surface to the final aliases.
- Preserve constraint solving, deterministic seeding, and generated entity
  counts.

**Acceptance Criteria**:

- Protocol utilities unit and corpus tests pass with sparse expectations.
- Generated networks parse to `CanonicalNcNetwork` and contain no nullish
  attribute entries.

### Milestone 6: Stable sparse exports

**Files**:

- `packages/network-exporters/src/input.ts`
- `packages/network-exporters/src/session/processSessions.ts`
- `packages/network-exporters/src/session/__tests__/processSessions.test.ts`
- `packages/network-exporters/src/formatters/csv/attributeList.ts`
- `packages/network-exporters/src/formatters/csv/edgeList.ts`
- `packages/network-exporters/src/formatters/csv/egoList.ts`
- `packages/network-exporters/src/formatters/graphml/generateKeyElements.ts`
- `packages/network-exporters/src/formatters/graphml/processAttributes.ts`
- Existing adjacent CSV and GraphML tests

**Flags**: needs TW rationale

**Requirements**:

- Include codebook-declared variables in export schemas even when no entity has
  the attribute key.
- Include defined unknown external attributes discovered in entity data.
- Emit empty cells/no data element for absent values without null checks.
- Type formatter internals against the transitional canonical network contract.
- Keep public `InterviewExportInput.network` compatible with `NcNetwork` until
  the Milestone 8 public alias swap.

**API and Control Flow**:

```ts
type GraphMLEntityKind = 'ego' | 'node' | 'edge';

type GraphMLEntitiesByKind = {
  ego: readonly CanonicalNcEgo[];
  node: readonly CanonicalNodeWithResequencedID[];
  edge: readonly CanonicalEdgeWithResequencedID[];
};

type GenerateGraphMLKeys = <K extends GraphMLEntityKind>(
  entityKind: K,
  entities: GraphMLEntitiesByKind[K],
) => Promise<DocumentFragment>;

export default function getKeyElementGenerator(
  codebook: Codebook,
  exportOptions: ExportOptions,
): GenerateGraphMLKeys;
```

`input.ts` defines transitional internal types derived from
`CanonicalNcNode`, `CanonicalNcEdge`, and `CanonicalNcNetwork`:

```ts
export type CanonicalInterviewExportInput = Omit<
  InterviewExportInput,
  'network'
> & { network: CanonicalNcNetwork };
export type CanonicalFormattedSession = CanonicalNcNetwork & {
  sessionVariables: SessionVariables;
};
export type CanonicalNodeWithEgo = CanonicalNcNode & {
  [egoProperty]: string;
};
export type CanonicalEdgeWithEgo = CanonicalNcEdge & {
  [egoProperty]: string;
};
export type CanonicalSessionWithNetworkEgo = Omit<
  CanonicalFormattedSession,
  'nodes' | 'edges'
> & {
  nodes: CanonicalNodeWithEgo[];
  edges: CanonicalEdgeWithEgo[];
};
export type CanonicalNodeWithResequencedID = CanonicalNodeWithEgo & {
  [nodeExportIDProperty]: number;
};
export type CanonicalEdgeWithResequencedID = CanonicalEdgeWithEgo & {
  [ncSourceUUID]: string;
  [ncTargetUUID]: string;
  [edgeExportIDProperty]: number;
};
export type CanonicalSessionWithResequencedIDs = Omit<
  CanonicalFormattedSession,
  'nodes' | 'edges'
> & {
  nodes: CanonicalNodeWithResequencedID[];
  edges: CanonicalEdgeWithResequencedID[];
};
```

`createGraphML` calls the generator with explicit `ego`, `node`, and `edge`
kinds; kind is never inferred from the first entity. Key generation first
enumerates ego variables or every node/edge definition for that kind, including
definitions with no entity instance, then scans actual entities for defined
external attributes. Data elements remain driven only by present values.

Within `processSessions`'s `perSession('format', ...)` callback, the first
formatting operation parses `session.network` with
`CanonicalNcNetworkSchema`. It constructs a `CanonicalInterviewExportInput`
for `formatExportableSession`; insert-ego, resequencing, grouping, and all
formatter inputs then use the canonical derived types. A parse failure for an
invalid defined value remains isolated by `perSession` as the existing
session-processing export failure. Legacy null succeeds and is removed before
any formatter executes.

**Code Changes**:

- Remove entity-kind inference and pass the explicit kind through GraphML key
  helpers; emit node UUID/type and edge source/target keys even for empty arrays.
- Parse each public `InterviewExportInput.network` at the start of the
  per-session format callback and move the downstream export pipeline to the
  transitional canonical derived types in `input.ts`.
- Keep the public repository input type unchanged until Milestone 8; do not
  require Fresco or another repository to pre-normalize for this milestone.
- Generate declared keys from all codebook definitions for the explicit kind,
  deduplicate them, and retain SHA-1 key IDs for discovered external attributes.
- Add GraphML tests for zero nodes, zero edges, an unrepresented declared node
  type, an unrepresented declared edge type, and defined external attributes.
- Add fully unanswered declared-variable cases to the node, edge, and ego CSV
  list tests.

**Acceptance Criteria**:

- CSV retains columns for fully unanswered node, edge, and ego variables.
- A legacy null-bearing `InterviewExportInput` is canonicalized in
  `processSessions` before any CSV or GraphML formatter receives it.
- Invalid defined values retain the existing per-session export-failure result
  instead of failing the whole export run.
- GraphML retains declared keys with zero nodes, zero edges, and unrepresented
  declared node/edge types, but emits no data element for absent values.
- Unknown defined external attributes continue to export.
- Resequenced/entity formatter types derive from canonical network entity types,
  and formatter internals contain no null-value compatibility checks.

### Milestone 7: Persistence-boundary compatibility

**Files**:

- `apps/fresco/app/(interview)/interview/[interviewId]/sync/route.ts`
- `apps/fresco/lib/db/index.ts`
- `apps/fresco/lib/export/InterviewRepository.ts`
- Existing adjacent Fresco tests
- `apps/interviewer/src/lib/db/recordCrypto.ts`
- `apps/interviewer/src/routes/Interview.tsx`
- Existing adjacent Interviewer tests

**Flags**: needs error handling review, needs conformance check

**Requirements**:

- Ensure sync, database reads, exports, plaintext hydration, and encrypted
  hydration parse with `CanonicalNcNetworkSchema` and emit canonical sparse
  networks.
- Preserve readable legacy sessions without an eager database backfill.

**API and Control Flow**:

```text
Interviewer plaintext row.network ─┐
                                   ├─> CanonicalNcNetworkSchema.parse
Interviewer decryptJson<unknown> ──┘                 |
                                                     v
                                           hydrated StoredSession

Fresco sync JSON -> request schema with CanonicalNcNetworkSchema -> Prisma
Fresco DB JSON -> safeParseField(CanonicalNcNetworkSchema, empty fallback)
Fresco export JSON -> CanonicalNcNetworkSchema.parse -> export pipeline
```

`decryptSession` parses both the plaintext network and decrypted `unknown`
before constructing `StoredSession`; `hydrateSession` receives canonical data
without an assertion. Missing plaintext data and locked-vault errors remain
unchanged. Fresco sync substitutes the canonical schema inside the request
schema: legacy null becomes valid and sparse, while every other invalid request
keeps the generic HTTP 400 response. The Prisma result extension keeps its
logged/captured parse failure and empty-network fallback. The export repository
keeps throwing parse failures into its existing export error path.

**Code Changes**:

- Replace `decryptJson<NcNetwork>` trust with `decryptJson<unknown>` followed by
  `CanonicalNcNetworkSchema.parse`, and parse the plaintext branch identically.
- Update `hydrateSession` input typing to reflect the canonical result; do not
  add a second assertion or parser there.
- Use `CanonicalNcNetworkSchema` in the Fresco sync request, Prisma result
  extension and parsed empty fallback, and export repository.
- Add null-bearing plaintext and encrypted fixtures to `recordCrypto.test.ts`,
  hydration coverage to `Interview.test.tsx`, a co-located sync route test,
  fallback coverage to `safeParseField.test.ts`, and throwing invalid-defined-
  value coverage to `InterviewRepository.test.ts`.

**Acceptance Criteria**:

- Legacy null-bearing fixtures sync, hydrate, and export successfully.
- Both Interviewer persistence modes produce identical canonical attributes.
- Invalid defined attribute values still fail validation.
- Invalid Fresco sync still returns HTTP 400, invalid database JSON still
  produces the empty-network fallback, and invalid export JSON still enters the
  existing export error path.

### Milestone 8: Publish the canonical contract

**Files**:

- `packages/shared-consts/src/network.ts`
- `packages/shared-consts/src/stage-metadata.ts`
- `packages/shared-consts/src/__tests__/stage-metadata.test.ts` (new)
- Exact production and test paths recorded in the M8 inventory table by the
  bounded procedure below; no other consumer files are in scope

**Flags**: needs conformance check

**Requirements**:

- Normalize Family Pedigree edge metadata attributes to the same sparse,
  defined-value contract as network edge attributes.
- Redefine the public `VariableValue`, entity, and `NcNetwork` types as the
  defined canonical output types while keeping `NcNetworkSchema` compatible
  with nullish persisted input.
- Replace transitional imports with the final public aliases, then remove the
  transitional `DefinedVariableValue*` and `CanonicalNc*` exports.
- Resolve every remaining consumer against the non-null public aliases without
  bypass assertions.
- Keep UI-only uses of null intact when they model unrelated state.

**Bounded Inventory Procedure**:

Before any M8 source edit, run and record every match from these commands in an
`M8 Inventory Results` table added to this plan (`source`, `file:line/symbol`,
`classification`, `action`):

```sh
rg -n --glob '*.{ts,tsx}' '\b(null|undefined)\b' \
  packages/interview/src/store packages/interview/src/forms \
  packages/interview/src/interfaces packages/protocol-utilities/src \
  apps/interviewer/src/lib/db apps/interviewer/src/routes \
  apps/fresco/app apps/fresco/lib

rg -n --glob '*.{ts,tsx}' \
  '(entityAttributesProperty|attributes|attributeData|newAttributeData|resolvedAttributes|attrs).*\b(null|undefined)\b|\b(null|undefined)\b.*(entityAttributesProperty|attributes|attributeData|newAttributeData|resolvedAttributes|attrs)' \
  packages/interview/src packages/protocol-utilities/src \
  apps/interviewer/src apps/fresco

rg -n --glob '*.{ts,tsx}' \
  '\b(DefinedVariableValueSchema|DefinedVariableValue|CanonicalNcNetworkSchema|CanonicalNcEntity|CanonicalNcNode|CanonicalNcEdge|CanonicalNcEgo|CanonicalNcNetwork)\b' \
  packages apps
```

#### M8 Inventory Results

The pre-swap inventory was captured on 2026-08-12. Search A returned 2,559
matches in 355 files. Its complete non-attribute remainder is grouped in the
first row: those occurrences are control-flow absence, optional UI/form state,
React render sentinels, nullable timestamps/database fields, schema options, or
test/mocking sentinels and do not flow into an entity attribute record. Search
B is the exhaustive attribute-context subset and every one of its matches is
classified below. Search C is the exhaustive transitional-symbol set; consumers
are grouped by exact file/symbol where repeated uses have the same migration.

| Source                            | file:line/symbol                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Classification                               | Action / resolution                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A                                 | Residual matches under `packages/interview/src/store` (thunk/reducer optionals, UI/session state), `packages/interview/src/forms` (transient field values/validation context), `packages/interview/src/interfaces` (React/render state, optional config, form transforms, tests/stories), `packages/protocol-utilities/src` (optional builder/config state and absence reads), `apps/interviewer/src/{lib/db,routes}` (database/session timestamps, crypto key/auth and route state), and `apps/fresco/{app,lib}` (database/auth/dashboard/React/API optionals and mocks); excludes every B/C and writer-audit row below | UI-only or non-writing domain state          | Preserve only after the independent attribute-context and builder-writer audits below. These grouped residuals do not pass a nullish value to an entity attribute mutation; they model form/UI/control-flow absence, nullable session/database fields, configuration, or test comparison/mock state. |
| B                                 | `packages/protocol-utilities/src/SyntheticInterview.ts:1769,1837`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | production writer                            | Preserve defined-value guard; after alias swap this is the canonical sparse write.                                                                                                                                                                                                                   |
| B                                 | `packages/interview/src/store/modules/session.ts:148,241,405` (`attributeData`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | compile-derived/production boundary          | Narrow to the final public `VariableValue` while retaining optional payload/property semantics; never store own undefined.                                                                                                                                                                           |
| B                                 | `packages/interview/src/store/entityAttributePatch.ts:59`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | schema compatibility                         | Keep nullable legacy _input_ only through a locally explicit compatibility input type; output remains public `VariableValue`.                                                                                                                                                                        |
| B                                 | `packages/interview/src/store/modules/__tests__/session.test.ts:154,965`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | legacy-input fixture                         | Preserve the optional-payload test; route the null-bearing legacy reducer fixture through an inference-safe compatibility helper instead of a public `NcNetwork` annotation.                                                                                                                         |
| B                                 | `packages/protocol-utilities/src/__tests__/generateNetwork.test.ts:261,952,980,1013`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | legacy-input fixture / conformance check     | Keep the deliberate legacy null input as unknown/schema input; keep absence assertions.                                                                                                                                                                                                              |
| B                                 | `apps/fresco/lib/export/__tests__/InterviewRepository.test.ts:72,80`; `apps/fresco/lib/db/__tests__/safeParseField.test.ts:88,102`; `apps/fresco/app/(interview)/interview/[interviewId]/sync/__tests__/route.test.ts:40,76`; `apps/interviewer/src/lib/db/__tests__/recordCrypto.test.ts:175,285,293`                                                                                                                                                                                                                                                                                                                   | legacy-input fixture                         | Preserve raw null/own-undefined compatibility inputs without assigning them to the strict public output type.                                                                                                                                                                                        |
| B                                 | `packages/protocol-utilities/src/generateNetwork/{stageHandlers.ts:482,nodes.ts:256}`; `packages/protocol-utilities/src/__tests__/generateNetwork.corpus.test.ts:975`; `packages/protocol-utilities/src/generateNetwork/__tests__/{pedigreeEdgeValues.test.ts:222,270,650,stageLinearity.test.ts:64,70}`; `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/{feasibility.test.ts:2800,generateEntityAttributes.test.ts:1376,entityCounts.test.ts:2166,2493,2530,2535,2553,2788}`; `packages/protocol-utilities/src/__tests__/generateNetwork.constraints.test.ts:3544`                              | production/read or test absence check        | Preserve. Every occurrence tests presence/absence or returns an unchanged sparse record; none assigns the nullish value.                                                                                                                                                                             |
| B                                 | `packages/protocol-utilities/src/generateNetwork/__tests__/binOverwriteRegistry.test.ts:170,249`; `packages/protocol-utilities/src/__tests__/generateNetwork.corpus.test.ts:1039`; `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/generateEntityAttributes.test.ts:1376`                                                                                                                                                                                                                                                                                                                         | test comparison sentinel                     | Preserve local `?? null` used only to make arrays/comparisons stable; it is not written to network attributes.                                                                                                                                                                                       |
| B                                 | `packages/interview/src/interfaces/Sociogram/Sociogram.tsx:312`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | UI-only state                                | Preserve local label fallback `null`; it is passed to label presentation logic and never to an attribute mutation.                                                                                                                                                                                   |
| B                                 | `packages/interview/src/interfaces/OrdinalBin/useOrdinalBins.ts:33,60-61`; `packages/interview/src/interfaces/FamilyPedigree/deriveBiologicalSex.ts:70`; `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/{egoCellTransform.ts:28,personAttributes.ts:16}`                                                                                                                                                                                                                                                                                                                                | production/read or form-output absence check | Narrow read type where necessary; preserve absence checks and optional form-transform return values, which are adapters rather than entity records.                                                                                                                                                  |
| B                                 | `packages/interview/src/interfaces/CategoricalBin/__tests__/useCategoricalBins.binSortOrder.test.tsx:26`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | typed test fixture                           | Remove `null` from the public attribute-record fixture type; use absence for unplaced data.                                                                                                                                                                                                          |
| B                                 | `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/__tests__/PedigreeLayout.test.tsx:395`; `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeLayout.stories.tsx:2051,2059`                                                                                                                                                                                                                                                                                                                                                                                             | UI/test absence check                        | Preserve absent DOM-attribute assertion and optional label reads; neither writes attributes.                                                                                                                                                                                                         |
| Story writer audit                | `packages/interview/src/interfaces/{OrdinalBin/OrdinalBin.capture.stories.tsx:44,OrdinalBin/OrdinalBin.stories.tsx:100,Sociogram/Sociogram.stories.tsx:94,CategoricalBin/CategoricalBin.capture.stories.tsx:43,CategoricalBin/CategoricalBin.stories.tsx:111,114,Narrative/Narrative.capture.stories.tsx:41-43,Narrative/Narrative.stories.tsx:150-153,301-303,334-345,423-455,543-569,616-631,1046-1057}`                                                                                                                                                                                                               | production-like story writer                 | Use `unsetNodeAttribute` directly or a presence-aware story helper so seeded variables remain deterministically absent without writing null.                                                                                                                                                         |
| Supplemental builder-writer audit | `packages/interview/e2e/matrix/categorical-bin.scenarios.ts:406,409,549,635,842-846`; `packages/interview/e2e/matrix/geospatial.scenarios.ts:112`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | production-like E2E writer                   | Use the explicit builder `unsetNodeAttribute` operation. This preserves deterministic suppression of generated values without a null/own-undefined network property.                                                                                                                                 |
| Supplemental builder-writer audit | `packages/protocol-utilities/src/SyntheticInterview.ts:setNodeAttribute,setEdgeAttribute,getNetwork`; `packages/protocol-utilities/src/__tests__/SyntheticInterview.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                             | canonical producer/API                       | Narrow set methods to public `VariableValue`; add explicit node/edge unset operations backed by a private non-network sentinel; exclude explicitly unset variables from generation and omit them from output; add node/edge conformance coverage.                                                    |
| C                                 | `packages/shared-consts/src/network.ts` (all `DefinedVariableValue*`, `CanonicalNc*` definitions); `packages/shared-consts/src/__tests__/network.test.ts` (all transitional conformance imports/assertions)                                                                                                                                                                                                                                                                                                                                                                                                              | schema compatibility / transitional contract | Fold compatibility transform into public schemas/types, rewrite tests against public aliases, then remove every transitional export.                                                                                                                                                                 |
| C                                 | `apps/fresco/lib/export/InterviewRepository.ts`; `apps/fresco/lib/db/index.ts`; `apps/fresco/lib/db/__tests__/safeParseField.test.ts`; `apps/fresco/app/(interview)/interview/[interviewId]/sync/route.ts`                                                                                                                                                                                                                                                                                                                                                                                                               | persistence boundary                         | Replace `CanonicalNcNetworkSchema` with final compatible `NcNetworkSchema`.                                                                                                                                                                                                                          |
| C                                 | `apps/interviewer/src/lib/db/{types.ts,recordCrypto.ts}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | persistence boundary / transitional type     | Replace canonical schema/type with public aliases and remove redundant `HydratedStoredSession` specialization if type-identical.                                                                                                                                                                     |
| C                                 | `packages/network-exporters/src/session/processSessions.ts`; `packages/network-exporters/src/input.ts`; `packages/network-exporters/src/utils/{getNodeLabelAttribute.ts,general.ts}`; `packages/network-exporters/src/formatters/{csv/processEntityVariables.ts,csv/__tests__/processEntityVariables.test.ts,graphml/generateDataElements.ts,graphml/generateKeyElements.ts,graphml/helpers.ts,graphml/processAttributes.ts}`                                                                                                                                                                                            | canonical consumer                           | Replace transitional names with final public entity/network/value aliases. Test assertions that bypass construction are migrated to inference-safe typed fixtures.                                                                                                                                   |
| C                                 | `packages/protocol-utilities/src/{SyntheticInterview.ts,ValueGenerator.ts}`; `packages/protocol-utilities/src/generateNetwork/{attributes.ts,context.ts,nodes.ts,constraints/generateEntityAttributes.ts}`; `packages/protocol-utilities/src/__tests__/{SyntheticInterview.test.ts,generateNetwork.test.ts,generateNetwork.corpus.test.ts}`                                                                                                                                                                                                                                                                              | canonical producer                           | Replace transitional names/schema with final public aliases/schema.                                                                                                                                                                                                                                  |
| C                                 | `packages/interview/src/store/{entityAttributePatch.ts,modules/session.ts}`; `packages/interview/src/forms/formValuesToAttributePatch.ts`; `packages/interview/src/interfaces/{NetworkComposer/useComposerActions.ts,Anonymisation/utils.ts,FamilyPedigree/store.ts,NameGenerator/NameGenerator.tsx,NameGenerator/components/NodeForm.tsx}`                                                                                                                                                                                                                                                                              | canonical producer/consumer                  | Replace transitional names with final public aliases while preserving patch and sparse-write semantics.                                                                                                                                                                                              |

Compile-derived rows from the required immediate post-swap root typecheck are
appended below before their consumers are edited.

| Source                       | file:line/symbol                                                                                                                                                                                                                                                                                                                                                                                              | Classification                                      | Action / resolution                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| post-swap root typecheck     | Every C-row transitional import; downstream repeats in Architect, Interviewer, and Fresco                                                                                                                                                                                                                                                                                                                     | compile-derived consumer                            | Replace with the final public alias/schema at the original package source; downstream diagnostics resolve transitively.                                                                                                  |
| post-swap root typecheck     | `packages/shared-consts/src/__tests__/network.test.ts:4-12,134-151`                                                                                                                                                                                                                                                                                                                                           | compile-derived contract test                       | Rewrite public runtime/type contract tests; reject null/undefined in `VariableValue`, parse legacy inputs through `NcNetworkSchema`.                                                                                     |
| post-swap root typecheck     | `packages/protocol-utilities/src/SyntheticInterview.ts:2280`; `packages/protocol-utilities/src/generateNetwork/nodes.ts:803,805`                                                                                                                                                                                                                                                                              | compile-derived producer/read                       | Remove stale nullable intermediate types or narrow legacy lookup values before canonical use.                                                                                                                            |
| post-swap root typecheck     | `packages/protocol-utilities/src/__tests__/ValueGenerator.constrained.test.ts:633,681`; `packages/protocol-utilities/src/__tests__/generateNetwork.corpus.test.ts:593`; `packages/protocol-utilities/src/generateNetwork/__tests__/binOverwriteRegistry.test.ts:169,248`                                                                                                                                      | compile-derived test helper                         | Narrow helper/collection inference to `VariableValue`; retain local comparison sentinels outside attributes.                                                                                                             |
| post-swap root typecheck     | `packages/protocol-utilities/src/__tests__/generateNetwork.test.ts:261`                                                                                                                                                                                                                                                                                                                                       | compile-derived legacy fixture                      | Construct the null-bearing input as schema input/unknown, not as an `NcNetwork`.                                                                                                                                         |
| post-swap root typecheck     | `packages/network-exporters/src/formatters/csv/processEntityVariables.ts:68,75`; `packages/network-exporters/src/formatters/graphml/processAttributes.ts:98`; `packages/network-exporters/src/session/insertEgoIntoSessionNetworks.ts:12,16`                                                                                                                                                                  | compile-derived canonical consumer                  | Final public aliases restore defined attribute values and entity callback inference.                                                                                                                                     |
| post-swap root typecheck     | `apps/fresco/scripts/__tests__/migrate-interview-categoricals.test.ts:181`; `apps/fresco/scripts/migrate-interview-categoricals.ts:wrapEntityCategoricals`                                                                                                                                                                                                                                                    | compile-derived migration fixture/consumer          | Use absence in the already-parsed migration fixture and remove the impossible production null branch; legacy database rows are normalized by `NcNetworkSchema` before this function.                                     |
| post-swap affected typecheck | `packages/protocol-utilities/src/generateNetwork/constraints/__tests__/generateEntityAttributes.test.ts:1376,1414,1663`                                                                                                                                                                                                                                                                                       | compile-derived test intermediate                   | Narrow the tested existing-value lookup before passing/assigning it as a defined generated value; keep comparison-only sentinels local.                                                                                  |
| post-swap affected typecheck | `packages/interview/src/canvas/__tests__/{ConvexHullLayer.test.ts:75,groupMembership.test.ts:40}`; `packages/interview/src/interfaces/CategoricalBin/__tests__/{useCategoricalBins.binSortOrder.test.tsx:26-30,useCategoricalBins.test.ts:11,28}`; `packages/interview/src/interfaces/OrdinalBin/__tests__/isUnplaced.test.ts:19`; `packages/interview/src/utils/__tests__/resolveRosterNodeLabel.test.ts:65` | compile-derived typed fixture                       | Replace attribute-null setup with absent keys; remove the now-impossible null branch case while retaining undefined/unplaced coverage.                                                                                   |
| post-swap affected typecheck | `packages/interview/src/interfaces/FamilyPedigree/components/wizards/transforms/__tests__/{childCellTransform.test.ts:26,egoCellTransform.test.ts:25,siblingCellTransform.test.ts:26}`                                                                                                                                                                                                                        | compile-derived test extraction helper              | Return `undefined` for absent/invalid extracted values and omit them from constructed entity attributes.                                                                                                                 |
| post-swap affected typecheck | `packages/interview/src/store/entityAttributePatch.test.ts:63`; `packages/interview/src/store/entityAttributePatch.ts:applyEntityAttributePatch`                                                                                                                                                                                                                                                              | compile-derived legacy fixture/schema compatibility | Make the applicator's private compatibility input explicitly `VariableValue                                                                                                                                              | null | undefined`; retain strict output. |
| post-swap affected typecheck | `packages/interview/src/store/modules/__tests__/session.test.ts:322,965`                                                                                                                                                                                                                                                                                                                                      | compile-derived patch/legacy fixture                | Use `unset` for canonical clears; inject legacy null only through `Reflect.set` before reducer normalization.                                                                                                            |
| integration review           | `packages/shared-consts/src/stage-metadata.ts:FamilyPedigreeStageMetadataSchema,isFamilyPedigreeStageMetadata`; `packages/shared-consts/src/__tests__/stage-metadata.test.ts`                                                                                                                                                                                                                                 | schema compatibility / type guard                   | Keep compatibility parsing transform-bearing, but make the guard validate a strict non-transforming output schema. Prove raw nullish metadata fails the guard and parsed sparse metadata passes.                         |
| integration review           | `apps/interviewer/src/lib/db/{types.ts:StoredSession,recordCrypto.ts:StoredSessionRow/decryptSession}`; `apps/interviewer/src/routes/Interview.tsx:handleSync/hydrateSession`; `apps/interviewer/src/lib/db/__tests__/recordCrypto.test.ts`                                                                                                                                                                   | persistence boundary / compile-derived consumer     | Type hydrated metadata as `StageMetadata`, parse plaintext and encrypted unknown values through `StageMetadataSchema`, remove route assertions, and cover null/own-undefined normalization plus invalid-value rejection. |
| integration review           | `apps/interviewer/src/lib/synthetic/generate.ts:generateSyntheticSessions`; `apps/interviewer/src/lib/db/__tests__/reencrypt.test.ts:session fixture`                                                                                                                                                                                                                                                         | compile-derived consumer/test fixture               | Parse generator metadata at the storage boundary and replace invalid generic metadata fixtures with valid typed entries.                                                                                                 |

Final resolution: all production-writer and compile-derived rows above are
resolved. The transitional-symbol search and the supplemental nullable builder-
writer search both return zero matches. The final attribute-context search
contains only defined-value presence checks, explicitly typed compatibility
inputs/fixtures, local comparison/presentation sentinels, and UI/form-transform
absence; it reports no production nullish entity-attribute write.

Also copy into the table every nullable-attribute consumer reported by affected
package and root typechecks during Milestones 2–7. After swapping the public
aliases in `network.ts`, run root `pnpm typecheck` once and append its
compile-derived file/symbol list before editing any reported consumer. Classify
each null occurrence as `production writer`, `legacy-input fixture`,
`schema compatibility`, or `UI-only state`; exclude UI-only null only with a
line-specific rationale showing that it does not enter entity attributes. The
completed table is the authoritative M8 file list.

**Code Changes**:

- Apply the public alias swap and Family Pedigree metadata normalization, then
  edit only actionable paths recorded in the inventory table.
- Remove transitional imports/exports after their recorded consumers compile
  against the public aliases.
- Re-run all three searches and root typecheck, and record resolution beside
  each inventory row.

**Acceptance Criteria**:

- No production path writes null or own undefined into entity attributes.
- TypeScript rejects both values in public entity attribute records.
- `NcNetworkSchema.parse()` accepts null-bearing legacy input and emits only
  sparse, defined-value output.
- No production or test import references a transitional canonical symbol.
- The inventory contains no unresolved production-writer or compile-derived
  rows; UI-only null rows remain only with recorded exclusion rationales.
- The transitional-symbol search returns no matches in `packages` or `apps`,
  and targeted searches plus package/root typechecks confirm the contract.

### Milestone 9: Verification and release metadata

**Files**:

- `docs/superpowers/plans/2026-08-12-non-null-variable-values.md`
- Required files under `.changeset/`

**Requirements**:

- Run affected unit tests throughout, then root `pnpm typecheck`,
  `pnpm lint:fix`, `pnpm knip`, and relevant interface verification.
- Use repository changeset guidance for every publishable package/app affected.
- Record verification outcomes in this plan or the final handoff.

**Acceptance Criteria**:

- All required checks pass or any external/infrastructure failure is identified
  with evidence.
- Changesets accurately describe the user-visible storage-contract migration.

### Milestone 10: Documentation

**Files**:

- `packages/shared-consts/README.md`
- `packages/interview/README.md`
- `packages/network-exporters/README.md`

**Requirements**:

- Document the canonical sparse attribute contract, including strict output,
  nullable-input compatibility, and preservation of defined empty values in
  `packages/shared-consts/README.md`.
- Document the form-to-patch-to-network boundary, presence-sensitive history,
  and atomic attribute/secure-metadata deletion in
  `packages/interview/README.md`.
- Document codebook-declared CSV columns and GraphML keys, absent-value output,
  and preservation of defined external attributes in
  `packages/network-exporters/README.md`.
- Ask a documentation reviewer to compare these descriptions and diagrams with
  the implemented contract.

**Acceptance Criteria**:

- The READMEs distinguish absent keys from `null`, `undefined`, and defined
  empty values without relying on migration history.
- The Interview architecture diagram matches the implemented adapter and patch
  flow, including persistence and exporter boundaries.
- Export documentation explains why fully unanswered declared variables remain
  in the output schema.
- Documentation review reports no stale contract description.

**Source Material**: `## Invisible Knowledge` section of this plan

## Milestone Dependencies

```text
M1 ---> M2 ---> M3 ---> M4
 |       |              |
 |       +--------+     |
 |                v     v
 +-----> M5      M6    M7
           \      |     /
            +-----+----+
                  |
                  v
                 M8 ---> M9 ---> M10
```

## Implementation Results

Completed on 2026-08-12.

- The public `VariableValue` and entity/network output types reject `null` and
  `undefined`. `NcNetworkSchema` accepts legacy nullish attribute entries and
  emits sparse records while preserving `false`, `0`, `''`, and `[]`.
- Interview writers use explicit `set`/`unset` patches. Form, direct-interface,
  Family Pedigree, Composer history, prompt, encrypted-attribute, and external
  roster paths now preserve absence without writing nullish values.
- Interviewer and Fresco normalize networks and Family Pedigree metadata at
  persistence boundaries. Exporters normalize each session independently and
  retain codebook-declared CSV columns and GraphML keys for unanswered data.
- Synthetic builders and generators omit unanswered values and expose explicit
  node/edge unset operations.
- The transitional symbol and production literal-writer searches return no
  unresolved matches. Remaining literal null attribute entries are deliberate
  raw compatibility fixtures parsed by `NcNetworkSchema`.
- Independent contract review found Family Pedigree clear/wizard validation and
  external roster coercion gaps. Both were fixed and re-reviewed; the audit
  reported no further nullish writers, boundary gaps, synthetic-output
  violations, or CSV/GraphML regressions.
- Independent documentation review compared all three owner-package READMEs
  with the implementation and resolved one prompt-derived-patch ambiguity.

### Verification Results

| Check                                    | Result                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm lint:fix`                          | Passed; lint auto-fix and repository formatting completed.                                                   |
| `pnpm typecheck`                         | Passed: 21/21 Turbo tasks.                                                                                   |
| `pnpm knip`                              | Passed.                                                                                                      |
| `pnpm check:changesets`                  | Passed.                                                                                                      |
| `git diff --check`                       | Passed.                                                                                                      |
| `@codaco/shared-consts` tests            | 6 files, 40 tests passed.                                                                                    |
| `@codaco/protocol-utilities` tests       | 28 files, 1,074 tests passed.                                                                                |
| `@codaco/network-exporters` tests        | 15 files, 90 tests passed.                                                                                   |
| `@codaco/interview` tests                | 163 files, 1,417 passed, 2 todo.                                                                             |
| `@codaco/interviewer` tests              | 74 files, 504 tests passed.                                                                                  |
| Fresco tests                             | 47 files, 380 tests passed.                                                                                  |
| Interview production and E2E-host builds | Passed.                                                                                                      |
| Affected interface matrix                | 186/186 passed: full Chromium coverage and Firefox/WebKit smoke coverage across 13 affected interface specs. |
| Post-audit Family Pedigree/roster matrix | 56/56 passed across Chromium, Firefox, and WebKit.                                                           |

No visual baselines were updated: the change alters data-state representation
and boundary validation, not intended rendered pixels, and the functional/ARIA
matrix completed without snapshot drift.
