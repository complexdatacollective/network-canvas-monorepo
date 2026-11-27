# Schema 9 directed edges, multiplex stages and stage-owned layouts: implementation plan

Spec: `docs/superpowers/specs/2026-11-24-schema-9-directed-multiplex-design.md`
(approved 2026-11-26, amended 2026-11-27). Read it in full before starting a slice. This plan
records the decisions the design leaves open, the exact shared names, and the
order of work. Where this plan and the design disagree, the design wins on
behaviour and this plan wins on names and file placement; raise any real
conflict in the slice's final report.

## A. Header

Goal: schema 9 gains directed edge types, endpoint rules, node stages that
accept several node types, and layouts that are codebook records owned by the
stages that set them, with every stage, the Architect editors, the exporters,
synthetic data, the canonical protocols and the documentation brought to the
new model.

Architecture: protocol-validation owns the schema, the migration, a capability
table and every helper that reads `directed`, `endpointRules`, a stage's node
types (its subject list, or a Network Composer's node entries) or layout usage,
and every other package calls those helpers. Filter and skip logic rules keep
their schema 8 behaviour; their redesign is issue #2725 and is not part of
this plan.
`@codaco/shared-consts` gains an `edge-identity` subpath that is the only place
edge identity (ordered or unordered) is decided. Each stage type is brought up
to several node types and directed edges in its own slice, and validation
refuses what a stage cannot yet run until that slice raises the stage's entry.

Slices run one after another on the branch `feat/schema-9-directed-multiplex`
in this worktree. After each slice adversarial reviewers read the diff and a
fixer applies their findings. Every slice ends with its dependency closure
typechecking and its tests passing.

## B. Global constraints

- Edit the schema 9 tree and `migrationV8toV9` in place; schema 9 is unreleased.
- No handling for documents saved by development builds; the migration need not be deterministic or re-runnable.
- Stored interview sessions are never rewritten.
- Never touch `apps/architect-classic` or `apps/interviewer-classic`.
- No barrel files; never add `export *` lines or index files.
- No re-exports of any kind; import every symbol from the module that defines it. Existing barrels (`protocol-validation/src/schemas/9/schema.ts:35-44`, `shared-consts/src/index.ts`, `migration/index.ts`, `schemas/9/common/index.ts`) are not extended.
- Export new protocol-validation helpers by name from `packages/protocol-validation/src/index.ts`, the package entry, and only when another package imports them.
- Check that a symbol is used elsewhere before exporting it; run `pnpm agent:check` (which includes knip) before ending a slice that adds exports.
- No `any`. No `as Type` assertions to silence a type error; narrow with a guard or fix the type.
- No new lint or TypeScript ignore comments.
- Relative imports in protocol-validation, shared-consts, protocol-utilities and network-query carry explicit `.ts` extensions.
- Comments only where code is unusual or complex.
- Rows a researcher edits or reorders independently carry `id: protocolObjectId(kind)` (highlight attributes, typed sort rules, Network Composer node entries). Endpoint rules and `nodeTypeOrder` entries carry none.
- Every new codebook-naming field carries an `entityTypeReference` or `entityAttributeReference` tag, or the new `layoutReference` tag; usage detection is schema-derived and must stay so.
- Wrap per-stage schemas with `withUniqueObjectIds`, and apply `withStageSubjectResolution` last because `.extend()` drops meta.
- Invoke `developing-network-canvas-ui` once per slice immediately before its first user-facing edit (slices 3a, 3b, 4 and 6 to 11).
- Filter and skip logic rules behave as in schema 8 (issue #2725). No slice changes how a rule runs, adds a rule setting or changes the rule editor, with two exceptions: keeping rules that name a layout working as rules that named a layout variable did (parity, owned by 3a, with the Architect codebook half in 3b, see C5); and refusing a node rule in a condition about a census role (slice 8, C12) or about a Network Composer node (slice 9, C11) on a stage with several node types, the conditions counterpart of label-only piped text (design, "Piped text on census stages").
- The edge type readers guard (`scripts/invariants/edge-type-field-readers.test.mjs`) is permanent and is never relaxed or removed. A slice that trips it reads the field through the C2 helpers, renames an unrelated identifier, or adds the narrow exemption the guard provides (see slices 5 and 13). `pnpm agent:test`, `pnpm agent:check` and the git hooks do not run root invariants (only CI does), so every slice runs `pnpm exec vitest run --config scripts/invariants/vitest.config.mts scripts/invariants/edge-type-field-readers.test.mjs` before its final `pnpm agent:test`, whether or not its "Done when" names it.
- Invoke `verifying-translations` before committing any non-English text. Every catalog is complete in every locale at all times (`checkFullLocale`), so each slice translates the strings it adds into ar, de, es, fr, it, nl, pt-BR, zh-Hans, zh-Hant (and en-GB where spelling differs), then runs `pnpm --filter <pkg> i18n:extract` and `pnpm --filter <pkg> i18n:stamp`.
- Participant-visible interview text must be schema interface text or a stage setting; screen-reader-only text stays an English plain string with `lang="en"`.
- Invoke `finishing-a-refactor` in every slice that introduces a shared helper and converts call sites (1, 2, 2b, 3a, 4, 6, 9).
- Invoke `verifying-an-interface-change` in every slice that changes an interface's runtime, schema or editor (2, 3a, 4, 6, 7, 8, 9, 10).
- Invoke `writing-an-oracle-that-can-fail` for every new test; prove each guard test red by a deliberate mutation before keeping it.
- Invoke `adopting-a-test-baseline` before accepting any changed snapshot or baseline.
- Unit tests: run the named file first, then `pnpm agent:test`; use `pnpm --filter <pkg> exec vitest run <file>` because `pnpm --filter <pkg> test <file>` drops arguments.
- Never run whole-tree `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test`, root `pnpm lint:fix`, bare `oxlint` or `oxfmt`, or `git commit --no-verify`.
- Commit at the end of each slice on `feat/schema-9-directed-multiplex` with a conventional message; never commit to `main`.
- Schema 9 stores (every `packages/protocols/**/protocol.json`, both `.netcanvas` zips, the compat copies) are re-saved by one-off scripts kept in the session scratchpad, never committed. Every slice that changes a stored shape (2, 3a, 4, 6, 7, 8, 9) re-saves every store and runs `pnpm check:compat-protocols`. Generators are not stores: the sketch compiler (`apps/sketch/src/server/design/compile.ts`) and `packages/protocols/scripts/build-custom-node-shapes-example.mjs` are changed in the slice that changes the shape they emit, and their outputs (the sketch goldens under `apps/sketch/src/server/design/__tests__`, the custom-node-shapes protocol) are regenerated by running them, never re-saved by a script. Compat copies are regenerated with `node ../protocols/scripts/sync-compat-package.mjs {sample|development} .` from the package directory; the Architect zip with `cd packages/protocols/e2e/all-interfaces && zip -rX ../../../../apps/architect/e2e/fixtures/files/all-interfaces.netcanvas protocol.json assets`; the interviewer zip with `node apps/interviewer/e2e/scripts/build-e2e-protocol.mjs`.
- Bulk fixture rewrites (subject literals, `layoutVariable`) use a one-off codemod script in the scratchpad, followed by reading every diff hunk that the codemod did not produce mechanically.
- Interview e2e matrix, Architect e2e, pixel baselines and interface images are not gated by hooks. Slices 2 to 11 keep scenario files compiling and the matrix guard units (`coverage-manifest.test.ts`, `stage-config-schema-support.test.ts`) green and add the scenarios for their own new keys. Each slice that changes an interface (2, 3a, 4, 6, 7, 8, 9, 10) also runs that interface's chromium matrix suite natively as `verifying-an-interface-change` prescribes (from `packages/interview`, after the rebuild its step 1 names: `pnpm exec playwright test --config e2e/playwright.config.ts --project=chromium-matrix e2e/specs/matrix/<name>.spec.ts`), proves each new scenario red by a deliberate mutation, and adopts that interface's aria baselines with `adopting-a-test-baseline`. The matrix command for each slice is in its "Done when". Slice 12b runs the cross-browser smoke, the pixel baselines, Architect and Interviewer e2e and the interface images.
- Story play tests run only in a package's storybook project (`pnpm agent:test` runs the unit projects only), so every slice that adds a story or changes the runtime under one names the storybook run in its "Done when".
- Architect's stage editor walkthrough (`apps/architect/src/components/StageEditor/walkthrough`: `content/*.md`, `scenes/*.tsx`) describes the sections and fields the stage editors render. A slice that renames, removes or adds a stage editor section or field, or changes what a stage does, updates the walkthrough content and scenes in the same slice and runs `pnpm --filter @codaco/architect exec vitest run --project=unit src/components/StageEditor`.
- Architect's printable protocol summary (`apps/architect/src/lib/ProtocolSummary/components/Stage`) prints stage settings through loosely typed props. A slice that changes a stage setting it prints updates `Stage.tsx`, `Prompt.tsx` or `Presets.tsx` in the same slice, and runs `pnpm --filter @codaco/architect exec vitest run --project=unit src/lib/ProtocolSummary`.
- The two coverage guards `src/utils/__tests__/entity-type-reference-coverage.test.ts` (`EXPECTED_TAGGED_FIELD_COUNT`) and `src/utils/__tests__/entity-attribute-reference-coverage.test.ts` count unique tagged schema instances. Every slice that adds, removes or moves a tag updates both counts and their explanatory comments, lists both files in its Files and runs both in its "Done when"; the expected change is stated in the slice.
- Every slice that adds a migration step adds its inverse to `src/schemas/9/__tests__/schema-8-protocol.ts` (`asSchema8Protocol`), so the round-trip tests that build schema 8 input from the complete schema 9 fixture exercise the step instead of passing a schema 9 shape through schema 8's loose schema.

## C. Shared contract

Everything below is decided. A slice that needs a name not listed here chooses
it locally and keeps it private to its package.

### C1. Edge types

File: `packages/protocol-validation/src/schemas/9/codebook/definitions.ts`.

```ts
type EndpointRule = { sourceType: string; targetType: string };

type EdgeDefinition = {
  name: string;
  color?: EdgeColor;
  variables?: EdgeVariables;
  directed?: true;
  endpointRules?: EndpointRule[]; // at least one, enforced by `.min(1)`
};
```

- `EndpointRuleSchema = z.strictObject({ sourceType: entityTypeReference({ entity: 'node' }), targetType: entityTypeReference({ entity: 'node' }) })`, in `definitions.ts` beside `EdgeDefinitionSchema`; exported by the first slice that imports it elsewhere.
- `directed: z.literal(true).optional()`; `endpointRules: z.array(EndpointRuleSchema).min(1).optional()`.
- Codebook-level checks in `codebook/codebook.ts` `superRefine`: every rule type is a key of `codebook.node`; no rule appears twice, compared as an unordered pair when the edge type is undirected and as an ordered pair when directed. Messages name the edge type and the pair by node type name.
- Endpoint rule type references are type references: deleting a node type named by a rule is blocked through the existing usage machinery, and `codebookIdRewrite` renames them.

### C2. Edge type helpers (protocol-validation)

File: `packages/protocol-validation/src/utils/edgeTypeRules.ts`. Exported by
name from `packages/protocol-validation/src/index.ts`. No other file in the
repository reads `directed` or `endpointRules` off an edge definition, except
the schema definition, the migration, and the writer files the guard reports
in the builder, the in-memory host, the Architect host and the Studio host
(slice 11).

```ts
type EdgeRulesCodebook = {
  node?: Record<string, unknown>;
  edge?: Record<string, { directed?: true; endpointRules?: readonly EndpointRule[] }>;
};
type TypedNode = { _uid: string; type: string };

isDirectedEdgeType(codebook: EdgeRulesCodebook, edgeType: string): boolean;
getEndpointRules(codebook: EdgeRulesCodebook, edgeType: string): readonly EndpointRule[] | undefined;
edgeTypeAllowsEndpoints(codebook: EdgeRulesCodebook, edgeType: string, sourceNodeType: string, targetNodeType: string): boolean;
edgeTypeAllowsAnyPair(codebook: EdgeRulesCodebook, edgeType: string, nodeTypes: readonly string[]): boolean;
getEligibleOrderedPairs<N extends TypedNode>(codebook: EdgeRulesCodebook, edgeType: string, nodes: readonly N[]): Array<[N, N]>;
validateNetworkAgainstEndpointRules(
  network: { nodes: readonly { _uid?: string; type?: string }[]; edges: readonly { _uid?: string; from: string; to: string; type: string }[] },
  codebook: EdgeRulesCodebook,
): EndpointRuleProblem[];

type EndpointRuleProblem =
  | { kind: 'selfLoop'; edgeIndex: number; edgeType: string }
  | { kind: 'duplicate'; edgeIndex: number; edgeType: string; duplicateOfIndex: number }
  | { kind: 'missingEndpoint'; edgeIndex: number; edgeType: string; end: 'from' | 'to' }
  | { kind: 'endpointTypesNotAllowed'; edgeIndex: number; edgeType: string; sourceType: string; targetType: string };
```

Semantics:

- An unknown edge type is undirected with no rules.
- `edgeTypeAllowsEndpoints` with no rules returns true; for an undirected type it accepts a rule in either orientation; for a directed type only `sourceType === source && targetType === target`. It never judges node identity, so self-loops are the caller's concern.
- `edgeTypeAllowsAnyPair(codebook, t, types)` is true when some ordered pair of types drawn from `types` (a type with itself counts only if the caller can supply two nodes; the helper assumes it can) is allowed.
- `getEligibleOrderedPairs` for a directed type returns every ordered pair `[a, b]` with `a !== b` that the rules allow, ordered by `a`'s index in `nodes`, then `b`'s index, so the two directions of one pair are not adjacent; callers that need them back to back (the census stages) group by unordered pair themselves. For an undirected type it returns each unordered pair once as `[earlier, later]` in `nodes` order when the rules allow it in either orientation.
- `validateNetworkAgainstEndpointRules` uses `edgeIdentityKey` from C3 for duplicates. It accepts networks whose nodes are untyped or carry no `_uid` (network assets, see slice 11): self-loops and duplicates are always reported; `missingEndpoint` only when every node carries `_uid`; `endpointTypesNotAllowed` only when the edge `type` is a key of `codebook.edge` and both ends resolve by `_uid` to nodes whose `type` is a key of `codebook.node`. Session and synthetic networks always carry both, so for them every problem is reported.

### C3. Edge identity (shared-consts)

File: `packages/shared-consts/src/edge-identity.ts`, reached only as
`@codaco/shared-consts/edge-identity`. It needs a `"./edge-identity"` entry in
`exports` (pointing at `./src/edge-identity.ts`) and in
`publishConfig.exports` (dist `types`/`import`/`require`), a second lib entry
in `packages/shared-consts/vite.config.ts`, and a passing
`node scripts/release/verify-publish-exports.mjs @codaco/shared-consts` after
`pnpm --filter @codaco/shared-consts build`. Never add it to `src/index.ts`.

```ts
type EdgeEndpoints = { from: string; to: string; type: string };

edgeIdentityKey(edge: EdgeEndpoints, directed: boolean): string;
findEdge<E extends EdgeEndpoints>(edges: readonly E[], endpoints: EdgeEndpoints, directed: boolean): E | undefined;
toggleEdge<E extends EdgeEndpoints>(edges: readonly E[], endpoints: EdgeEndpoints, directed: boolean):
  | { action: 'remove'; edge: E }
  | { action: 'add' }
  | { action: 'refuse'; reason: 'selfLoop' };
```

The interview's session thunk is also called `toggleEdge`. Interview code
imports the helper as `import { toggleEdge as planEdgeToggle } from
'@codaco/shared-consts/edge-identity'`. Direction is always read from the edge
type through `isDirectedEdgeType`; stored edges never carry `directed`.

### C4. Node stage subjects and the capability table

File: `packages/protocol-validation/src/schemas/9/common/subjects.ts`.

```ts
// No alias names the node arm; code that needs it writes the shape inline or
// uses Extract<StageSubject, { entity: 'node' }>.
type StageSubject =
  | { entity: 'ego' }
  | { entity: 'node'; types: string[] }   // what z.array().min(1) infers; the schema enforces non-empty
  | { entity: 'edge'; type: string };
type ResolvedSubject = { entity: 'ego' } | { entity: 'node'; type: string } | { entity: 'edge'; type: string };
```

- `nodeStageSubjectFor(stageType: NodeSubjectStageType)` builds the subject schema for one stage type: `types` is a non-empty array with no duplicates (the duplicate check runs before the cap, so a capped stage still reports a repeat), and `.max(1)` when the capability table says `'single'`. Every stage's list is built from one module-level element schema, `const NODE_TYPE_ELEMENT = entityTypeReference({ entity: 'node' })`, shared with `NodeStageSubjectSchema`, so the stage schemas add no tagged instance and slice 2 leaves `EXPECTED_TAGGED_FIELD_COUNT` unchanged. Each node stage uses it: 14 until slice 9, then 13 (the Composer leaves). The plain `NodeStageSubjectSchema` remains for code that parses a subject without a stage type.
- `NodeEntitySubjectSchema = z.strictObject({ entity: z.literal('node'), type: entityTypeReference({ entity: 'node' }) })`, same file: the singular node subject, the node arm of `ResolvedSubject`, used by Network Composer node entries (C11). Its tag is one new tagged instance, counted in slice 9.
- `ResolvedSubject` replaces `StageSubject` everywhere a single resolved subject is meant: `EntityAttributeReferenceHit.subject`, `utils/referenceSubjects.ts`, `utils/validation-helpers.ts`, `dynamic-value-validation.ts`, and fresco-ui form validation (`packages/fresco-ui/src/form/validation/utils/getVariableDefinition.ts`, `utils/collectNetworkValues.ts`, `src/form/store/types.ts` `stageSubject`; the interview already passes one resolved subject per form). It is exported from `index.ts`.
- `utils/schemaReferenceWalk.ts` `stageSubjectOf`, which runs at every object, is specified in full: an ego subject, a singular node subject (`{ entity: 'node', type }`, as on a Composer node entry) and an edge subject pass through after a guard that checks `entity` and a string `type`; a node subject with a one-element `types` list resolves to `{ entity: 'node', type: t }`; a node subject with several types resolves to `undefined`; a node subject carrying both `type` and `types` resolves to `undefined`; anything else is not a subject. The unsafe cast there goes.
- `stage-subject-resolution.ts` `stringAt` accepts numeric path segments into arrays; NarrativePedigree's declared path becomes `['subject', 'types', 0]`.
- Network Composer has no stage `subject` from slice 9 (C11). Its stage-level `stageSubject` references (only `convexHullVariable`) resolve through a declared resolution added in slice 9, `{ from: 'soleListEntry', list: 'nodes', path: ['subject', 'type'], entity: 'node' }`: it resolves to the entry's node type when `nodes` has exactly one element and to `undefined` otherwise. `nodeStageSubjectFor` is not used by the Composer schema after slice 9.

File: `packages/protocol-validation/src/schemas/9/stage-capabilities.ts`.
It is a leaf: it holds the two tables, `nodeTypeCapabilityOf`,
`stageEdgeTypeSupportIssues`, `getStageNodeTypes` and `getSingleStageNodeType`,
and imports only types (`StageType`, `Stage`, `Codebook`,
`EntityTypeReferenceHit`) and no runtime module that reaches the stage schemas,
because `common/subjects.ts` imports it at runtime for `nodeStageSubjectFor`
and every stage module imports `common/subjects.ts`.

```ts
type NodeSubjectStageType =
  | 'Sociogram' | 'Narrative' | 'DyadCensus' | 'OneToManyDyadCensus' | 'TieStrengthCensus'
  | 'NetworkComposer' | 'NameGenerator' | 'NameGeneratorQuickAdd' | 'NameGeneratorRoster'
  | 'CategoricalBin' | 'OrdinalBin' | 'AlterForm' | 'Geospatial' | 'FamilyPedigree';
// From slice 9 'NetworkComposer' has no node subject; it stays in the union
// only for the capability table.

const STAGE_NODE_TYPE_CAPABILITY: Record<NodeSubjectStageType, 'single' | 'several'>;
// Takes a string: the guard test passes stage types read from the stage
// schemas' type literals, which are strings.
nodeTypeCapabilityOf(stageType: string): 'single' | 'several' | undefined;

type EdgeStageType =
  | 'Sociogram' | 'Narrative' | 'DyadCensus' | 'OneToManyDyadCensus' | 'TieStrengthCensus'
  | 'NetworkComposer' | 'AlterEdgeForm' | 'FamilyPedigree';

// Temporary scaffolding, deleted in slice 10.
const STAGE_EDGE_TYPE_SUPPORT: Record<EdgeStageType, { directed: boolean; endpointRules: boolean }>;
stageEdgeTypeSupportIssues(
  protocol: { codebook: Codebook; stages: readonly Stage[] },
  typeHits: readonly EntityTypeReferenceHit[],
): Array<{ path: (string | number)[]; message: string }>;
```

`schema.ts` calls it from the cross-reference `superRefine` with
`collectEntityTypeReferencesFromSchema(ProtocolStructureSchema, protocol)`
(`utils/collectEntityAttributeReferences.ts`), following the
`findExclusiveVariableConflicts(protocol, hits)` convention, so the function
never walks the schema itself.

Every entry of `STAGE_NODE_TYPE_CAPABILITY` starts at `'single'` (slice 2).
Raised to `'several'`: Sociogram in slice 6, Narrative in slice 7, the three
census stages in slice 8, NetworkComposer in slice 9. For every stage but the
Composer the entry caps the subject's `types` list. The Composer keeps its
entry after slice 9 removes its stage subject, but no schema reads it there:
the entry is kept only for `nodeTypeCapabilityOf` and for the multi-type guard
test, which treats a `'several'` stage with two node entries as a two-type
stage. Every entry of
`STAGE_EDGE_TYPE_SUPPORT` starts `{ directed: false, endpointRules: false }`
(slice 1). `stageEdgeTypeSupportIssues` considers the edge-type hits whose path
starts `['stages', i, …]` and skips, by path, every hit under the stage's
`filter`, `skipLogic`, `conditions` (anywhere a `conditions` key appears on
the path, which covers edge-count rules in stage text) and panel filters, that
is any hit whose path contains a `rules` segment followed by an index and
`options`, or a `conditions` segment. Edge-count rules and filter rules are
orientation-blind and stay so in this feature (issue #2725). A stage whose type
is not an `EdgeStageType` yields no issue. For the remaining hits it reports a
directed type when the stage's `directed` is false, or a type with endpoint
rules when its `endpointRules` is false. Raised to true: Sociogram
(both) in slice 6, Narrative (both) in slice 7, censuses (both) in slice 8,
NetworkComposer (both) in slice 9, AlterEdgeForm (both) in slice 10. Slice 10
deletes the table and the function, replacing the FamilyPedigree entry with
the permanent pedigree rules.

Stage accessors, same file:

```ts
getStageNodeTypes(stage: Stage): readonly string[];        // [] for stages with no node types
getSingleStageNodeType(stage: Stage): string | undefined;   // the type when there is exactly one
```

`getStageNodeTypes` is the single answer to "which node types does this stage
use". It returns the subject's `types` for every node stage except Network
Composer, and from slice 9 a Composer's node entry types
(`nodes.map((entry) => entry.subject.type)`), in entry order. There is no
second list to keep in step. Every counterpart below answers the same way for a
Composer from slice 9, and everything that asks for a stage's node types
(layout usage, skip logic, stage filters, form and dynamic value scopes,
synthetic data) goes through one of them.

Interview selectors (`packages/interview/src/selectors/session.ts`):
`getStageNodeTypes` (replaces the reads of `getSubjectType` on node stages),
`getSingleStageNodeType` (for single-type stages), and `getSubjectType`
deleted. `getNetworkNodesForType` filters by `getStageNodeTypes(...).includes(node.type)`.
protocol-utilities `generateNetwork/subject.ts`: `getStageNodeTypes(stage):
string[] | undefined` and `getSingleStageNodeType(stage): string | undefined`,
both tolerant of drafts (return `undefined` for a missing, empty or non-array
`types`, and from slice 9 for a Composer whose `nodes` is missing, empty or
holds an entry without a string `subject.type`). protocol-builder: `useStageNodeTypes(): readonly string[]` and
`useSingleStageNodeType(): string | undefined` in
`sections/useStageSubject.ts`, module-private until a section needs them.
`useStageSubject('node')` stays as the single-type reader for its callers and
reads through `useSingleStageNodeType`, so it gives `undefined` for a stage
listing several types. The slice that raises a stage to 'several' converts
that stage's callers: slice 6 `editors/sociogram/sections/prompts/SociogramPromptFields.tsx`
and `SociogramPromptsSection.tsx`; slice 7 `editors/narrative/sections/presets/NarrativePresetFields.tsx`
and `NarrativePresetsSection.tsx`; slice 8 `editors/one-to-many-dyad-census/sections/OneToManyDyadCensusPromptsSection.tsx`
and any census section that reads the node subject; slice 9
`editors/network-composer/sections/ComposerNodesSection.tsx` and every other
Composer section, which read the entry's own subject or `useStageNodeTypes`
(itself reading the entries, as does `draftSubjectNodeTypes`). Shared
sections that a several-type stage mounts (`sections/form-fields/FormFieldsSection.tsx`,
`sections/panels/NodePanelsSection.tsx`) are converted by the first slice
whose several-type stage mounts them.

Guard (slice 2, file
`packages/protocol-validation/src/schemas/9/__tests__/multi-type-stage-references.test.ts`):
for every stage type whose capability is `'several'`, every
`entityAttributeReference` tag resolved with `'stageSubject'` in that stage's
schema sits inside an object that carries its own single-typed `subject`
(Composer entries), or is listed in `SINGLE_TYPE_ONLY_FIELDS` (a constant in
the test naming paths such as `convexHullVariable`,
`presets[].groupVariable`, census piped-text roles), and for each listed field
a fixture with two types proves validation rejects it. Each listed entry
carries that fixture and the issue path validation must report. An entry
proves its field only when the issue path is under `stages`, lies in the listed
field, and names a stage of the entry's stage type whose node types
(`getStageNodeTypes`) number two or more; validation reports an issue at that path; and the
same fixture with the stage's list cut to its first type reports none there,
so the second type is what validation refuses. Self-checks cover each of those
conditions. Besides attribute references, the walk reports text whose dynamic
values can be about the stage's node as `<path> (dynamic values)`: every
dynamic-value site except `stageText` and `nodeLabel`, so a new kind of site is
checked until it is classified. With every stage
`'single'` the test is vacuous in slice 2 apart from a self-check that it fails
when an entry is raised; each later slice makes it real for its stage. The test
reads a stage's node types through `getStageNodeTypes`, and "cut to its first
type" cuts a Composer's node entries to the first, so from slice 9 a Composer
with two node entries counts as a two-type stage.

### C5. Layouts

Codebook (`codebook/codebook.ts`):

```ts
type LayoutDefinition = { name: string };          // CodebookNameSchema
type Codebook = { node?; edge?; ego?; layouts?: Record<LayoutId, LayoutDefinition> };
```

- `layouts: codebookRecord(VariableIdSchema, LayoutDefinitionSchema, 'layout').optional()`. A layout id is a variable-namespace UUID because positions are stored on nodes under it; layout keys join the cross-entity record-key uniqueness check.
- Names are unique among layouts and may not equal the name of any node type's variable, and no derived export column of a layout (`name_x`, `name_y`, the screen-space pair, GraphML `name_X`, `name_Y` and screen-space pair, from `packages/shared-consts/src/export-columns.ts`) may equal a derived column of any node variable or another layout. Checked in `codebook.ts` with a new shared-consts function `findLayoutExportColumnConflicts(layouts, nodeVariablesByType)` in `export-columns.ts` (exported from the shared-consts root entry, which is where `findExportColumnConflicts` lives).
- The same name rules apply in the other direction during authoring: the name scope used when creating or renaming a node variable in protocol-builder (`fields/variableNameRules.ts` `variableNameScope` and its callers) includes every layout's name and derived export columns, so a node variable named `sociogram` or `sociogram_x` is refused while a layout `sociogram` exists.
- Filter rules naming a layout (parity only; the rule system is otherwise unchanged, issue #2725): a node rule that named a layout variable in schema 8 keeps validating, running, being shown and being editable in schema 9, now naming the layout (same id, the same four operators). Parity is with what the code did, not with authoring it never had: the builder has never offered a layout attribute any operator (`operators.ts` gives `'layout'` no operand candidate, so `operatorsForSubject('layout')` is empty and `canAuthorRuleForType('layout')` is false; `ruleCodebook.ts` lists the attribute with `unavailableReason` "This attribute cannot be used in a rule. Choose another one."), so a researcher could not author one in the builder and still cannot. Nothing more is added; authoring one is #2725's. Each part has one owner:
  - Validation and reference resolution (slice 3a): validation accepts a node rule whose attribute is a key of `codebook.layouts`, with an operator in `LAYOUT_RULE_OPERATORS`, for any node type, and rejects a node rule naming an attribute that is neither a variable of its type nor a key of `codebook.layouts`. Whether the type has the layout is not a validation rule, because a migrated rule must stay valid when no stage sets the layout for that type. `codebookIdRewrite.filterRuleOwner` resolves such an id to the layout.
  - Deletion (slice 3a): `layoutReference` hits and filter-rule hits are different kinds of reference and are collected separately. A deletion first collects the `layoutReference` hits; if there is any, it is refused (`ReferencesRemain`) and nothing is written, so a reference held in a list (a Narrative `presets[i].layout`) never reaches the generic sweep, which would drop the preset. Only filter-rule hits are ever passed to the sweep. Hosts then differ as they do for a variable that a rule names: studio-sync, the in-memory host and the Studio host remove the rule with the layout, as they remove a rule naming a deleted variable today; Architect's `deleteLayoutSection` also answers `ReferencesRemain` while a filter or skip logic rule names the layout, as `deleteVariableAsync` refuses a variable a rule names. `findRulesNamingLayout(protocol, layoutId): Array<{ stageId: string; path: (string | number)[] }>` in `utils/layoutUsage.ts`, built on the filter-rule attribute hits, is the one reader of rule uses; Architect's host (3a) and its Codebook Layouts section (3b) use it.
  - Running (slice 3a): network-query reads node attributes by key and needs no change, because positions stay stored under the layout's id. Tests pin that a stage filter rule and a skip logic rule naming a layout still judge nodes by the stored position.
  - Showing and editing (slice 3a, so that removing `VariableTypes.layout` leaves the rule editor green in the slice that removes it): the builder's rule editor (`rules/ruleCodebook.ts`, `rules/operators.ts`, `rules/ruleDescription.ts`, `rules/ruleCodebookSource.ts`) treats a layout as it treated a layout attribute. A layout comes from `codebook.layouts` instead of a variable of type `layout`, is listed for the node types that have it (`getNodeTypesWithLayout`, so `ruleCodebookSource.ts` gains the stages) with the existing `unavailableReason` sentence, and is offered no operator. Where a provider gives a codebook without stages (`useRuleCodebook` returns a codebook only), no layout is listed, but a stored rule's layout still resolves by name from `codebook.layouts`. A stored rule naming a layout opens without the "no longer in the codebook" message, keeps its layout selected and shown by name, even when its node type does not have the layout, is described by the layout's name, and can be pointed at another attribute or deleted. Architect's printable summary (`lib/ProtocolSummary/components/Rule.tsx`, which calls the builder's `describeRule`) prints the layout's name.
- `findPrototypeCodebookKeys` covers `codebook.layouts`.
- Id rewriting: `CodebookIdRenames` (`utils/codebookIdRewrite.ts`) gains `layoutId?: (layoutId: string) => string`, applied to the keys of `codebook.layouts`, to every `layoutReference` hit, and to every filter-rule attribute hit whose id is a key of `codebook.layouts` (`filterRuleOwner` resolves such an id to the layout, not to a variable owner). `migration-codebook-ids.ts` `assignCodebookIds` claims layout keys first, ahead of node, edge and ego variables: a layout keeps its id (a readable schema 8 key becomes a UUID through `layoutId`, a UUID is kept), and a variable on any entity holding the same key gets a new id with its references rewritten. Slice 2b applies `layoutId` to the keys; slice 3a extends it to `layoutReference` and filter-rule hits when those exist.
- `VariableTypes.layout` is removed from `variables/types.ts`, from the `satisfies Record<VariableType, …>` tables and from the variable union, for node, ego and edge types alike. `OperatorsByVariableType.layout` moves to `LAYOUT_RULE_OPERATORS = ['EXISTS', 'NOT_EXISTS', 'EXACTLY', 'NOT']` in `filters/filter.ts`.

Layout reference tag (`packages/protocol-validation/src/schemas/9/layout-reference.ts`):

```ts
layoutReference(): z.ZodString;          // marks a string holding a layout id
LAYOUT_REFERENCE: 'layoutReference';
```

The walk (`utils/schemaReferenceWalk.ts`) adds the tag to `hasReference` and
emits `{ kind: 'layout', path, layoutId }` hits; `collectLayoutReferences(protocol)`
lives in `utils/collectEntityAttributeReferences.ts` beside the other
collectors. `utils/codebookIdRewrite.ts` rewrites layouts through `layoutId`
(above). Every caller that builds renames is updated: `__tests__/testIds.ts`
(`withTestCodebookIds` renames layout keys; `originalCodebookKeys` maps a
migrated layout back to the original schema 8 layout variable key by name;
`withOriginalCodebookKeys` throws on a layout hit that still holds a readable
key), `packages/protocol-builder/src/testing/testId.ts`,
`apps/sketch/src/server/design/objectIds.ts` and
`packages/protocols/scripts/build-custom-node-shapes-example.mjs`.

Fields that carry the tag:

| Stage           | Field                            | Access             |
| --------------- | -------------------------------- | ------------------ |
| Sociogram       | `layout` (stage level, required) | derived, see below |
| Narrative       | `presets[].layout` (required)    | reads              |
| NetworkComposer | `layout` (stage level, required) | sets               |

Layout usage helpers (`packages/protocol-validation/src/utils/layoutUsage.ts`,
exported by name). Each helper is added by the first slice that calls it,
with its tests and its consumer, so that no export lacks a consumer (knip):
slice 3a adds `getStageLayoutUses`, `getLayoutUsage`, `getNodeTypesWithLayout`
and `findRulesNamingLayout`; slice 3b adds `getLayoutsOfNodeType` and
`findUnreachableLayoutReads`; slice 4 adds `isFirstStageUsingLayout`.

```ts
type LayoutAccess = 'sets' | 'reads';
type StageLayoutUse = { layoutId: string; access: LayoutAccess; nodeTypes: readonly string[]; stageId: string; presetId?: string };

getStageLayoutUses(stage: Stage): StageLayoutUse[];
getLayoutUsage(protocol: { codebook: Codebook; stages: readonly Stage[] }):
  Record<string, { setBy: StageLayoutUse[]; readBy: StageLayoutUse[]; nodeTypes: readonly string[] }>;
getNodeTypesWithLayout(protocol, layoutId: string): readonly string[];
getLayoutsOfNodeType(protocol, nodeType: string): readonly string[];
findUnreachableLayoutReads(protocol): Array<{ stageId: string; presetId?: string; layoutId: string; nodeTypes: readonly string[] }>;
isFirstStageUsingLayout(protocol, stageId: string, layoutId: string): boolean;
findRulesNamingLayout(protocol, layoutId: string): Array<{ stageId: string; path: (string | number)[] }>;
```

Sociogram access: in slice 3a every Sociogram `sets` (participants can drag
on every prompt until the task model). From slice 4 a Sociogram `sets` when
`behaviours.automaticLayout` is true or any prompt has `task: 'layout'`, and
otherwise `reads`. A node type has a layout when it is in the node types of a
stage use with `access: 'sets'`. A use's `nodeTypes` is `getStageNodeTypes(stage)`
(C4), so for a Network Composer they are its node entries' types. Unused
layouts are those with no stage use. In Architect a layout that a rule names
(`findRulesNamingLayout`) is not offered for deletion either (Deletion, above).

Exporter input (`packages/network-exporters/src/input.ts`):

```ts
type ProtocolExportInput = { hash: string; name: string; codebook: Codebook; layoutNodeTypes: Record<string, readonly string[]> };
```

Hosts fill `layoutNodeTypes` with `getLayoutUsage(protocol)[id].nodeTypes` for
every key of `codebook.layouts`. Interviewer's schema 8 path gets a real
adapter, `apps/interviewer/src/lib/export/schema8ExportInput.ts`
`schema8ExportInput(protocol): ProtocolExportInput`, that lifts every node
`layout` variable into `layouts`, removes it from the type, records each owning
type in `layoutNodeTypes`, and drops ego and edge layout variables.

Interview store: `updateNode`, `toggleNodeAttributes`, `addNode` and the
canvas `syncToRedux` accept a key when it is a variable of the node's type or a
key of `codebook.layouts`. The selector is
`makeGetWritableAttributeKeysForNodeType` in
`packages/interview/src/selectors/protocol.ts`.

Studio section: `SectionRef` gains `{ kind: 'codebookLayout'; layoutId: string }`
with id prefix `codebook:layout:` (`packages/studio-sync/src/taxonomy.ts`).

SyntheticInterview: `addLayout(input?: { name?: string }): { id: string; name:
string }`. A nameless call names the layout `layout_<n+1>` (`layout_1`,
`layout_2`, ...), and a call with the name of a layout already added returns
that layout. Stage inputs take `layout?: string` (Sociogram, NetworkComposer)
and presets take `layout?: string`. When omitted, every Sociogram shares one
layout named `sociogramLayout`, every Network Composer shares one named
`composerLayout`, and a Narrative preset reads the first layout of the
interview, or adds `narrativeLayout` when there is none. `getNetwork` writes a
position for a node in every layout that a stage whose subject includes the
node's type sets, and also in every layout that a Narrative preset about the
type reads (a synthetic network stands for an interview whose earlier stages
all ran), using the current `ValueGenerator` layout formula. Fixtures for
`findUnreachableLayoutReads` (3b) and `isFirstStageUsingLayout` (slice 4) that
need separate layouts or an unplaced node pass `layout` explicitly.

### C6. Sociogram prompts and highlight attributes

File: `packages/protocol-validation/src/schemas/9/common/prompts.ts`.

```ts
type HighlightAttribute = { id: ProtocolObjectId /* 'highlightAttribute' */; type: string; variable: string };

type SociogramPromptBase = {
  id; text;
  edges?: { display?: string[] };   // connect tasks: see below
  sortOrder?: NodeTypeSortRule[];   // slice 6; slice 4 keeps SortOrder
  nodeTypeOrder?: string[];         // slice 6
};
type SociogramLayoutPrompt = SociogramPromptBase & { task: 'layout' };
type SociogramHighlightPrompt = SociogramPromptBase & { task: 'highlight'; highlight: [HighlightAttribute, ...HighlightAttribute[]] };
type SociogramConnectPrompt = Omit<SociogramPromptBase, 'edges'> & { task: 'connect'; edges: { create: string; display?: string[] } };
type SociogramPrompt = SociogramLayoutPrompt | SociogramHighlightPrompt | SociogramConnectPrompt;

type SociogramStage = { …base; subject: Extract<StageSubject, { entity: 'node' }>; layout: string; prompts: SociogramPrompt[]; behaviours?: { automaticLayout?: boolean }; background; … };
```

- Highlight attribute rows are built by one helper in `common/prompts.ts`, `highlightAttributeSchema({ writes }: { writes: boolean })`, returning `z.strictObject({ id: protocolObjectId('highlightAttribute'), type: entityTypeReference({ entity: 'node' }), variable })` where `variable` is `entityAttributeReference({ subject: { sibling: 'type', entity: 'node' }, requireType: ['boolean'] })`, plus `usage: 'unvalidatedAttribute'` only when `writes` is true. The Sociogram highlight task uses `writes: true` (the participant sets the variable); the Narrative highlight entry uses `writes: false` (it only displays it, and a display must stay out of the writer set that `findVariableRoleConflicts` and `findExclusiveVariableConflicts` key on). Both are typed `HighlightAttribute`. New object-id kind `'highlightAttribute'`.
- Within a prompt the entries' types are unique and each is one of the stage's node types.
- A connect task draws only the edge types in `edges.display`, as today; the created type is not added automatically.
- Sociogram `behaviours` keeps only `automaticLayout`; `allowRepositioning` and `freeDraw` are removed from the Sociogram (Narrative keeps them), and the migration drops them.
- The union is discriminated on `task`. If `exclusive-variant-containers.ts` cannot derive the variants, declare them with `asExclusiveVariants`. The builder's path-keyed variant registry must key Sociogram prompts by stage type.

### C7. Narrative presets

```ts
type NarrativeHighlight = { id /* 'narrativePresetHighlight' */; label: LocalizedString; attributes: [HighlightAttribute, ...HighlightAttribute[]] };
type NarrativePreset = { id; label; layout: string; groupVariable?: string; filter?; edges?: { display? }; highlight?: NarrativeHighlight[] };
```

`groupVariable` is valid only when the stage has exactly one node type
(validation). Entry attribute types are unique within an entry and among the
stage's node types. `attributes` uses `highlightAttributeSchema({ writes: false })`
(C6): the variable must be boolean (new for the Narrative, which today accepts
any variable), and the Narrative never counts as writing it.

### C8. Sorting on several node types

File: `packages/protocol-validation/src/schemas/9/filters/sort.ts`.

```ts
type NodeTypeSortRule = { id /* 'sortRule' */; type: string; property: string; direction: 'asc' | 'desc' };
NodeTypeSortRuleSchema; NodeTypeSortOrderSchema = z.array(NodeTypeSortRuleSchema);
NodeTypeOrderSchema = z.array(entityTypeReference({ entity: 'node' }));
```

- `property` is `entityAttributeReference({ subject: { sibling: 'type', entity: 'node' }, existence: 'unchecked', ignoreValues: [NOMINATION_ORDER_SORT_KEY] })`.
- Used by Sociogram prompts (`sortOrder`, `nodeTypeOrder`) and One-to-Many prompts (`bucketSortOrder`, `bucketNodeTypeOrder`, `binSortOrder`, `binNodeTypeOrder`). Bins and the roster keep `SortOrderSchema` and `DataSourceSortOrderSchema` unchanged.
- Each rule's `type` is one of the stage's node types. A `nodeTypeOrder` lists every stage node type exactly once.
- Runtime order: nodes are grouped by type in `nodeTypeOrder` (or subject order when absent), and each group is sorted by the rules whose `type` matches, in list order, falling back to the current default order. Interview: `useNodeTypeSortedList(nodes, rules, nodeTypeOrder, subjectTypes)` in `packages/interview/src/hooks/useNodeTypeSortedList.ts` (new); `useSortedNodeList` stays for bins.
- The rule's `type` (a node type id) shares its name with the sorter's own `type` (`SortType`) on `LegacyOrProtocolSortRule` in `packages/interview/src/utils/createSorter.ts`, and `processProtocolSortRule` treats a rule that has `type` as already processed. `useNodeTypeSortedList` and the protocol-utilities sorting therefore group rules by `type` and pass only `{ property, direction }` to `processProtocolSortRule`, with the group's node type as the codebook subject; a typed rule is never handed to the sorter whole.

### C9. One-to-Many focal setting

`oneToManyDyadCensusPromptSchema` gains `focalRole: z.literal('target').optional()`.
Absent means the focal node is the source. Valid only when `createEdge` names a
directed type (cross-reference check). The stage-level
`removeAfterConsideration` applies only to prompts whose edge type is
undirected.

### C10. Removed

Removed: filter and skip logic rules keep their schema 8 behaviour in this
feature (issue #2725), so there is no edge rule end setting. The number is kept
so that references to C11 to C14 stay valid.

### C11. Network Composer node entries

```ts
type ComposerNodeEntry = {
  id: ProtocolObjectId; /* 'composerNode' */
  subject: { entity: 'node'; type: string };   // NodeEntitySubjectSchema (C4)
  label: LocalizedString;          // plain, single line, non-blank
  quickAdd: string;                // entityAttributeReference({ subject: 'stageSubject', usage: 'validatedAttribute' })
  form?: ComposerForm;
};
// No stage-level subject, quickAdd or nodeForm.
type NetworkComposerStage = { …base; nodes: [ComposerNodeEntry, ...ComposerNodeEntry[]];
  layout: string; convexHullVariable?: string; background; behaviours?: { automaticLayout?: boolean }; edges?: ComposerEdgeEntry[] };
```

- The Composer stores its node types only in its node entries and has no stage `subject`. Node entries mirror the edge entries: `subject` on each entry makes the walk resolve `quickAdd` and form fields against that entry's type.
- No two node entries name the same node type (validation, as the existing check on `edges.map((edge) => edge.subject.type)`). The stage's node types are `getStageNodeTypes(stage)` (C4): the entries' types in entry order. Entries are reorderable like edge entries; a reorder changes only the entry order, which is the toolbar order.
- `convexHullVariable` is valid only when `nodes` has exactly one entry, and resolves against that entry's type through the `soleListEntry` resolution (C4). Validation rejects it with two entries.
- Piped text and conditions: a site inside a node entry (its `quickAdd` field's text, its form fields) has the `node` role, resolved against the entry's own `subject`, with the type's label and attributes, whatever the number of entries. `formOf` already finds the entry's own `subject`; `dynamicValueRolesAt` gives the `node` role to a form whose own subject is a node, not only to a form of the stage subject. Stage-level `conditions` about `node` are validated against the set of entry types, through the same type-set path C12 gives the census roles: with one entry as today; with several, a node rule is refused and edge and edge-count rules are allowed.
- Validation rejects an edge entry (`edges[]`) whose type allows no pair among the entries' node types (`edgeTypeAllowsAnyPair`), as for a connect task and a census prompt.
- Migration step N7 builds the first entry from the schema 8 stage's `subject.type`, `quickAdd` and `nodeForm` and removes the stage `subject`. It runs immediately before N8, after every other new step, so every other step still finds the singular stage subject. N8 then finds no stage subject on a Composer and has nothing to rewrite there; the entry's `subject` stays singular.
- Deleting a node type that a node entry names is handled like deleting an edge type that an edge entry names, which differs by host today. In studio-sync (`section-references.ts`) and the in-memory host (`testing/host/protocolStore.ts`) the reference sweep drops the entry, since `nodes[i].subject.type` sits inside a list, and the entry's quick add and form go with it. Dropping a Composer's only entry would leave `nodes` empty, which the shape check refuses, so that deletion answers `ReferencesRemain`, as deleting a stage's only node type does. The sweep checks one section alone (`section-validation.ts` `sectionShapeIssues`) and cannot see the pair rule, so dropping a node entry may leave an edge entry whose type allows no pair among the remaining entries; protocol validation reports it, as it does when a sweep removes a type from another several-type stage. Architect's `deleteTypeAsync` refuses on any type hit (`typeInUse`), as it does for an edge type an edge entry names, so it needs no new branch.
- The interface text `composerAddNode` is retired: each toolbar button's name and tooltip are its entry `label`.
- Until slice 9 the Composer keeps the interim shape slice 2 gave it: `subject: { entity: 'node', types: [t] }` with stage-level `quickAdd` and `nodeForm`.

### C12. Census direction and metadata

- Census pair steps: `packages/interview/src/selectors/dyad-census.ts` `getCensusSteps(codebook, prompt, nodes): Array<{ source: NcNode; target: NcNode }>` replaces `getNodePairs`; for a directed type each unordered pair yields its two directions back to back (skipping one the rules forbid); for an undirected type one step per eligible pair.
- Metadata tuples keep the shape `[promptIndex, a, b, boolean]` (`packages/shared-consts/src/stage-metadata.ts`); for directed prompts `a` is the source and `b` the target and `matchEntry` matches in order; for undirected prompts it matches either order. Synthetic generation writes the same.
- Census roles on a stage with several node types: piped text about `dyadSource`, `dyadTarget` or `focal` offers the label only and validation rejects an attribute (the design). Conditions about those roles (`CONDITION_ROLES`) may hold edge rules and edge-count rules but no node rule, which validation rejects with its own message ("A condition about a node of a census pair cannot test its attributes when the stage has several node types."). `validateConditions` (`schemas/9/schema.ts`) receives the role's node type set instead of a single subject; a one-element set behaves as today. The builder's `ConditionDialog` offers no node rule for those roles on such a stage. This is one of the two rule exceptions in B, recorded in the design beside the label-only piped text; slice 9 reuses the type-set path for a Composer's `node` conditions (C11).
- Direction arrow: `Pair` (`packages/interview/src/components/Pair.tsx`) gains `direction?: 'forward'`, which draws an arrowhead pointing at `toNode`; its accessible text is an English screen-reader-only string.

### C13. Canvas

- `Canvas` (`packages/interview/src/canvas/Canvas.tsx`): `highlightAttribute?: string` becomes `highlightAttributes?: Readonly<Record<string, string>>` (node type to variable id); new `isNodeDisabled?: (node: NcNode) => boolean`; new `allowDrop?: boolean`; the display-only highlight branch goes.
- `DrawerNode` and `NodeDrawer` gain per-node `disabled`.
- `EdgeLayer` (`packages/interview/src/canvas/EdgeLayer.tsx`) groups edges of a directed type by unordered pair: one line per group, an arrowhead at each target present. Lines keep one `data-edge-id` per drawn line; a reciprocal line carries `data-edge-ids="<id1> <id2>"` and `onEdgeSelect` receives every id on the line. Arrowheads are drawn in pixel space and end at the target node's boundary, so lines of directed types stop short of the node centre; undirected lines keep centre-to-centre geometry.

### C14. SyntheticInterview additions (protocol-utilities)

- `addEdgeType({ …, directed?: true, endpointRules?: EndpointRule[] })` (slice 1).
- Stage `subject` input becomes `{ entity: 'node'; types: string[] }`; `initialNodes` accepts a per-type count map on several-type stages (slice 2, used from slice 6).
- `addLayout` and `layout` inputs (slice 3a).
- Sociogram prompt inputs take `task` and, for highlight, `highlight: Array<{ type?: string; variable?: string }>`, filled with ids and created boolean variables (slice 4).
- Narrative preset input: `AddPresetInput.highlight?: boolean | Array<{ label?: TextInput; attributes?: Array<{ type?: string; variable?: string }> }>` (`packages/protocol-utilities/src/types.ts`), replacing `string[] | boolean`; `PresetEntry.highlight` becomes the C7 entry. Ids are filled in and, for a missing variable, a boolean variable is created on each stage type, mirroring the Sociogram highlight input (slice 7).
- Composer stage input takes `nodes: Array<{ type: string; label?: string; quickAdd?: string; form? }>` and no `subject` (slice 9). Its `initialNodes` per-type count map is keyed by the entries' types.
- One-to-Many prompt input takes `focalRole?: 'target'` (slice 8).

## D. Review focus

These are the inputs most likely to hurt a participant or researcher that a
slice's obvious tests would miss. Each slice's tests must include the items it
owns, under the names given.

1. Silent loss of reference validation on a several-type stage (slice 2 builds the guard; slices 6, 7, 8 and 9 make it real for their stage). A `stageSubject` reference on a stage with two types resolves to nothing and is skipped by `validateEntityAttributeReferences`, so a misspelled variable id passes validation and the interview throws. Test name: `rejects an unknown variable on every per-type row of a two-type <Stage>`.
2. Position writes after layouts leave node variables (slice 3a). `updateNode`'s key check rejects layout ids, so every drop, drag, unplace, automatic-layout persist and Composer move throws. Test name: `updateNode accepts a layout id that is not a variable of the node type`.
3. Exporting a session whose nodes hold positions (slice 3a). GraphML throws on an attribute with no key, and CSV writes a raw `{x,y}` object column; the Interviewer schema 8 path loses `_x`/`_y` columns with no type error. Test names: `GraphML declares layout keys for a type that holds a position but has no setting stage`, Interviewer `exportSessions.test.ts` `schema 8 export through Interviewer hands node layouts over as layouts and drops ego and edge ones` (the exporter input; the exported columns are asserted in network-exporters `layoutColumns.test.ts`), and `exportSessions.test.ts` `schema 9 export through Interviewer gives each layout the node types its stages place in it`.
4. Migrated layout names that collide (slice 3a). Two node types each with a layout variable named `layout`, or a layout named like another type's variable or its derived `_x` column, migrate into a protocol validation refuses. Test name: `migration renames layouts whose names would collide`.
5. Narrative showing nodes of other types (slice 3a, extended in slice 7). Narrative shows any node carrying the layout key; once layouts are shared, a node type set by another stage appears on a Narrative that does not include it. Test name: `Narrative shows only nodes of its subject types that hold the preset layout`.
6. Rules about layouts after the layout variable type goes (slice 3a, parity only, C5). Validation, the builder and the summary all looked a rule's attribute up among the node type's variables, so once layouts leave the variables a migrated rule naming a layout is refused, described as an unknown attribute, or silently stops selecting. Test names: `accepts a node rule naming a layout on any node type` (3a), `a stage filter rule naming a layout keeps nodes that hold a position under it` (3a), `describes a rule naming a layout by the layout's name` (3a).
7. One-to-Many direction (slice 8). Today's lookup passes `(target, focal)` reversed; with `focalRole: 'target'` the selected state and deselection must address the edge from list node to focal node, and only that direction. Test names: `focal-as-target selects and deselects the edge from the listed node to the focal node`, `deselecting removes only the asked direction of a reciprocal pair`.
8. Directed census answers and back navigation (slice 8). Order-blind `matchEntry` and `edgeExists` make answering the B to A step pre-fill or overwrite the A to B answer, and back navigation shows the wrong step's answer. Test names: `answering No to the second direction leaves the first direction's edge`, `going back from the second direction shows the first direction's own answer`.

## E. Slices

### Changes to the proposed slicing

- Slice 3 is split into three. 2b (layouts codebook) is additive: the `codebook.layouts` record, its name checks, id rewriting, and every host and Studio path that creates, renames and round-trips it, while no stage can reference a layout yet. 3a (layouts core) flips storage: stage fields, removal of the `layout` variable type, migration, runtime, exporters, synthetic data and the picker. Removing the `layout` variable type breaks the builder pickers, the exporters, the roster loader and synthetic data at compile time, so those stay together in 3a; Studio must know `codebook.layouts` no later than the first protocol that carries one, which 2b provides before 3a. 3b (layouts in the Architect codebook screens and the advisory) follows. The rule editor's layout parity is in 3a, because removing the `layout` variable type breaks the rule editor's tests in the slice that removes it.
- Slice 12 is split into 12a (canonical protocol authoring, translations, compat copies, zips and the canonical and conformance tests) and 12b (cross-browser smoke, pixel baselines, Architect and Interviewer e2e, interface images and the story sweep). Each interface slice runs its own chromium matrix suite (section B), so 12b is not the first run of any scenario.
- The unreachable-layout advisory moves from slice 7 to slice 3b, since it applies to reading Sociograms as much as to Narrative presets; slice 7 extends its tests to several types.
- Locale catalog translations cannot wait for slice 13: every catalog guard requires every locale to be complete at all times. Each slice translates the strings it adds. Slice 13 keeps documentation, the worker reference, changesets, a final cross-catalog terminology pass and the pull request.
- `STAGE_EDGE_TYPE_SUPPORT` is added in slice 1 and deleted in slice 10, so that validation refuses directed types and endpoint rules on each stage until that stage's slice.
- Slice 5 covers export only. Filter and skip logic rules are out of this feature (issue #2725), so network-query is not changed and no slice adds a rule setting.

### Slice 1. edge-model

Goal: directed edge types and endpoint rules exist in the schema, every edge
identity decision goes through the shared helpers, and every stage refuses
directed types and endpoint rules.

In scope: C1, C2, C3, the `STAGE_EDGE_TYPE_SUPPORT` half of C4, conversion of
every identity site, `addEdgeType` options in SyntheticInterview, the
self-loop refusal in the interview store, guard tests. Out of scope: any UI,
arrowheads, census or composer direction behaviour, migration.

Files:

- protocol-validation: `src/schemas/9/codebook/definitions.ts`, `src/schemas/9/codebook/codebook.ts`, new `src/utils/edgeTypeRules.ts`, new `src/schemas/9/stage-capabilities.ts` (edge half only, a leaf per C4), `src/schemas/9/schema.ts` (call `stageEdgeTypeSupportIssues(protocol, collectEntityTypeReferencesFromSchema(ProtocolStructureSchema, protocol))` in the cross-reference `superRefine`), `src/index.ts`, `src/utils/__tests__/entity-type-reference-coverage.test.ts` (count 12 to 14).
- shared-consts: new `src/edge-identity.ts`, `package.json`, `vite.config.ts`.
- interview: `src/store/modules/session.ts` (delete `flipEdge` and `edgeExists`; the `toggleEdge` thunk uses `planEdgeToggle` and `isDirectedEdgeType`; `prepareEdge` refuses `from === to` with an invariant), `src/interfaces/DyadCensus/DyadCensus.tsx`, `src/interfaces/TieStrengthCensus/TieStrengthCensus.tsx`, `src/interfaces/OneToManyDyadCensus/OneToManyDyadCensus.tsx` (lookups use focal as `from` and the listed node as `to`, matching the toggle), `src/interfaces/NetworkComposer/useComposerActions.ts` (`toggleEdge` uses `findEdge`). `FamilyPedigree.tsx:638-647` keeps its ordered compare.
- protocol-utilities: `src/generateNetwork/edges.ts` (`findEdgeForPair` replaced by `findEdge` with direction from the codebook), `src/SyntheticInterview.ts`, `src/types.ts` (`AddEdgeTypeInput`, `EdgeTypeEntry`).

Interfaces produced: C1, C2, C3, `STAGE_EDGE_TYPE_SUPPORT`,
`stageEdgeTypeSupportIssues`.

Migration: the 8-to-9 migration removes `directed` and `endpointRules` from every edge type (`removeEdgeDirection` in `src/schemas/9/migration.ts`). Schema 8 edge types accept any key, so only a hand-edited file carries them; every migrated edge type is undirected with no rules. `migration.test.ts`: `leaves an edge type undirected with no rules when the schema 8 file carries those keys`; `migrates a stage that draws such an edge type`.

Tests:

- `src/utils/__tests__/edgeTypeRules.test.ts`: `an unknown edge type is undirected with no rules`; `undirected rule accepts both orientations`; `directed rule accepts only source to target`; `same-type rule allows two nodes of that type`; `getEligibleOrderedPairs returns both directions for a directed type and one per pair for an undirected type`; `getEligibleOrderedPairs never pairs a node with itself`; `validateNetworkAgainstEndpointRules reports self-loop, duplicate under each identity, missing endpoint and disallowed types`; `reversed duplicate is a duplicate only for an undirected type`; `judges no endpoint types when nodes carry no type`; `reports a missing endpoint only when every node carries _uid`.
- `src/schemas/9/codebook/__tests__/endpoint-rules.test.ts`: `rejects an empty endpointRules`; `rejects a rule naming an unknown node type`; `rejects {A,B} after {B,A} on an undirected type`; `accepts {A,B} and {B,A} on a directed type`; `rejects the same ordered rule twice on a directed type`; `rejects directed: false`.
- `src/schemas/9/__tests__/stage-edge-type-support.test.ts`: for each stage type in the table, `refuses a directed edge type` and `refuses an edge type with endpoint rules`, and `accepts a directed edge type named only in a filter rule`; `accepts a directed edge type named only in a condition's edge-count rule`; `does not judge a stage type outside the table` (a Name Generator with such a condition); `importing stage-capabilities first does not throw` (imports the module before anything else, proving it is a leaf).
- `packages/shared-consts/src/__tests__/edge-identity.test.ts`: `undirected key is the same both ways`; `directed key differs by order`; `findEdge finds the reverse edge only when undirected`; `toggleEdge refuses a self-loop`; `toggleEdge adds the opposite direction of a directed pair`.
- `scripts/invariants/edge-type-field-readers.test.mjs` (a root invariant, so the `//#test:invariants` task re-runs it when any workspace changes): derives its scan roots from the workspace globs in `pnpm-workspace.yaml` (`apps/*`, `apps/studio/*`, `packages/*`, `workers/*`) and scans every non-test `.ts`/`.tsx` under each package root (so Fresco's `lib`, `app`, `components`, `actions`, `hooks`, `queries`, Studio's `api/src` and `web/src` and the protocol review Worker are seen), excluding `node_modules`, `dist`, `.next`, generated output, `apps/architect-classic`, `apps/interviewer-classic` and the vendored `apps/fresco/schema-8`; a self-check asserts the scan visited at least one file under each root. It parses each file and counts as a read any property access (`.directed`, `?.directed`), destructuring of either name (declarations, parameters, and assignments at any depth, including `for...of` heads), and any string or template literal whose dot-separated path has a `directed` or `endpointRules` segment (`['directed']`, `in`, `Object.hasOwn`, `Reflect.get`, lodash `get` paths, `case 'directed':`, a constant later used as a key, a call argument such as `setAttribute('directed', ...)`), unless that string is in a type, a module specifier, or the key of an object literal or class member that is not a destructuring target. A self-test lists sample reads that must and must not match. It fails for any file outside an allow-list holding `edgeTypeRules.ts`, `codebook.ts`, `stage-capabilities.ts` (reads its own table), `migration.ts` (removes the fields from schema 8 edge types) and `SyntheticInterview.ts` (a writer), and for an allow-listed file that no longer reads a field. Later slices add a file to the list only when it reads or writes the codebook fields themselves (writers, `definitions.ts` once it reads a field). A file that uses either word for something other than the codebook field, such as the GraphML attribute name in slice 5, never goes on the whole-file list: that slice adds the narrow exemption it needs (see slice 5).
- `src/utils/__tests__/hashProtocol.test.ts`: `hash changes when an edge type becomes directed`; `hash changes when endpoint rules change`. `hashProtocol` itself is unchanged.
- interview `src/store/modules/__tests__/session.test.ts`: `addEdge refuses a self-loop`; `toggleEdge removes the reverse edge of an undirected type`.
- interview `src/interfaces/OneToManyDyadCensus/__tests__`: `selected state reads the edge from focal to listed node`.
- protocol-utilities `src/generateNetwork/__tests__/edgeReuse.test.ts`: `reuses the reverse edge of an undirected type`.
- FamilyPedigree: `parent edges keep parent as from after the identity change` (existing test file in `src/interfaces/FamilyPedigree/__tests__`).

Stories and e2e: none.

Skills: `finishing-a-refactor`, `writing-an-oracle-that-can-fail`.

Other stages meanwhile: every stage refuses directed types and endpoint rules
through validation; the runtime identity is direction-aware already, so
nothing a valid protocol can do changes.

Done when:
`pnpm --filter @codaco/protocol-validation exec vitest run src/utils/__tests__/edgeTypeRules.test.ts src/schemas/9/codebook src/schemas/9/__tests__/stage-edge-type-support.test.ts src/utils/__tests__/entity-type-reference-coverage.test.ts src/utils/__tests__/entity-attribute-reference-coverage.test.ts src/utils/__tests__/hashProtocol.test.ts`,
`pnpm exec vitest run --config scripts/invariants/vitest.config.mts scripts/invariants/edge-type-field-readers.test.mjs`,
`pnpm --filter @codaco/shared-consts exec vitest run src/__tests__/edge-identity.test.ts`,
`pnpm --filter @codaco/shared-consts build && node scripts/release/verify-publish-exports.mjs @codaco/shared-consts`,
`pnpm --filter @codaco/interview exec vitest run --project units src/store src/interfaces/DyadCensus src/interfaces/TieStrengthCensus src/interfaces/OneToManyDyadCensus src/interfaces/NetworkComposer src/interfaces/FamilyPedigree`,
`pnpm --filter @codaco/protocol-utilities exec vitest run src/generateNetwork`,
then `pnpm agent:test` and `pnpm agent:check`.

### Slice 2. node-subject-types

Goal: every node stage subject is `{ entity: 'node', types: [...] }`, read
everywhere through accessors, with every stage capped at one type.

Order inside the slice:

1. Add the accessors (C4) in protocol-validation, interview, protocol-utilities and protocol-builder, written against the old shape (`[subject.type]`).
2. Convert every reader to them: the 131 interview lines (map `interview-census-forms.md` section 2), `selectors/session.ts`, `selectors/interface.ts`, `selectors/name-generator.ts`, `selectors/protocol.ts`, `selectors/forms.ts`, `selectors/skip-logic.ts`, `contract/rosterData.ts`, `utils/loadExternalData.ts`, `utils/externalData.ts`, `hooks/useExternalData.tsx`, `dynamicValues/DynamicValueScope.tsx`, `forms/useProtocolForm.tsx`, `forms/useValidationNetwork.ts`, `FormDynamicValues.tsx`, `FamilyPedigree/model.ts`, `FamilyPedigree/sharedRecord.ts`, the name generators, roster, bins, AlterForm, SlidesForm, Geospatial, NetworkComposer and Narrative; protocol-utilities `generateNetwork/subject.ts`, `stageHandlers.ts`, `filtering.ts`, `nodes.ts`, `inProgress.ts`, `constraints/*`; protocol-builder `useStageSubject` callers (20 sites), `normalizeSubject`, localization, naming; Architect `TranslationCell.tsx`, `lib/ProtocolSummary/components/Stage/Stage.tsx`, `components/StageEditor/__tests__/networkComposer.roundtrip.test.ts`; studio-sync `section-references.ts` `subjectOfHit` (one hit per type); fresco-ui `src/form/validation/utils/getVariableDefinition.ts`, `utils/collectNetworkValues.ts` and `src/form/store/types.ts` retyped to `ResolvedSubject` (C4), with their tests (`functions.test.ts` and siblings) building resolved subjects without casts; studio-api `src/protocol/__tests__/helpers.ts` (`baseProtocol()`) and `publish.test.ts` (invalidate with `subject.types = ['ghost']`); sketch `apps/sketch/src/server/design/compile.ts` `nodeSubject` emits `{ entity: 'node', types: [t] }` and `__tests__/roster-columns.test.ts` reads `stage.subject.types`, then the goldens are regenerated from the compiler; `packages/protocols/scripts/build-custom-node-shapes-example.mjs` emits `types: [type]` and is re-run.
3. Tighten the loose structural types that accept either shape (`selectors/forms.ts` `Subject`, `sharedRecord.ts` `StageSummary`, `skip-logic.ts` `RoutableStage`, `rosterData.ts`) so that passing a list subject where a single subject is meant is a type error.
4. Flip storage: `nodeStageSubjectFor` and `STAGE_NODE_TYPE_CAPABILITY` (all `'single'`), the walk, `stringAt`, `validation-helpers.ts`, `referenceSubjects.ts`, `dynamic-value-validation.ts`, `schema.ts` per-stage checks, `utils/test-utils.ts`; change the accessor bodies.
5. Builder writers: `SubjectSection` and `EntityTypePickerField` write `types: [t]`; the picker stays single-select.
6. Migration step N8 (below) and its inverse in `schema-8-protocol.ts`. Fixture codemod (rewriting only stage-level `subject` objects, never a nested one); re-save every store.
7. Architect walkthrough: `content/shared/node-type.md` (and any stage file that names the subject field) points at the renamed subject field.

Migration step N8 `nodeSubjectsToTypeLists` in `src/schemas/9/migration.ts`
rewrites only `stages[i].subject` (a Composer node entry's subject, created by
N7, stays singular). It runs after step 12 (the repair steps) and after every new step that later
slices insert (N1 to N7), and before step 13 `joinSingleLineText`. All later
slices insert their steps before it, and N7 (slice 9) runs immediately before
it, after every other new step, so every new step except N7 reads schema 8's
singular `subject.type`.

Tests:

- protocol-validation `src/schemas/9/__tests__/node-stage-subject.test.ts`: `rejects an empty types list`; `rejects a duplicate type`; `rejects a second type on every stage type while its capability is single`; `rejects an unknown node type in types`.
- `stage-subject-resolution.test.ts`: add `NarrativePedigree resolves its source stage's node type` (asserts the resolved type, not only that a resolution is declared).
- `multi-type-stage-references.test.ts` (C4 guard), with its self-check.
- `migration.test.ts`: `turns each schema 8 node subject into a one-element types list`; `leaves edge subjects singular`.
- `localization-migration.test.ts` round trip passes with the inverse in `schema-8-protocol.ts`.
- interview `src/selectors/__tests__/session.test.ts`: `getNetworkNodesForType returns nodes of the stage's types only`; `skip-logic.test.ts`: `a single-type stage with no nodes of its type is skipped`.
- protocol-utilities `generateNetwork.test.ts`: `getStageNodeTypes skips a draft stage with a malformed types value`.
- protocol-builder `SubjectSection.test.tsx`: `writes a one-element types list`.
- studio-sync `section-references` test: `a node type in a stage's types list is a reference to that type only`.

Stories and e2e: update fixtures in stories, capture stories and matrix
scenarios to the new shape; update `option-inventory.ts` keys from
`subject.type` to `subject.types`.

Skills: `finishing-a-refactor`, `verifying-an-interface-change`,
`writing-an-oracle-that-can-fail`.

Other stages meanwhile: every node stage runs with exactly one type; the
capability table refuses more.

Done when:
`pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/9 src/utils src/__tests__/all-interfaces-fixture.test.ts src/__tests__/bundled-protocols-role-conflicts.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project units src/selectors src/forms src/dynamicValues src/contract src/utils e2e/matrix/coverage-manifest.test.ts e2e/matrix/stage-config-schema-support.test.ts`,
`pnpm --filter @codaco/protocol-utilities exec vitest run src`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=unit src/sections src/codebook`,
`pnpm --filter @codaco/studio-sync exec vitest run`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/__tests__/netcanvasFixtureSync.test.ts src/components/StageEditor src/lib/ProtocolSummary`,
`pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/form/validation`,
`pnpm --filter @codaco/studio-api exec vitest run src/protocol`,
`pnpm --filter @codaco/sketch exec vitest run src/server/design`,
from `packages/interview` `pnpm exec playwright test --config e2e/playwright.config.ts --project=chromium-matrix e2e/specs/matrix` (every node stage's scenarios change shape),
`pnpm check:compat-protocols`, then `pnpm agent:test` and `pnpm agent:check`.

### Slice 2b. layouts-codebook

Goal: the codebook can hold layouts, and every host and Studio path creates,
renames and round-trips them, before any stage can reference one.

In scope (from C5): `codebook.layouts` with `LayoutDefinitionSchema` in
`codebook/codebook.ts`; layout keys in the cross-entity record-key uniqueness
check; the name rules and `findLayoutExportColumnConflicts` in shared-consts
`export-columns.ts`; `findPrototypeCodebookKeys`; `CodebookIdRenames.layoutId`
in `codebookIdRewrite.ts` and every caller listed in C5 (`testIds.ts`
`withTestCodebookIds`, protocol-builder `testing/testId.ts`, sketch
`objectIds.ts`, `build-custom-node-shapes-example.mjs`; the
`originalCodebookKeys` and `withOriginalCodebookKeys` layout handling in
`testIds.ts` waits for N2 in 3a); `assignCodebookIds` claiming layout
keys first; the node-variable name scope including layouts
(`variableNameRules.ts`); studio-sync `taxonomy.ts` (`codebookLayout` section
ref), `protocol-document.ts`, `section-validation.ts`; studio-api
`sectionize.ts`; contract `CodebookSectionIdSchema` and
`CreatableSectionKindSchema` gain `codebookLayout`; the Architect host
(`protocolBuilder/handlers.ts`, `sectionWrites.ts` validating with
`LayoutDefinitionSchema`), the in-memory host and the Studio host create and
rename a layout, with `testing/hostResponsibilities.ts` cases;
`packages/protocol-builder/src/host/protocolSections.ts` and
`state/stagedCodebook.ts` (staged layout create).

Out of scope: any stage field, `layoutReference`, `layoutUsage.ts`, removing
`VariableTypes.layout`, migration steps, interview, exporters, synthetic data,
the picker, delete blocking by reference (all 3a).

Interim behaviour: validation accepts a `layouts` record that no stage can
reference yet and nothing reads; a layout may be created and renamed through
the hosts; no migration creates one; schema 8 layout variables still migrate
to node `layout` variables. Deleting a layout is always allowed (nothing can
reference one).

Tests:

- protocol-validation `codebook-layouts.test.ts`: `rejects two layouts with one name`; `rejects a layout named like a node variable`; `rejects a layout whose derived _x column equals a variable's`; `rejects a layout id reused as a variable id`. `codebook-ids.test.ts`: `rewrites readable layout keys through layoutId`; `assignCodebookIds gives a variable a new id when a layout holds its key`. `prototypeCodebookKeys` test: `finds a prototype key in codebook.layouts`.
- shared-consts `export-columns.test.ts`: `findLayoutExportColumnConflicts reports each derived column clash`.
- protocol-builder `variableNameRules.test.ts`: `refuses a node variable named like a layout`; `refuses a node variable whose export column equals a layout's`. `hostResponsibilities` contract cases for `codebookLayout` create and rename.
- studio-sync `taxonomy.test.ts`: `round-trips codebook.layouts` (section id, section validation and assembly). `golden.test.ts` and `property.test.ts` replay command logs on section documents of any kind and know nothing of section ids, so they gain no layout case. studio-api `sectionize.test.ts`: `sectionizes and reassembles codebook.layouts`.

Stories and e2e: none.

Skills: `finishing-a-refactor` (rename callers), `writing-an-oracle-that-can-fail`.

Done when:
`pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/9/codebook src/schemas/9/__tests__ src/utils src/__tests__`,
`pnpm --filter @codaco/shared-consts exec vitest run`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=unit src/fields src/testing src/state src/host`,
`pnpm --filter @codaco/studio-sync exec vitest run`,
`pnpm --filter @codaco/studio-api exec vitest run src/protocol src/protocol-builder`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/protocolBuilder`,
`pnpm --filter @codaco/sketch exec vitest run src/server/design`,
`pnpm test:scripts`, then `pnpm agent:test` and `pnpm agent:check`.

### Slice 3a. layouts-core

Goal: layouts are referenced by Sociogram, Narrative presets and Network
Composer, and the variable type `layout` no longer exists. The `layouts`
record, its name rules, id rewriting and the host and Studio create paths
already exist (slice 2b).

Order inside the slice:

1. protocol-validation: `layout-reference.ts`, walk and collectors, layout hits in `codebookIdRewrite.ts`, `layoutUsage.ts`, filter rules naming a layout (C5: `validateFilterRules` and `filterRuleAttributeExists` accept a key of `codebook.layouts` on a node rule of any type with `LAYOUT_RULE_OPERATORS`; `codebookIdRewrite.filterRuleOwner` resolves layout ids).
2. Stage fields: Sociogram `layout` at stage level (prompts lose `layout`), Narrative `presets[].layout`, NetworkComposer `layout`; delete `layoutVariable` everywhere; remove `VariableTypes.layout`. Coverage guards: the attribute count falls by the three `layoutVariable` tags; the type count is unchanged.
3. Migration steps N1 to N3 (below), their inverses in `schema-8-protocol.ts` (each layout back to a `type: 'layout'` variable on every node type of a stage that uses it, stage and preset `layout` back to `layoutVariable`, split Sociograms left split), and `testIds.ts` `originalCodebookKeys` and `withOriginalCodebookKeys` layout handling (C5).
4. Interview: `selectors/canvas.ts` `getStageLayout` replaces `getPromptLayoutVariable`; Sociogram, Narrative, NetworkComposer and `useComposerActions` use the layout id; Narrative filters by subject types (Review focus 5); store key check (C5, Review focus 2); `utils/createSorter.ts` drops the `'layout'` case; roster: `getParentKeyByNameValue` resolves `name_x`/`name_y` against `codebook.layouts` only, `externalData.ts` reads layout prefixes from `codebook.layouts`, drops the `VariableTypes.layout` case and keeps `{x,y}` merging keyed by layout id.
5. network-exporters: `ProtocolExportInput.layoutNodeTypes`; CSV `planCsvColumns`/`planTypedColumns` add layout claims for a type that has the layout or that any row of the type holds a position for; a layout cell path without a `Variable`; GraphML `keyIds.ts` gains `layout: Map<string, string[]>`, `generateKeyElements.ts` emits layout keys per owning type, `processAttributes.ts` resolves layouts before the external fallback; remove the `'layout'` variable branches. Hosts: `apps/fresco/lib/export/ProtocolRepository.ts`, `apps/interviewer/src/lib/export/exportSessions.ts` with `schema8ExportInput`, every test harness (`__tests__/exportHarness.ts`, `pipeline.test.ts`).
6. protocol-utilities: Sociogram handler writes the stage layout on nodes of every subject type when the stage sets it; Composer positions written by the handler (drop the `stageWrites.ts` layout listing and the `ValueGenerator`, `solver.ts`, `valueSpace.ts` layout cases); `inProgress.ts` clears the stage layout only on setting stages; SyntheticInterview `addLayout`, `buildCodebook` emits `layouts`, `getNetwork` writes positions (C5).
7. protocol-builder and hosts: remove `LAYOUT_TYPE` and every layout variable-type label; new field `fields/LayoutPickerField.tsx` (select an existing layout or create one by name inline through the 2b staged create, name validated by the 2b layout name rules) used by the Sociogram stage section (new `editors/sociogram/sections/SociogramLayoutSection.tsx`, registered in `sections/sectionKeys.ts` as `sociogram-layout`; `NodeLayoutSection` keeps automatic layout), Narrative presets and Composer; `protocol-context.ts` reads `codebook.layouts`. Rule editor parity (C5, showing and editing): `rules/operators.ts` (`ANSWER_SHAPES.layout` and the `'layout'` operand rows go; a layout's answer shape is a point, read through a layout lookup rather than a variable type), `rules/ruleCodebook.ts` (a node type's attribute list appends its layouts from `codebook.layouts` with the existing `unavailableReason`, `unavailableForType: true` and no type of `VariableType`; a stored rule's attribute resolves against the type's variables, then `codebook.layouts`), `rules/ruleDescription.ts`, `rules/ruleCodebookSource.ts` (gains the stages), and the tests and fixtures that assume a `type: 'layout'` variable, rewritten so the same assertions hold for a layout from `codebook.layouts`: `rules/__tests__/fixtures.ts` (`HOME` becomes a key of `codebook.layouts`), `operandMatchability.test.ts` (the `layout` rows of `STORED_CELLS_PER_TYPE` and `OFFERED_PAIRS_PER_TYPE` leave the per-type tables, which follow `VariableTypesKeys`, and a separate assertion pins that a layout is offered no pair), `operandTable.test.tsx:546` (the layout case asserts on the layout lookup instead of `operatorsForSubject('layout')`), `ruleCodebook.test.ts:573-596` and `RuleEditorDialog.test.tsx:916` (unchanged sentences, layout from `codebook.layouts`). Architect `lib/ProtocolSummary/components/Rule.tsx` prints the layout's name through `describeRule`.
8. Deletion (C5, Deletion): `layoutReference` hits are collected first; any hit refuses the deletion with nothing written, and only filter-rule hits go to the sweep. Studio: `studio-sync` `section-references.ts` (route `codebook.layouts.<id>` and add `layoutReferences`; the refusal runs before `removeOneReference`, so a Narrative preset is never dropped; a filter rule naming the layout is swept away with the deletion, as a rule naming a deleted variable is); the same in the in-memory host (`testing/host/protocolStore.ts`); `apps/studio/api/src/protocol-builder/host.ts`. Architect: `apps/architect/src/protocolBuilder/sectionWrites.ts` `deleteLayoutSection` answers `ReferencesRemain` when a `layoutReference` field or a rule (`findRulesNamingLayout`) names the layout, and its comment is rewritten.
9. Sketch: `apps/sketch/src/server/design/compile.ts` emits `codebook.layouts` with one layout per node type that a Sociogram, Narrative or Composer places, named `layout_<nodeTypeName>` normalised to the variable-name rules (today every type's layout variable is named `layout`, which the uniqueness rule refuses), the stage-level Sociogram and Composer `layout` and the preset `layout`, and no `type: 'layout'` variable; `analyse.ts`, `rules.ts` and `burden.ts` stop treating `'layout'` as a built-in attribute id where they read it; goldens regenerated from the compiler. `build-custom-node-shapes-example.mjs` emits `layouts` and the stage `layout` and is re-run.
10. Architect: printable summary `Prompt.tsx` drops the `layout.layoutVariable` row; `Stage.tsx` prints a stage-level Layout row for Sociogram and Network Composer resolving `codebook.layouts`; `Presets.tsx` prints `preset.layout`; the loose `StageConfiguration`, `PresetsProps` and `PromptProps` shapes for these fields are replaced by the schema types so a later rename is a type error; `Stage.test.tsx` fixtures move to the new shape. Walkthrough: `content/Sociogram.md` prompts paragraph rewritten for a stage-level layout and a step for the `sociogram-layout` section; `content/NetworkComposer.md` and `content/Narrative.md` layout steps retargeted to the new field names; `walkthroughSections.test.tsx` gains a field-marker check (each step's `field` resolves to a `data-field-name` in the mounted editor), so a renamed field fails instead of falling back to the section box.
11. Fresco release-test `apps/fresco/release-test/scripts/make-fixtures.mjs` picks the Sociogram by id. `apps/networkcanvas.com/lib/__tests__/protocolPreview.test.ts` expects split stages.
12. Re-save every store. Add a layout task by hand where needed in slice 4, not here; every Sociogram sets its layout in this slice.

Migration steps, inserted after step 12 and before N8, in this order:

- N1 `splitSociogramsByLayout`: a Sociogram whose prompts use different layout variables becomes consecutive stages, one per run of prompts sharing a layout. Each copy keeps the original's id (so `assignProtocolObjectIds` gives each a fresh id and retargets skip logic to the first), label and settings; prompt objects are moved, not cloned.
- N2 `moveLayoutVariablesToLayouts`: each node `layout` variable becomes `codebook.layouts[id] = { name }` with the same id and is removed from its type; Sociogram `layout` takes the run's variable; presets and Composer take theirs. Layout variables on several node types that share one key become one layout, taking the first name in codebook order, with every reference left pointing at it (positions already live on nodes under that key). A layout keeps its id ahead of any other entity's variable holding the same key: `assignCodebookIds`, which runs after N2, claims layout keys first (C5) and gives the other variable a new id with its references rewritten. Name collisions (with another layout, with a variable name on any node type, or through derived export columns) are resolved by renaming the later layout in codebook order to `<name>_<nodeTypeName>`, then `<name>_<nodeTypeName>_2`, and so on, normalised to the variable-name character rules. Filter rules naming a layout variable are left as they are and stay valid (C5).
- N3 `removeEgoAndEdgeLayoutVariables`: drops ego and edge `layout` variables and every filter rule naming one.
- Each step adds a notes bullet in `migration.ts` notes and a message in `src/migration/noteMessages.ts`, translated.

Tests:

- protocol-validation: `codebook-layouts.test.ts`: `rejects a variable of type layout on node, ego and edge types`. `layout-usage.test.ts`: `getNodeTypesWithLayout counts setting stages only`; `a layout no stage references is unused`; `layoutReference hits match getStageLayoutUses on the complete fixture`. `filter.test.ts`: `accepts a node rule naming a layout on any node type` (Review focus 6); `rejects a node rule naming an unknown layout`; `rejects a layout rule with an operator outside LAYOUT_RULE_OPERATORS`. `migration.test.ts`: `splits a Sociogram at each change of layout variable`; `retargets skip logic to the first split stage`; `moves layout variables into codebook.layouts with the same id`; `migration renames layouts whose names would collide` (Review focus 4); `merges layout variables that share a key across node types into one layout`; `a layout keeps its id when another entity's variable has the same key`; `a rule naming a layout variable stays valid when only a Narrative preset used it`; `drops ego and edge layout variables and rules naming them`. `codebook-ids.test.ts`: `rewrites every layout reference`. Both coverage guards updated.
- interview: `skip-logic.test.ts`: `a skip logic rule naming a layout still counts nodes by stored position`. `session.test.ts`: `updateNode accepts a layout id that is not a variable of the node type` (Review focus 2); `updateNode still rejects an unknown key`. `Narrative` units: `Narrative shows only nodes of its subject types that hold the preset layout` (Review focus 5). `getParentKeyByNameValue.test.ts`: `matches name_x to a layout, never to a variable`. `canvas.test.ts` placed/unplaced by stage layout. `selectors/__tests__/session.test.ts`: `a stage filter rule naming a layout keeps nodes that hold a position under it` (Review focus 6; the running half of the C5 parity, with network-query unchanged).
- network-exporters: `columns.test.ts`: `adds layout columns for a type that has the layout`; `adds layout columns for a type that holds a position without a setting stage`; `exportColumns.test.ts` guard extended to layouts; `keys.test.ts`: `GraphML declares layout keys for a type that holds a position but has no setting stage` (Review focus 3). Interviewer `exportSessions.test.ts`: `schema 8 export through Interviewer hands node layouts over as layouts and drops ego and edge ones` and `schema 9 export through Interviewer gives each layout the node types its stages place in it`, which assert the exporter input; `layoutColumns.test.ts` asserts the exported columns (Review focus 3).
- protocol-utilities: `generateNetwork.test.ts`: `writes positions for every subject type of a setting Sociogram`; `Composer writes positions on created nodes`. `SyntheticInterview.test.ts`: `getNetwork writes positions for layouts`.
- protocol-builder: `LayoutPickerField` story and `fieldStories.test.ts`; `layoutPicker.test.tsx`: `creates a layout whose name clashes with no node variable across types`; `hostResponsibilities` contract cases for `codebookLayout` delete: `refuses deleting a layout a stage names` (every host) and `deleting a layout a filter rule names` (the case says which hosts refuse, Architect, and which remove the rule, in-memory and Studio). Rule editor: `ruleCodebook.test.ts`: `lists a layout as unavailable only for node types that have it`; `resolves a stored rule's layout by name from a codebook given without stages`; `RuleEditorDialog.test.tsx`: `opens a stored layout rule by the layout's name`; `opens and saves a stored rule naming a layout its node type does not have`; `ruleDescription.test.ts`: `describes a rule naming a layout by the layout's name` (Review focus 6); the rewritten `operandMatchability`, `operandTable`, `ruleCodebook` and `RuleEditorDialog` layout cases; `RuleSetField` story with a stored layout rule. Architect `lib/ProtocolSummary/components/__tests__/Rule.test.tsx`: `prints a rule naming a layout by the layout's name`.
- studio-sync: `property.test.ts`: `refuses deleting a layout a stage references`. `section-references.test.ts` asserts only how references are classified: `deleting a layout removes a filter rule that names it`; `lists a Narrative preset naming a layout as a stage reference, not a rule`; `lists the stage and the filter rule naming a layout apart`. The refusals are host tests. In-memory host (`testing/host/__tests__/inMemoryHost.test.ts`): `refuses deleting a layout only one preset of a Narrative names, and keeps both presets`; `refuses a layout named by a stage and by a filter rule, and keeps the rule`. Studio (`apps/studio/api/src/__tests__/rpc-protocol-builder.test.ts`, needs a database): `refuses deleting a layout a stage names, and keeps it`; `refuses deleting a layout only one preset of a Narrative names, and keeps both presets`.
- Architect host (`apps/architect/src/protocolBuilder/__tests__/architectRouter.test.ts`): `refuses deleting a layout a stage names`; `refuses deleting a layout a filter rule names`.
- Architect: `Stage.test.tsx`: `prints the stage layout by name`; `prints each preset's layout`. `walkthroughSections.test.tsx`: `'%s names only sections and fields its editor renders'`, proven red by renaming one field.

Stories and e2e: `LayoutPickerField.stories.tsx`; update Sociogram, Narrative
and NetworkComposer stories and capture stories; option inventory keys
`layout` and `presets[].layout`.

Skills: `developing-network-canvas-ui` (before the picker),
`verifying-translations` (picker strings, migration notes),
`finishing-a-refactor`, `verifying-an-interface-change`.

Other stages meanwhile: every Sociogram sets its layout; the Sociogram's
prompts keep the schema 8 prompt model minus `layout`. Rules naming a layout
validate, run, open, are described and print by the layout's name from this
slice. Until slice 3b Architect's Codebook screen has no Layouts section, so a
layout is not listed or deleted there.

Done when:
`pnpm --filter @codaco/protocol-validation exec vitest run src`,
`pnpm --filter @codaco/shared-consts exec vitest run`,
`pnpm --filter @codaco/network-exporters exec vitest run`,
`pnpm --filter @codaco/interview exec vitest run --project units src`,
`pnpm --filter @codaco/interview exec vitest run --project storybook src/interfaces/Sociogram src/interfaces/Narrative src/interfaces/NetworkComposer`,
`pnpm --filter @codaco/protocol-utilities exec vitest run src`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=unit src`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=storybook src/fields/LayoutPickerField.stories.tsx src/fields/RuleSetField.stories.tsx`,
`pnpm --filter @codaco/studio-sync exec vitest run`,
`pnpm --filter @codaco/studio-api exec vitest run src/protocol/__tests__/sectionize.test.ts src/protocol/__tests__/assemble.test.ts`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/components/StageEditor src/lib/ProtocolSummary src/protocolBuilder`,
`pnpm --filter @codaco/interviewer exec vitest run --project=unit src/lib/export`,
`pnpm --filter fresco exec vitest run --project=units lib/export`,
`pnpm --filter @codaco/sketch exec vitest run src/server/design`,
`pnpm --filter networkcanvas.com exec vitest run lib/__tests__/protocolPreview.test.ts`,
from `packages/interview` the chromium matrix suites `e2e/specs/matrix/sociogram.spec.ts`, `narrative.spec.ts` and `network-composer.spec.ts`,
`pnpm check:compat-protocols`, `pnpm test:scripts`, then `pnpm agent:test` and `pnpm agent:check`.

### Slice 3b. layouts-architect

Goal: researchers see and delete layouts in Architect and are told when a
reading stage can never show positions. Rules about layouts already work from
3a.

In scope: Architect codebook "Layouts" section (`apps/architect/src/components/Codebook/Codebook.tsx`, new `components/Codebook/Layouts.tsx`) listing each layout with the stages that set it, the stages that read it and the node types that have it, using `getLayoutUsage`; each node type's entry (`EntityType.tsx`) lists its layouts read-only with links; unused layouts listed with a delete action; a layout that a stage names or that a rule names (`findRulesNamingLayout`, C5) is not deletable, and its entry lists the stages whose rules name it, matching the refusal `deleteLayoutSection` gives from 3a; `getUsageAsStageMeta` handles layout hits and rule uses; printable codebook (`apps/architect/src/lib/ProtocolSummary/components/Codebook.tsx`, `Contents.tsx`); the unreachable-layout advisory as an in-section `<Alert variant="warning">` in the Sociogram layout section and the Narrative preset fields, computed from `protocolContext.orderedStages` with `findUnreachableLayoutReads`, and as a protocol-wide issue in `apps/architect/src/selectors/issues.ts`; Studio `apps/studio/api/src/protocol/diff.ts` and `draft-structure.ts` layout kinds.

Also in scope: add `getLayoutsOfNodeType` (consumed by `EntityType.tsx`) and `findUnreachableLayoutReads` (consumed by the advisory) to `packages/protocol-validation/src/utils/layoutUsage.ts` with the signatures in C5; slice 3a did not add them because nothing consumed them there.

Out of scope: Sociogram task alert (slice 4); the rule editor and `Rule.tsx` (3a).

Tests: protocol-validation `layout-usage.test.ts`: `getLayoutsOfNodeType lists the layouts a stage sets for the type`; `findUnreachableLayoutReads reports a reading use whose types no stage sets the layout for`. Architect `Codebook` tests: `lists each layout with setting stages, reading stages and node types`; `offers delete only for an unused layout`; `does not offer delete for a layout that only a filter rule names`; `a node type entry lists its layouts`. `unreachableLayout.test.tsx`: `warns when a reading stage includes a type no stage sets the layout for`; `does not warn once another stage sets it`. Printable codebook snapshot test updated. Studio `diff.test.ts`: `reports an added layout`.

Stories: `Layouts.stories.tsx` beside `apps/architect/src/components/Codebook/Variables.stories.tsx`
(used, unused, named only by a rule, and read-only layouts).

Skills: `developing-network-canvas-ui`, `verifying-translations`.

Done when:
`pnpm --filter @codaco/protocol-validation exec vitest run src/utils/__tests__/layout-usage.test.ts`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/components/Codebook src/lib/ProtocolSummary src/selectors`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/i18n/__tests__/catalogs.test.ts`,
`pnpm --filter @codaco/architect exec vitest run --project=storybook src/components/Codebook`,
`pnpm --filter @codaco/studio-api exec vitest run src/protocol/__tests__/diff.test.ts`,
then `pnpm agent:test` and `pnpm agent:check`.

### Slice 4. sociogram-tasks

Goal: each Sociogram prompt is one task, with immovable nodes outside layout
tasks and the three disabled-node rules, still on one node type.

Schema: C6 with `highlight` entries built by
`highlightAttributeSchema({ writes: true })` holding exactly the stage's single
type (enforced by "types among the stage's types" plus the capability cap);
`sortOrder` keeps `SortOrderSchema` until slice 6; remove
`sociogramHighlightSchema`, `highlightVariableReference`, the edges refine and
`usageRequiresSibling` if nothing else uses it; Sociogram `behaviours` keeps
`automaticLayout` only. New object-id kind `'highlightAttribute'` (fixture
`complete-localized-protocol.ts` gains one). `layoutUsage.ts` switches the
Sociogram to task-based access. `schema.ts` highlight check runs per entry
against the entry's type. Coverage guards: the type count rises by one
(`HighlightAttribute.type`); the attribute count gains the one entry `variable`
tag and loses every tag instance removed with `sociogramHighlightSchema` and
`highlightVariableReference`; the test comment names each.

Migration step N4 `sociogramPromptsToTasks` (after N3, before N8): a prompt
with `edges.create` becomes `task: 'connect'` (keeping `edges.display`); else
one with `highlight.allowHighlighting` becomes `task: 'highlight'` with one
entry `{ id: createProtocolObjectId(), type: <stage type>, variable }`; else
`task: 'layout'`. A display-only highlight is removed. Sociogram
`behaviours.allowRepositioning` and `freeDraw` are removed. Nothing is added.
Notes bullets: one for the task model, one telling researchers that a
Sociogram with no layout task and no automatic layout now has no step where
nodes are placed. During the re-save, stores whose Sociograms would never place
a node (`interviewer-e2e` json and netcanvas stage 3, `release-smoke` stage 5,
`custom-node-shapes` stages 2 and 5 (edit its generator script), `mental-health-networks`
stage 9, sample Sociograms 20 and 25 if no stage sets their layout) gain a
layout task first, by hand; `fresco-release-test` (schema 8 input) is handled by
editing `make-fixtures.mjs` to add a layout task after migrating. Inverse in
`schema-8-protocol.ts`: a connect task back to `edges.create`, a highlight task
back to `highlight: { allowHighlighting: true, variable }` from its one entry,
a layout task back to neither; removed behaviours are not restored.

Sketch: `compile.ts` maps the sketch prompt tasks `position | connect |
highlight` (`design/schema.ts`) to `task: 'layout' | 'connect' | 'highlight'`,
a highlight with one entry for the stage type, and no `allowHighlighting`;
goldens regenerated. `build-custom-node-shapes-example.mjs` emits tasks
(including the layout tasks below) and is re-run.

Architect: printable summary `Prompt.tsx` prints the task and one row per
highlight entry (node type and variable) in place of the
`highlight.allowHighlighting` and `highlight.variable` rows. Walkthrough:
`content/Sociogram.md` describes the task model and the first-use alert,
`scenes/SociogramScenes.tsx` animates tasks instead of per-prompt layout and
highlight switches.

Runtime: `Sociogram.tsx` switches on `prompt.task`; layout tasks keep drag,
drop and unplace; highlight and connect tasks pass `allowRepositioning={false}`
and `allowDrop={false}`, and `isNodeDisabled` returns true for a node with no
position, for a node whose type has no entry (highlight), and for an invalid
source or target (connect, via `edgeTypeAllowsEndpoints`; with one type and no
endpoint rules on supported types this is only the unplaced rule); highlights
are drawn only during highlight tasks through `highlightAttributes`; the
linking sound plays only in connect tasks; the bucket stays visible with
disabled nodes in highlight and connect tasks. Canvas, DrawerNode and NodeDrawer
changes per C13. Narrative passes `highlightAttributes` built from its current
single-type highlight. Rewrite `Sociogram.allowPositioning.test.ts` to assert
intent: Sociogram never reads `layout.allowPositioning`, and repositioning is
derived from the task alone.

Builder: `SociogramPromptFields.tsx` gains a task selector; per-task fields;
highlight entry row for the stage type (variable picker with inline boolean
creation); connect edge type picker; `SociogramPromptsSection` `beforeSave`;
the first-use alert as an in-section warning in the prompts section when
`isFirstStageUsingLayout` (added to `layoutUsage.ts` in this slice with the
C5 signature and a `layout-usage.test.ts` case, since slice 3a had no
consumer for it) and the first prompt is not a layout task and
automatic layout is off. Architect `ProtocolSummary/components/Stage/Prompt.tsx`
shows the task.

synthetic: `stageHandlers.ts` and `constraints/stageWrites.ts` dispatch on
`task`; highlight writes per entry; connect pairs only placed nodes;
SyntheticInterview prompt inputs (C14).

Tests:

- protocol-validation: `sociogram-tasks.test.ts`: `rejects a highlight task without entries`; `rejects a connect task without edges.create`; `rejects edges.create on a layout task`; `rejects a highlight entry for a type not on the stage`; `rejects a non-boolean highlight variable`; `rejects allowRepositioning on a Sociogram`. `migration.test.ts`: `maps create to connect, allowHighlighting to highlight and the rest to layout`; `drops a display-only highlight`; `adds no layout task`; `a rule naming a layout variable stays valid when the migrated Sociogram has no layout task`. `layout-usage.test.ts`: `a Sociogram with only connect tasks reads its layout`; `automatic layout makes it set`; `isFirstStageUsingLayout is false once an earlier stage names the layout`. `exclusive-variant-containers.test.ts` lists updated.
- interview: `Sociogram.tasks.test.tsx`: `nodes cannot be dragged in a highlight task`; `the canvas refuses a drop in a connect task`; `an unplaced node is disabled in a connect task and enabled in a layout task`; `an unplaced node is disabled in a highlight task`; `a highlight is drawn only during a highlight task`. Narrative units (Canvas props change under it): `repositioning a node on a Narrative writes nothing to the layout`; `free-draw is offered when the stage allows it`. fresco-ui `Node.presentational.test.tsx`: `a disabled custom shape ignores pointer and keyboard activation`.
- protocol-builder: `sociogramPrompts.test.tsx`: `switching task drops the other task's fields`; `first-use alert appears when the first prompt is not a layout task`; `no first-use alert when automatic layout is on`.
- Architect: `Prompt` summary test `prints the task and each highlight entry`.
- protocol-utilities: `generateNetwork.test.ts`: `highlight tasks write only their entry's variable`.

Stories: fresco-ui `Node.stories.tsx` `CustomShapeStates` disabled cell with a
play test; Sociogram stories `HighlightTask`, `ConnectTask`, `LayoutTask` with
plays; capture story updated; builder `SociogramStageEditor.stories.tsx`. Matrix
scenarios: replace `highlight-display-only-with-edges-create`; rework
`automatic-layout-node-drag` and `edges-full-matrix`; add `task-layout`,
`task-highlight`, `task-connect`, `unplaced-nodes-disabled-outside-layout`;
inventory keys `prompts[].task`, `prompts[].highlight[].type`,
`prompts[].highlight[].variable`, `prompts[].edges.create`.

Skills: `developing-network-canvas-ui`, `verifying-translations`,
`finishing-a-refactor` (Canvas props), `verifying-an-interface-change`.

Other stages meanwhile: Narrative keeps its single-variable highlights,
adapted to the map prop.

Done when:
`pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/9 src/utils/__tests__/entity-type-reference-coverage.test.ts src/utils/__tests__/entity-attribute-reference-coverage.test.ts src/utils/__tests__/layout-usage.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/Sociogram src/interfaces/Narrative src/canvas src/components e2e/matrix/coverage-manifest.test.ts e2e/matrix/stage-config-schema-support.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project storybook src/interfaces/Sociogram src/interfaces/Narrative`,
`pnpm --filter @codaco/fresco-ui exec vitest run --project unit src/Node.presentational.test.tsx`,
`pnpm --filter @codaco/fresco-ui exec vitest run --project=storybook src/Node.stories.tsx`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=unit src/editors/sociogram src/locales`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=storybook src/editors/sociogram`,
`pnpm --filter @codaco/protocol-utilities exec vitest run src`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/components/StageEditor src/lib/ProtocolSummary`,
`pnpm --filter @codaco/sketch exec vitest run src/server/design`,
from `packages/interview` the chromium matrix suites `e2e/specs/matrix/sociogram.spec.ts` and `narrative.spec.ts`,
`pnpm check:compat-protocols`, then `pnpm agent:test` and `pnpm agent:check`.

### Slice 5. export

Goal: exports carry the direction of directed edge types, and nothing else in
the exports changes.

In scope: GraphML and the adjacency matrix formatter, tests that pin the
unchanged edge list and node attribute files, and the narrow string exemption
the edge type readers guard needs for the GraphML attribute name. Out of
scope: filter and skip logic rules (issue #2725; network-query is not changed
by this feature), any UI.

network-exporters: GraphML
`src/formatters/graphml/generateDataElements.ts` adds `directed="true"` for
edges of a directed type and keeps `edgedefault="undirected"`; CSV
`src/formatters/csv/adjacencyMatrix.ts` sets only `(source, target)` for a
directed type. Direction is read through `isDirectedEdgeType`. The pipeline's
edge list CSV and node attribute files are not changed; tests below pin that.
The adjacency formatter is not emitted by the pipeline today and stays so.

Readers guard (`scripts/invariants/edge-type-field-readers.test.mjs`): it
counts the attribute name in `setAttribute('directed', 'true')` as a read. Do
not put `generateDataElements.ts` on `ALLOWED_FILES`: it is the exporter file
that decides direction per edge, so it must stay guarded. Instead add to the
guard `PERMITTED_LITERALS`, a map from repo path to the exact literal texts
permitted in that file (here `'directed'` for `generateDataElements.ts`). A
string literal is skipped only when its whole text is listed for its file.
Add a self-test, and a staleness check that fails when a listed file no longer
contains each listed literal. The guard is otherwise unchanged and stays as
strict as it is.

Tests: exporters `createGraphML.test.ts`: `marks edges of a directed type
directed`; `adjacencyMatrix.test.ts`: `a directed type yields an asymmetric
matrix`; `edgeList.test.ts`: `a directed type writes one row per edge, source
to target, with no new column`; `pipeline.test.ts`: `no export file contains
endpoint rules` (a codebook with rules, every output file searched for
`endpointRules`, `sourceType` and `targetType`). Guard self-tests: `a
permitted literal is skipped only in its own file`; `the same literal in
another file is still a read`; `a permitted literal the file no longer holds
fails as stale`.

Stories and e2e: none.

Skills: `writing-an-oracle-that-can-fail`.

Other stages meanwhile: directed types are still refused on every stage, so
the new output is exercised by exporter tests on hand-built sessions.

Done when:
`pnpm --filter @codaco/network-exporters exec vitest run`,
`pnpm exec vitest run --config scripts/invariants/vitest.config.mts scripts/invariants/edge-type-field-readers.test.mjs`,
then `pnpm agent:test` and `pnpm agent:check`.

### Slice 6. sociogram-multiplex-directed

Goal: a Sociogram can include several node types and directed, rule-restricted
edge types.

Schema: `STAGE_NODE_TYPE_CAPABILITY.Sociogram = 'several'`;
`STAGE_EDGE_TYPE_SUPPORT.Sociogram = { directed: true, endpointRules: true }`;
C8 typed sort rules and `nodeTypeOrder` on Sociogram prompts; validation:
a connect task's edge type must satisfy `edgeTypeAllowsAnyPair` over the
stage's types; sort rule types among the stage types; `nodeTypeOrder` a
permutation of the stage types.

Migration step N6a `sociogramSortRulesGainNodeType` (after N4, before N8): each
`sortOrder` rule on each Sociogram prompt gains `type`, the stage's single
type, and an `id` from `createProtocolObjectId()`; `nodeTypeOrder` is not
added. Inverse in `schema-8-protocol.ts`: drop `type` from Sociogram sort rules
and drop `nodeTypeOrder`. Re-save every store.

Coverage guards: the type count rises by two (`NodeTypeSortRule.type`,
`NodeTypeOrderSchema`'s element) and the attribute count by one
(`NodeTypeSortRule.property`); `SortOrderSchema` stays in use by the bins, so
nothing is removed. One-to-Many reuses the same instances in slice 8.

Walkthrough: `content/shared/node-type.md` and `content/Sociogram.md` describe
several node types, typed sort rules and directed connect tasks;
`scenes/SociogramScenes.tsx` updated.

Runtime: `useNodeTypeSortedList` for the bucket; connect tasks disable invalid
sources before the first tap and invalid targets after it, using
`edgeTypeAllowsEndpoints`; directed creation and removal through the thunk
(tap A then B adds A to B; A then B again removes it; B then A adds the
opposite edge); EdgeLayer arrowheads and reciprocal lines per C13; selection
draws no extra marker; `useAutoLayout` adds one link per unordered pair.
`hasNothingToAsk` for a Sociogram counts nodes of any subject type.

Builder: `SubjectSection` becomes multi-select when `nodeTypeCapabilityOf`
returns `'several'`, in subject order; adding a type keeps the stage, removing
one prunes only that type's highlight entries, sort rules and `nodeTypeOrder`
entry (`subjectReset.ts`, `useResetStageOnSubjectChange.ts`); highlight entries
one row per stage type with an optional variable each; sort rows grouped by
type with a type-order control (`SortOrderRows.tsx` parameterised by a
`typed` flag; the bins keep the untyped mode); the connect edge type picker
offers only types for which `edgeTypeAllowsAnyPair` holds.

synthetic: Sociogram handler gathers nodes across types and pairs with
`getEligibleOrderedPairs`; `constraints/entityCounts.ts` counts eligible
ordered pairs for directed types and keys pair sets by stage type set;
`generateNetwork.corpus.test.ts` oracle extended independently.

Tests:

- protocol-validation: `rejects an unknown variable on every per-type row of a two-type Sociogram` (Review focus 1); `rejects a connect task whose edge type allows no pair among the stage types`; `accepts a directed edge type on a Sociogram`. `migration.test.ts`: `Sociogram sort rules gain the stage's node type and no nodeTypeOrder`.
- interview: `Sociogram.directed.test.tsx`: `second tap in the same order removes the edge`; `reverse order adds the opposite edge`; `a node that cannot be a source is disabled before the first tap`; `an invalid target is disabled after the first tap`; `a node of a type with no highlight entry is disabled in a highlight task`. `EdgeLayer.test.tsx`: `draws one line with two arrowheads for a reciprocal pair`; `removing one direction leaves one arrowhead`; `undirected lines still end at node centres`. `useNodeTypeSortedList.test.ts`: `groups by nodeTypeOrder then sorts each group by its own rules`; `falls back to subject order`; `a typed rule on a number variable sorts numerically` (proven red by passing the rule to the sorter whole, C8). `selectors/__tests__/session.test.ts`: `a match-all stage filter on a two-type stage keeps only the type its rules name`; `an edge rule keeps both ends of a directed edge` (the two limits slice 13 documents, pinned as schema 8 behaviour).
- protocol-builder: `SubjectSection.test.tsx`: `adding a type keeps the prompts`; `removing a type prunes only its rows`.
- protocol-utilities: `generated Sociogram edges satisfy endpoint rules` using `validateNetworkAgainstEndpointRules`; `a reciprocal pair counts as two edges`.

Stories: Sociogram `SeveralNodeTypes`, `DirectedConnect`, `ReciprocalEdges`
with plays; capture story; builder `SubjectSection` multi-select story, typed
`SortOrderRows` story. Update `DiamondNodes` only for directed lines. Matrix
scenarios: rewrite `subject-filters-to-node-type` to assert inclusion of both
types; add `several-node-types`, `directed-connect-reverse`, `endpoint-rules-disable`,
`sort-by-node-type`; inventory keys.

Skills: `developing-network-canvas-ui`, `verifying-translations`,
`finishing-a-refactor` (subject reset), `verifying-an-interface-change`.

Other stages meanwhile: Narrative and Composer draw edges through the same
EdgeLayer, but validation still refuses directed types on them, so they never
see arrowheads.

Done when:
`pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/9 src/utils/__tests__/entity-type-reference-coverage.test.ts src/utils/__tests__/entity-attribute-reference-coverage.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/Sociogram src/canvas src/hooks src/selectors e2e/matrix/coverage-manifest.test.ts e2e/matrix/stage-config-schema-support.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project storybook src/interfaces/Sociogram src/interfaces/Narrative src/interfaces/NetworkComposer`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=unit src/sections src/editors/sociogram src/locales`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=storybook src/sections src/editors/sociogram`,
`pnpm --filter @codaco/protocol-utilities exec vitest run src`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/components/StageEditor src/lib/ProtocolSummary`,
from `packages/interview` the chromium matrix suite `e2e/specs/matrix/sociogram.spec.ts`,
`pnpm check:compat-protocols`, then `pnpm agent:test` and `pnpm agent:check`.

### Slice 7. narrative

Goal: Narrative accepts several node types, per-type highlight entries and
directed edges.

Schema: `STAGE_NODE_TYPE_CAPABILITY.Narrative = 'several'`; edge support
true; C7; `groupVariable` rejected with more than one type.

Migration step N5b `narrativeHighlightEntries` (after `addLegendLabels`,
`repairNarrativeLabels` and N4, before N8): each `{ id, variable, label }`
becomes `{ id, label, attributes: [{ id: createProtocolObjectId(), type: <stage
type>, variable }] }`. A highlight whose variable is not boolean is dropped
with a migration note (C7 requires a boolean). `schema-8-protocol.ts`
`legendIds` inverted, and highlight entries inverted back to
`{ id, variable, label }`. Re-save every store.

Coverage guards: the type count rises by one (the Narrative entry's
`HighlightAttribute.type`, a separate instance from the Sociogram's because
`highlightAttributeSchema` builds one per call); the attribute count replaces
the Narrative highlight `variable` tag by the entry's.

protocol-utilities: `AddPresetInput.highlight` and `PresetEntry.highlight`
(C14) in `src/types.ts`, and the preset builder in `SyntheticInterview.ts`
create one attribute per stage type with a boolean variable each.

Architect: printable summary `Presets.tsx` prints each highlight entry's label
with its per-type attributes. Walkthrough: `content/Narrative.md` describes
several node types, highlight entries and groups with one type.

Runtime: Narrative filters to subject types (already from 3a), builds
`highlightAttributes` from the selected entry, offers group regions only with
one type (`PresetSwitcher.tsx` legend reads the single type), draws directed
edges through EdgeLayer.

Builder: `NarrativePresetFields.tsx` highlight entries with a label and one
attribute row per stage type; group variable hidden with several types and
explained beside the field when present; unreachable-layout advisory covers
several types. Subject multi-select (`SubjectSection`, as in slice 6): adding
a type keeps the stage and its presets (each entry gains an empty row for the
new type); removing a type prunes only that type's highlight attribute rows,
and an entry left with no attribute is removed; `groupVariable` is removed
when a second type is added, since it is invalid with several types, and the
group field's place shows the explanation that groups need one node type
(`subjectReset.ts`).

Sketch: `compile.ts` emits Narrative preset highlight entries as
`{ id, label, attributes: [{ id, type, variable }] }`; goldens regenerated.

Tests: protocol-validation `narrative.test.ts`: `rejects groupVariable with two
node types`; `rejects an unknown variable on every per-type row of a two-type
Narrative` (Review focus 1); `a boolean set by a form and highlighted by a
Narrative is not a role conflict`; migration `wraps each highlight in a
per-type entry`; `drops a Narrative highlight naming a non-boolean variable`.
interview `Narrative` units: `one switch lights matching nodes of every type
with an attribute in the entry`; `Narrative shows only nodes of its subject
types that hold the preset layout` extended to two types;
`PresetSwitcher.legend.test.tsx`: `hides groups with two types`. Builder
`narrativePresets.test.tsx`: `writes one attribute row per stage type`;
`SubjectSection.test.tsx` (Narrative): `adding a type keeps the presets`;
`removing a type prunes only its highlight attributes`. protocol-utilities
`SyntheticInterview.test.ts`: `a Narrative preset highlight holds one attribute
per stage type`. Architect `Presets` summary test: `prints each highlight
entry with its attributes`.

Stories: Narrative `SeveralNodeTypes`, `DirectedEdges` with plays; capture
story. Matrix: rewrite `subject-codebook-lookup-and-type-scoping`; add
`several-node-types-highlight`; inventory keys `presets[].layout`,
`presets[].highlight[].attributes[]`.

Skills: `developing-network-canvas-ui`, `verifying-translations`,
`verifying-an-interface-change`.

Done when:
`pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/9 src/utils/__tests__/entity-type-reference-coverage.test.ts src/utils/__tests__/entity-attribute-reference-coverage.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/Narrative e2e/matrix/coverage-manifest.test.ts e2e/matrix/stage-config-schema-support.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project storybook src/interfaces/Narrative`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=unit src/sections src/editors/narrative src/locales`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=storybook src/editors/narrative`,
`pnpm --filter @codaco/protocol-utilities exec vitest run src`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/components/StageEditor src/lib/ProtocolSummary`,
`pnpm --filter @codaco/sketch exec vitest run src/server/design`,
from `packages/interview` the chromium matrix suite `e2e/specs/matrix/narrative.spec.ts`,
`pnpm check:compat-protocols`, then `pnpm agent:test` and `pnpm agent:check`.

### Slice 8. census

Goal: Dyad Census, Tie Strength Census and One-to-Many Dyad Census accept
several node types, endpoint rules and directed edge types.

Schema: the three capabilities `'several'`, edge support true; C9; C8 on
One-to-Many; validation rejects a prompt whose edge type allows no pair among
the stage types; `focalRole` only on directed types; census piped-text roles
(`dyadSource`, `dyadTarget`, `focal`) offer the label only and reject an
attribute when the stage has several types (`dynamic-values.ts`,
`dynamic-value-validation.ts`, `schemaReferenceWalk.ts` `dynamicValueSubject`);
conditions about census roles follow C12 (`validateConditions` takes the
role's type set; on a several-type census a condition about `dyadSource`,
`dyadTarget` or `focal` may hold edge and edge-count rules and no node rule).

Migration step N6b `oneToManySortRulesGainNodeType` (after N6a, before N8):
each `bucketSortOrder` and `binSortOrder` rule on each One-to-Many prompt gains
`type`, the stage's single type, and an `id` from `createProtocolObjectId()`;
no `bucketNodeTypeOrder` or `binNodeTypeOrder` is added. Inverse in
`schema-8-protocol.ts`: drop `type` from those rules and drop both orders.
Re-save every store. Coverage guards: both counts unchanged (One-to-Many
reuses the C8 instances added in slice 6, and `SortOrderSchema` stays in use
by the bins); the files are still run to prove it.

Walkthrough: `content/DyadCensus.md`, `TieStrengthCensus.md`,
`OneToManyDyadCensus.md` and `shared/node-type.md` describe several node types,
directed steps and the focal setting; `scenes/CensusScenes.tsx` shows a
directed pair.

Runtime: `getCensusSteps` (C12) drives Dyad and Tie Strength steps, back steps
and the no-steps path; prompt text is shared by both directions; `Pair`
direction arrow; a direction that exists shows as yes; "No" and "No tie"
remove only the asked direction; each direction has its own strength; ordered
`matchEntry` for directed prompts. One-to-Many: focal sequence from
`useNodeTypeSortedList`; a focal node with no valid partner is skipped; the
list holds nodes for which `edgeTypeAllowsEndpoints` holds in the prompt's
direction; `removeAfterConsideration` only on undirected prompts, with
`lastStep` computed from the filtered focal list; selected state and toggling
in the prompt's direction. `skip-logic.ts` `hasNothingToAsk` treats a census
as having nothing to ask when no prompt has an eligible step. Census node
labels come from `useNodeLabel` regardless of type.

Builder: subject multi-select; `EdgeTypeSection.tsx` offers only types with an
eligible pair; One-to-Many focal setting per directed prompt; text beside
`RemoveAfterConsiderationSection` saying directed prompts list every valid node
on every turn; `templates.ts` keeps `removeAfterConsideration: true`; piped
text sites (`useDynamicValueSite.ts`, `localizedTextNames.ts`) offer the label
only with several types, and `ConditionDialog` offers no node rule for the
census roles with several types; typed sort rows on One-to-Many. Subject
multi-select (`SubjectSection`, as in slice 6): adding a type keeps the stage;
removing a type prunes only that type's One-to-Many sort rules and its
`bucketNodeTypeOrder` and `binNodeTypeOrder` entries, and refuses the removal
with the list of prompts when a prompt's edge type would be left with no
eligible pair (`subjectReset.ts`).

synthetic: `handleDyadCensus` and `handleTieStrengthCensus` use eligible
ordered pairs; ordered metadata for directed prompts; One-to-Many honours
`focalRole`; counts.

Tests:

- protocol-validation: `rejects a dyad prompt whose edge type allows no pair`; `rejects a Tie Strength prompt whose edge type allows no pair`; `rejects a One-to-Many prompt whose edge type allows no pair`; `rejects focalRole on an undirected type`; `rejects an attribute in dyadSource piped text on a two-type census`; `rejects a node rule in a condition about dyadSource on a two-type census`; `accepts an edge-count condition about focal on a two-type census`; `rejects an unknown variable on every per-type row of a two-type One-to-Many` (Review focus 1); migration `One-to-Many bucket and bin sort rules gain the stage's node type`.
- interview: DyadCensus `answering No to the second direction leaves the first direction's edge`; `going back from the second direction shows the first direction's own answer` (Review focus 8); `a direction the rules forbid is skipped`; `an existing direction shows as answered yes`; TieStrength `each direction keeps its own strength`; `No tie removes only the asked direction`; One-to-Many `focal-as-target selects and deselects the edge from the listed node to the focal node`; `deselecting removes only the asked direction of a reciprocal pair` (Review focus 7); `with focalRole target the list holds only nodes the rules allow as sources of the focal node`; `a focal node with no valid partner is skipped`; `removeAfterConsideration is ignored on a directed prompt`; skip-logic `a census whose rules allow no pair is skipped`; DynamicValueScope `census roles give labels only on a two-type stage`.
- protocol-utilities: `directed census metadata keeps source and target order`; `generated census edges satisfy endpoint rules`; `One-to-Many with focalRole target creates edges from the listed node to the focal node`.
- builder: `EdgeTypeSection` `hides edge types with no eligible pair`; `OneToManyDyadCensusPromptsSection` `offers the focal setting only for a directed type`; `offers only the label for census roles on a two-type stage`; `ConditionDialog` `offers no node rule for census roles with two types`; `SubjectSection` (One-to-Many) `removing a type prunes only its sort rules and order entry`.

Stories: `Pair` direction story; DyadCensus, TieStrength, One-to-Many
`Directed` and `SeveralNodeTypes` stories with plays; capture stories. Matrix:
update `dyad-census-fixture.ts` and `tie-strength-census-fixture.ts` to walk
steps; add `directed-two-step`, `endpoint-rule-pairs`, `focal-as-target`,
`remove-after-consideration-directed`; inventory keys `focalRole`,
`bucketNodeTypeOrder`, `binNodeTypeOrder`.

Skills: `developing-network-canvas-ui`, `verifying-translations`,
`verifying-an-interface-change`.

Done when:
`pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/9 src/utils/__tests__/entity-type-reference-coverage.test.ts src/utils/__tests__/entity-attribute-reference-coverage.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/DyadCensus src/interfaces/TieStrengthCensus src/interfaces/OneToManyDyadCensus src/selectors src/dynamicValues src/components e2e/matrix/coverage-manifest.test.ts e2e/matrix/stage-config-schema-support.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project storybook src/interfaces/DyadCensus src/interfaces/TieStrengthCensus src/interfaces/OneToManyDyadCensus src/components/Pair.stories.tsx`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=unit src/sections src/rules src/editors/dyad-census src/editors/one-to-many-dyad-census src/editors/tie-strength-census src/localization src/locales`,
`pnpm --filter @codaco/protocol-utilities exec vitest run src`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/components/StageEditor src/lib/ProtocolSummary`,
from `packages/interview` the chromium matrix suites `e2e/specs/matrix/dyad-census.spec.ts`, `tie-strength-census.spec.ts` and `one-to-many-dyad-census.spec.ts`,
`pnpm check:compat-protocols`, then `pnpm agent:test` and `pnpm agent:check`.

### Slice 9. composer

Goal: Network Composer stores its node types only in its node entries, offers
one add-node button per entry, and draws directed, rule-restricted edges.

Starting point: slice 2 gave the Composer the interim shape
`subject: { entity: 'node', types: [t] }` with stage-level `quickAdd` and
`nodeForm`. This slice replaces that shape with C11: the stage-level
`subject`, `quickAdd` and `nodeForm` go, and every reader of the Composer's
node types moves to the entries.

Schema: C11 (entry `subject` is `NodeEntitySubjectSchema` from C4); the
Composer schema stops using `nodeStageSubjectFor` and has no `subject`;
`STAGE_NODE_TYPE_CAPABILITY.NetworkComposer = 'several'`, which no schema
reads for the Composer (kept for `nodeTypeCapabilityOf` and the guard, C4); edge support true; new object-id
kind `'composerNode'`; validation rejects two node entries naming one node
type and an edge entry whose type allows no pair among the entries' types;
`convexHullVariable` resolves through the new `soleListEntry` declared
resolution in `stage-subject-resolution.ts` (C4) and is rejected with two
entries; `stage-capabilities.ts` `getStageNodeTypes` and
`getSingleStageNodeType` return the entries' types in entry order for a
Composer (the module stays a leaf: it reads the stage value and imports no
schema); `stage-wording/network-composer.ts` `hasInspectorForm` reads entry
forms and `hasGroups` requires one entry; retire `composerAddNode` from
`interface-text-entries.ts` and the interview wording catalogs; new interface
text `composerReverseDirection` ("Reverse direction") and
`composerEdgeDirection` ("{source} to {target}") for the reciprocal sections.
In `schema.ts`: the "type exists in the codebook" check, keyed today on
`'subject' in stage`, gains a rule for node entries that reports an unknown
node type at `['stages', i, 'nodes', j, 'subject', 'type']` (today it is caught
only through `quickAdd`, with a misleading message); the form and quick-add
checks run per entry, with issue paths under `['stages', i, 'nodes', j, …]`;
`collectComposerFieldOverrides` reads each entry's `form` instead of
`stage.nodeForm`; the block `if (stage.type === 'NetworkComposer' &&
stageSubject)` is split so that the edge-entry form checks no longer depend on
a stage subject. Piped text and conditions (C11): `dynamic-values.ts` and
`dynamic-value-validation.ts` (`formOf`, `dynamicValueRolesAt`,
`stageSubjectOf`, `variablesFor('node')`) give a site inside a node entry the
`node` role against the entry's type; `validateConditions` receives the
Composer's entry type set for stage-level `conditions`, through the path C12
adds in slice 8; protocol-builder `localization/useDynamicValueSite.ts`
mirrors it; the interview's piped-text scope for the Composer node form reads
the entry's type.
Coverage guards: the type count rises by one (`NodeEntitySubjectSchema.type`)
and falls by none, because the Composer's stage subject used the shared
`NODE_TYPE_ELEMENT` instance (C4); the attribute tags of `quickAdd` and the
node form move from the stage into the entry schema, which reuses the stage's
`quickAdd` tag and form schema instances, so the attribute count is unchanged.

Guard tests: `multi-type-stage-references.test.ts` reads node types through
`getStageNodeTypes`, so a Composer with two entries is a two-type stage and the
"cut to its first type" step cuts its entries (C4); `convexHullVariable` is
listed in `SINGLE_TYPE_ONLY_FIELDS` with a two-entry fixture.
`node-stage-subject.test.ts` checks the Composer through its entry list
instead of `nodeStageSubjectFor`, with these cases: the stage types checked
through `nodeStageSubjectFor` and the Composer together equal the keys of
`STAGE_NODE_TYPE_CAPABILITY`; `rejects an empty node entry list`; `rejects two
node entries naming one node type`; `rejects an unknown node type in a node
entry`. `stage-subject-resolution.test.ts` covers
`soleListEntry`.

Migration step N7 `composerNodeEntries` (after `addComposerCaptions` and
every other new step, immediately before N8): `subject.type`, `quickAdd` and `nodeForm` become
`nodes: [{ id: createProtocolObjectId(), subject: { entity: 'node', type },
label: nameOrKey(<node type>, type), quickAdd, form: nodeForm }]`, and the
stage `subject` is removed. The label is written as a plain string, as
`addComposerCaptions` does for edge entries, so the localization pass converts
and escapes it. The stage `layout` was set in 3a. N8 finds no stage subject on
a Composer and has nothing to rewrite there; the entry's subject stays
singular. Inverse in `schema-8-protocol.ts`: the first entry back to the stage
`subject: { entity: 'node', type }`, `quickAdd` and `nodeForm`. The inverses
run in reverse step order, so N7's inverse runs right after N8's and before
every other inverse that reads a Composer's node type. Re-save every
store; re-saved stores need the new labels translated for every language the
protocol carries.

Readers of a stage's node types: the interview's `selectors/session.ts`
`getStageNodeTypes` and `getSingleStageNodeType`, protocol-utilities
`generateNetwork/subject.ts` and protocol-builder `useStageNodeTypes`,
`useSingleStageNodeType` and `draftSubjectNodeTypes` read a Composer's entries
(C4). Skip logic (`selectors/skip-logic.ts`), stage filter plumbing
(`getNetworkNodesForType`), form and dynamic value scopes, roster data and
layout usage already ask those accessors and need no other change. Before
finishing, grep every package for raw reads of a stage `subject`, `nodeForm`
or `quickAdd` that a Composer reaches and convert each. Known sites: the
slice 2 traps (`Reflect.get(subject, 'type')`, `value.type`,
`PromptsSection.hasSubject`, `useDynamicValueSite` `subjectOf`, Architect
`TranslationCell.tsx`, studio-api `helpers.ts` and
`protocol-builder-suite.ts`); protocol-validation
`migration/refusedContent.ts` `describePlace` (its `nodeForm` branch, asserted
at `localization-migration.test.ts:806`, becomes a node entry's form);
protocol-builder `localization/localizedTextNames.ts`,
`sections/form-fields/ComposerFormFields.tsx`, `composerMessages.ts`;
interview `e2e/matrix/option-inventory.ts` and `network-composer.scenarios.ts`;
protocol-utilities `stageWrites.ts`; `apps/sketch/src/server/design/burden.ts`.

Hosts: deleting a node type that a node entry names follows C11. studio-sync
`section-references.ts` and the in-memory host `testing/host/protocolStore.ts`
need no new branch (the sweep drops an entry inside `nodes`, and the shape
check refuses an empty list); Architect's `deleteTypeAsync` refuses any type
in use, as for an edge type an edge entry names. The slice adds the tests
below and the `RefactorDeleteEntityType` sentence in
`testing/hostResponsibilities.ts` names the Composer case for each host.

Runtime: `ToolPalette.tsx` one button per entry labelled by `label`, in entry
order; `useComposerStore` add-node tool carries the entry id; `createNodeAt`
takes the entry's type and quick add; validation context per entry type; nodes
of every entry type are shown; with an edge type selected, nodes that cannot
be a source are disabled, and after the first tap nodes that cannot be the
target; directed drawing as on the Sociogram; selecting a reciprocal line
selects both edges and the drawer shows two labelled sections, each with its
form and delete. Decision beyond the design: the Delete key on a reciprocal
selection removes both edges after the existing confirmation path, which names
both; keyboard users otherwise have no path to delete from a selected line,
and each section's own delete still removes one. `reverseEdge` undoable
command in `useComposerActions.ts` keeps attributes and is unavailable when
the opposite edge exists; groups only with one entry.

Builder: the Composer editor has no subject section; its node types are chosen
in the node entries section (`ComposerNodesSection.tsx`, section key
`composer-nodes`), modelled on `ComposerConnectionsSection.tsx`. The
stage-level fields that section holds today (the layout picker from 3a,
`convexHullVariable` and `behaviours.automaticLayout`) move to a new section,
`editors/network-composer/sections/ComposerLayoutSection.tsx`, key
`composer-layout` in `sections/sectionKeys.ts`, placed before
`composer-nodes`, with its own story. Each entry
picks its node type (a type another entry uses is not offered), and has a
label, a quick add and a form. Adding an entry labels it with the type's name
and leaves the quick add empty for the researcher to choose (the save is
refused until it is set); removing an entry removes only it; reordering
changes only the entry order. Removing a node entry, or changing its node
type, is refused with the list of connections when an edge entry's type would
be left with no eligible pair, as slice 8 refuses a census subject change. `convexHullVariable` is removed when a second
entry is added, and the group field shows that groups need one node type. The
connections picker offers only edge types for which `edgeTypeAllowsAnyPair`
holds over the entries' types. The section key `composer-node-form` is retired
from `sections/sectionKeys.ts`, since each entry holds its form.

Architect: printable summary `Stage.tsx` prints a node entries block (label,
type, quick add, form) for NetworkComposer in place of the root subject,
`QuickAdd` and `Form`. Walkthrough: `content/NetworkComposer.md` steps for the
node entries section (fields inside `composer-nodes`), the `composer-node-form`
steps folded into it, and `scenes/NetworkComposerScenes.tsx` shows entries and
a directed edge. Every rewritten step's `field` names a field the editor
renders, and the `NetworkComposer:nodeForm.fields` entry (the last one) and
the `KNOWN_UNMARKED_FIELDS` set itself leave
`walkthrough/__tests__/walkthroughSections.test.tsx`.

Sketch: `compile.ts` emits Composer `nodes: [{ id, subject, label, quickAdd,
form }]` and no stage `subject`, `quickAdd` or `nodeForm`; goldens regenerated.
`build-custom-node-shapes-example.mjs` does the same for any Composer it emits
and is re-run.

synthetic: `handleNetworkComposer` creates nodes per entry and pairs across
entries with eligible pairs; `composerRenderings.ts`, `entityCounts.ts`,
`nodes.ts` per entry; node count bounds stay per stage and are shared by all
entries. SyntheticInterview Composer input per C14 (no `subject`; the
`initialNodes` per-type count map is keyed by the entries' types).

Tests: protocol-validation `network-composer.test.ts`: `rejects two node
entries naming one node type`; `rejects a stage-level subject on a Network
Composer`; `rejects convexHullVariable with two node entries`;
`convexHullVariable resolves against the only node entry's type`; `rejects a
Composer edge entry whose type allows no pair`; `rejects an unknown variable
on every per-type row of a two-type Network Composer` (Review focus 1); `a
Composer node entry's quickAdd resolves against the entry's type on a stage
with two entries` (walk test); `node-stage-subject.test.ts`:
`getStageNodeTypes returns a Composer's entry types in entry order`; migration `builds one node
entry labelled with the type name and removes the stage subject`; `leaves a
Composer node entry's subject singular`; `escapes message syntax in a Composer
node label taken from the type name`. interview `selectors/__tests__/session.test.ts`:
`getNetworkNodesForType on a Composer returns nodes of every entry type`;
`NetworkComposer.addNode.test.tsx`: `each entry adds a node of its own type`;
`NetworkComposer.edges.test.tsx`: `reverse order adds the opposite edge`;
`nodes ruled out by endpoint rules are disabled`;
`NetworkComposer.inspector.test.tsx`: `a reciprocal line shows two sections
with their own delete`; `Delete on a reciprocal selection removes both edges
after confirmation`; `reverse direction keeps form values`; `reverse direction
is unavailable when the opposite edge exists`; `useComposerActions.test.ts`:
`reverseEdge undoes as one step`. `network-composer-fixture.ts` finds buttons
by entry label. protocol-utilities `generateNetwork.test.ts`:
`getStageNodeTypes reads a draft Composer's entries and skips a malformed
one`; `Composer creates nodes of every entry type`; `generated Composer edges
satisfy endpoint rules` (with `validateNetworkAgainstEndpointRules`); `a
reciprocal Composer pair counts as two edges`. Builder
`composerSections.test.tsx`: `adding a node entry keeps the others`; `does not
offer a node type another entry uses`; `removing a node entry removes only
it`; `refuses removing a node entry that leaves a connection without an
eligible pair`; `reordering node entries keeps each entry`; `hides edge types
with no eligible pair`. `ComposerLayoutSection` story and test: `keeps the
layout, group and automatic layout fields at stage level`. Dynamic values:
`dynamic-values.test.ts:558` and `:673` move from `nodeForm` to
`['nodes', 0, 'form', 'fields', 0, 'label']` with the same expected roles;
`a node entry's form offers its own type's attributes on a stage with two
entries`; `rejects a node rule in a Composer condition about the node with
two entries`; `accepts a node rule in a Composer condition about the node with
one entry`; `localization-migration.test.ts:806` describes a node entry's form. studio-sync `__tests__/section-references.test.ts`: `deleting
a node type that one of two Composer node entries names removes that entry`;
`refuses deleting the node type of a Composer's only node entry`.
`testing/host/__tests__/inMemoryHost.test.ts`: the same two cases. Architect
`ducks/modules/protocol/__tests__/codebook.test.ts`: `deleteTypeAsync refuses
a node type that a Composer node entry names`. Architect `Stage.test.tsx`:
`prints each Composer node entry`.

Stories: NetworkComposer `SeveralNodeTypes`, `DirectedEdges`,
`ReciprocalInspector` with plays; capture stories; builder Composer node
entries story and `ComposerLayoutSection` story. Matrix: add `several-node-entries`, `directed-reverse`,
`reciprocal-inspector`; inventory keys `nodes[]`, and the Composer's
`subject.types` key removed.

Skills: `developing-network-canvas-ui`, `verifying-translations`,
`finishing-a-refactor` (Composer node type readers),
`verifying-an-interface-change`.

Done when:
`pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/9 src/migration src/utils/__tests__/entity-type-reference-coverage.test.ts src/utils/__tests__/entity-attribute-reference-coverage.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer src/selectors src/locales e2e/matrix/coverage-manifest.test.ts e2e/matrix/stage-config-schema-support.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project storybook src/interfaces/NetworkComposer`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=unit src/sections src/editors/network-composer src/testing src/locales`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=storybook src/editors/network-composer`,
`pnpm --filter @codaco/protocol-utilities exec vitest run src`,
`pnpm --filter @codaco/studio-sync exec vitest run`,
`pnpm --filter @codaco/studio-api exec vitest run src/protocol`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/components/StageEditor src/components/Localization src/lib/ProtocolSummary src/ducks`,
`pnpm --filter @codaco/sketch exec vitest run src/server/design`,
from `packages/interview` the chromium matrix suite `e2e/specs/matrix/network-composer.spec.ts`,
`pnpm check:compat-protocols`, then `pnpm agent:test` and `pnpm agent:check`.

### Slice 10. edge-form-and-pedigree

Goal: Alter Edge Form shows direction and reciprocal pairs, pedigree stages
keep undirected types, and the temporary edge support table goes.

Alter Edge Form: items ordered so that a reciprocal pair's two edges sit back
to back (first occurrence order); `EdgeHeader` and `JoinedPair` draw source
first and target second with an arrowhead at the target for a directed type,
each node in its own type's style; `JoinedPair` keys by edge id so a reciprocal
swap does not animate as two exits; `edgeFrom`/`edgeTo` piped roles unchanged.

Pedigree: `schema.ts` rejects a FamilyPedigree bound to a directed edge type
and one whose endpoint rules do not allow its node type to itself
(`edgeTypeAllowsEndpoints(codebook, t, personType, personType)`). Delete
`STAGE_EDGE_TYPE_SUPPORT`, `stageEdgeTypeSupportIssues` and its test; replace
it with `pedigree-edge-type.test.ts`. `stage-capabilities.ts` then reads
neither field, so remove it from the readers guard's `ALLOWED_FILES` and
update the guard's header comment in the same slice; the guard's stale-entry
assertion fails otherwise.

Tests: interview `AlterEdgeForm` units: `orders a reciprocal pair back to
back`; `draws an arrowhead at the target for a directed type`.
protocol-validation `family-pedigree.test.ts`: `rejects a directed pedigree
edge type`; `rejects endpoint rules that do not allow person to person`;
`accepts endpoint rules that do`; `every other stage type accepts a directed
edge type`.

Stories: AlterEdgeForm `Directed`, `ReciprocalPair`, `MixedNodeTypes` with
plays; capture stories. Matrix: `directed-edge-header`, `reciprocal-back-to-back`.

Skills: `developing-network-canvas-ui`, `verifying-translations` (only if
strings are added), `verifying-an-interface-change`.

Done when:
`pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/9`,
`pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/AlterEdgeForm src/interfaces/SlidesForm src/interfaces/FamilyPedigree src/interfaces/NarrativePedigree e2e/matrix/coverage-manifest.test.ts`,
`pnpm --filter @codaco/interview exec vitest run --project storybook src/interfaces/AlterEdgeForm`,
`pnpm exec vitest run --config scripts/invariants/vitest.config.mts scripts/invariants/edge-type-field-readers.test.mjs`,
from `packages/interview` the chromium matrix suites `e2e/specs/matrix/alter-edge-form.spec.ts`, `family-pedigree.spec.ts` and `narrative-pedigree.spec.ts`,
then `pnpm agent:test` and `pnpm agent:check`.

### Slice 11. architect-edge-types-and-codebook

Goal: researchers author directed types and endpoint rules in Architect, with
the confirmation and refusals the design describes.

Builder (`packages/protocol-builder/src/codebook/components/CodebookEntityEditor.tsx`,
`CodebookEntityEditorDialog.tsx`, used by inline creation from stage edge
pickers): "Directed" switch; "Allowed connections" rows of two node type
pickers labelled "From"/"To" or "Between"/"and", with add and remove; duplicate
rows refused inline. Switching on a type that stages use asks for confirmation
listing each affected stage and what changes; switching back to undirected
deletes the `directed` key, lists and removes `focalRole` on One-to-Many
prompts, and collapses endpoint rules that become the same unordered pair (A
to B and B to A), keeping the first and saying so in the confirmation, so the
written edge type passes the C1 codebook checks. Filter and skip logic rules
are not touched and the confirmation does not list them, since they ignore
direction. The switch is refused when a FamilyPedigree is bound to the type.
Saving rules that leave any stage without valid work is refused with the list
of stages, computed by a new protocol-validation helper
`findStagesWithoutEligibleWork(protocol, edgeType, codebook)` in
`utils/edgeTypeRules.ts` (connect prompts, census prompts, Composer edge
entries judged against the Composer's node entry types, and pedigree). Contract: new refactor `RefactorSetEdgeTypeDirection`
(`packages/protocol-builder-core/src/contract/schemas.ts`, `group.ts`) with
input `{ edgeTypeId: string; directed: boolean }`, implemented by the
Architect, in-memory and Studio hosts as one multi-section write; covered by
`testing/hostResponsibilities.ts`. New refusals in `codebook/writes.ts`
`CodebookWriteOutcome` and `state/codebookRefusal.ts`:
`edgeTypeBoundToPedigree`, `endpointRulesLeaveStageWithoutWork`,
`nodeTypeNamedByEndpointRule`. Run the readers guard and add to
`ALLOWED_FILES`, each by its full repo path, only the writer files it reports
in the builder, the in-memory host, the Architect host and the Studio host (a
file that only sets a field as an object-literal key is not a read and does
not go on the list, which would make a stale entry); the guard itself is not
relaxed.

Architect: deleting a node type that an endpoint rule names is blocked with its
own copy (`ducks/modules/protocol/codebook.ts`, `deleteTypeAsync`,
`components/Codebook/helpers.ts` endpoint-rule branch in
`getUsageAsStageMeta`); codebook screen and printable codebook show "Directed"
and the rules in words ("People to Organisations"; "between People and
Organisations"); network asset check: `validateAsset(file, codebook)` in
`apps/architect/src/utils/protocols/assetTools.ts` runs
`validateNetworkAgainstEndpointRules` on a JSON network asset whose edges
carry `from`, `to` and a codebook edge `type`, and refuses the asset with the
problems listed; `assetManifest.ts:292` passes the codebook. Asset nodes carry
no codebook type of their own (the interview types them from the stage that
uses them, `packages/interview/src/utils/externalData.ts`), and bundled assets
such as `previousInterview.json` carry neither `_uid` nor `type`. The check
passes asset nodes as they are and relies on C2's rules: endpoint types are
judged only when the edge type is a codebook edge key and both ends resolve by
`_uid` to nodes whose `type` is a codebook node key; otherwise only self-loops,
duplicates and, when every node carries `_uid`, missing endpoints are reported.

Tests: builder `CodebookEntityEditor.test.tsx`: `labels rows From and To for a
directed type`; `refuses the Directed switch when a pedigree uses the type`;
`switching to undirected removes focalRole`; `switching to undirected leaves
filter and skip logic rules unchanged`; `switching to undirected merges rules
that become the same pair`; `the confirmation lists each stage that uses the
type`; `refuses rules that leave a census prompt without pairs`,
`refuses rules that leave a Sociogram connect task without pairs` and
`refuses rules that leave a Composer edge entry without pairs`, each asserting
the listed stages. Contract suite cases for the refactor, including `the edge
type written by switching to undirected passes the codebook checks`. Architect
`Codebook` test: `an edge type entry shows Directed and its rules in words`;
`deleteTypeDialog` test: `blocks deleting a node type named by an endpoint
rule`; `assetTools.test.ts`: `refuses a network asset with an edge the rules
forbid`; `accepts a network asset without typed edges`; `accepts an asset
whose nodes carry no type`; `reports a missing endpoint only when nodes carry
_uid`. Printable codebook test.

Stories: `CodebookEntityEditor` stories for directed with rules, undirected with
rules, and the confirmation; Allowed connections field story under `fields/`.

Skills: `developing-network-canvas-ui`, `verifying-translations`.

Done when:
`pnpm --filter @codaco/protocol-builder exec vitest run --project=unit src/codebook src/state src/locales src/testing`,
`pnpm --filter @codaco/protocol-builder exec vitest run --project=storybook src/codebook`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/components/Codebook src/lib/ProtocolSummary src/utils/protocols src/ducks src/locales`,
`pnpm --filter @codaco/architect exec vitest run --project=storybook src/components/Codebook`,
`pnpm --filter @codaco/studio-api exec vitest run src/__tests__/rpc-protocol-builder.test.ts`,
`pnpm exec vitest run --config scripts/invariants/vitest.config.mts scripts/invariants/edge-type-field-readers.test.mjs`,
then `pnpm agent:test` and `pnpm agent:check`.

### Slice 12a. canonical-protocols

Goal: the canonical protocols exercise every new behaviour, and the canonical
and conformance tests prove it.

Protocols: development protocol gains a directed person to venue type using the
unused `visits` edge type with an endpoint rule; a Sociogram over person and
venue sharing one layout with layout, highlight (one entry per type) and
connect tasks; a census over person with a directed type; One-to-Many with
`focalRole: 'target'`; a Composer with two node entries; a Narrative over two
types reading the shared layout; the person
`anotherLayout` preset is reworked so the advisory does not fire. Sample
protocol gains a directed type on one census. Translations for every new string
in every language each protocol carries. `AUTHORING_GUIDE.md` updated. Sync
compat copies; regenerate both zips.

Synthetic conformance:
`packages/interview/src/forms/__tests__/syntheticDataConformance.test.ts` and
`bundledProtocolFeasibility.test.ts` assert `validateNetworkAgainstEndpointRules`
returns nothing for every generated network; `generateNetwork.corpus.test.ts`
covers directed and several-type shapes. The matrix suites of the interfaces
whose canonical stages changed are re-run natively (chromium) and their aria
baselines adopted.

Skills: `validating-a-protocol`, `verifying-translations`,
`verifying-an-interface-change`, `adopting-a-test-baseline`.

Done when: `pnpm --filter @codaco/protocol-utilities exec vitest run src/__tests__/canonicalProtocols.test.ts src/generateNetwork`,
`pnpm --filter @codaco/interview exec vitest run --project units src/forms/__tests__/syntheticDataConformance.test.ts src/forms/__tests__/bundledProtocolFeasibility.test.ts`,
`pnpm --filter @codaco/protocol-validation build && node packages/protocol-validation/scripts/cli.js packages/protocols/development/protocol.json`,
`pnpm check:compat-protocols`,
`pnpm --filter @codaco/architect exec vitest run --project=unit src/__tests__/netcanvasFixtureSync.test.ts`,
the chromium matrix suites for the changed interfaces, then `pnpm agent:test`
and `pnpm agent:check`.

### Slice 12b. e2e-baselines-images

Goal: every e2e suite, baseline and interface image reflects the finished
model. Every scenario has already run in its interface slice, so a failure here
comes from cross-browser behaviour, pixels or app-level flows.

e2e: run the cross-browser smoke (`firefox-matrix`, `webkit-matrix`) for every
changed interface; regenerate pixel baselines with
`preparing-e2e-visual-baselines`; run `apps/interviewer` e2e
(`conduct-interview.spec.ts` keeps a layout task first); run Architect e2e
(`interfaces/{sociogram,narrative,network-composer,dyad-census,one-to-many-dyad-census,tie-strength-census,alter-edge-form}.spec.ts`,
`codebook-and-summary.spec.ts`, `skip-logic-rules.spec.ts`) and update JSON stage
snapshots, page objects (`editor-sections/sociogram-prompts.ts`) and the
`all-interfaces` fixture; regenerate interface images with
`pnpm generate:interface-images` and restore any unrelated drifted asset.

Sweep: every changed field, section and interface has a story and an
interactive story, and every capture story renders.

Skills: `verifying-an-interface-change`, `running-architect-e2e-tests`,
`preparing-e2e-visual-baselines`, `adopting-a-test-baseline`.

Done when: the cross-browser matrix smoke, Architect e2e and Interviewer e2e
pass, pixel baselines are adopted, and `pnpm --filter @codaco/interface-images test` passes.

### Slice 13. docs-i18n-changesets

Goal: researcher documentation, the protocol review worker reference, the
changesets and the draft pull request.

Documentation in en, es and fr (`apps/documentation/docs`): interface pages for
Sociogram, Narrative, Dyad Census, One-to-Many Dyad Census, Tie Strength Census,
Network Composer, Alter Edge Form, light one-type statements on the name
generators, bins, Alter Form, Geospatial and both pedigrees;
`key-concepts/codebook`, `variables`, `network-filtering` (rules behave as in
schema 8; stated plainly: a "match all" filter on a stage with several node
types keeps only the node type its rules are about, and filters cannot yet
choose the source or the target end of a directed edge, so an edge rule keeps
both ends of a matching edge; a stored rule may name a layout as it named a
layout variable before, and the rule editor lists a layout but cannot build a
rule on it), `skip-logic` (skip logic ignores direction), `piped-text`
(census roles with several node types give the label only, and conditions
about census roles, or about a Network Composer node with several node
entries, hold no node rule); the Network Composer page says that deleting a
node type a node entry names is refused in Architect while the stage uses it
and removes the entry in Studio;
`analyze-data/data-export`, `data-dictionary`;
`get-started/protocol-schema-information` ("What's new in schema 9" and the
migration list); tutorials `building-a-protocol` and `implementing-cegrm`. Run
oxfmt on each `.mdx`, then stamp es and fr with
`pnpm --filter @codaco/documentation translations:stamp <files>`.

Worker: `workers/protocol-review/src/prompt/protocol-reference.ts` describes the
final schema.

Edge type readers guard (`scripts/invariants/edge-type-field-readers.test.mjs`),
which is permanent and stays as strict as it is. Its failure message names
each offending file with the line and text of each read, and tells the
developer exactly what to do, in this order: read the field through the
helpers in `packages/protocol-validation/src/utils/edgeTypeRules.ts`
(`isDirectedEdgeType`, `getEndpointRules`, `edgeTypeAllowsEndpoints` and the
rest of C2); if the name belongs to something unrelated, rename the
identifier; if the file writes the codebook field itself, add its full repo
path to `ALLOWED_FILES` in that test file, or if a string literal uses the
word for something else, add that exact literal for that file to
`PERMITTED_LITERALS` in the same file. The stale-entry failures say which
entry to remove. A self-test asserts that the message for a sample offending
file contains each of those instructions and both constant names, proven red
by removing one. Contributor note: a short section in
`packages/protocol-validation/README.md` on reading edge types through the
helpers and on the guard (there is no root CONTRIBUTING.md). A line in the
root `CLAUDE.md` Code Standards pointing at it is added only with the
product owner's explicit agreement, asked for in the slice's final report.

Final terminology pass across all catalogs with the glossary.

Changesets: normal lane edits the existing schema 9 changesets for
protocol-validation, shared-consts, interview (with architect, interviewer,
fresco), protocol-builder, protocol-builder-core, network-exporters,
protocol-utilities, fresco-ui; Documentation lane for
`@codaco/documentation`; Worker lane for `@codaco/protocol-review-worker`;
Studio lane for `@codaco/studio-sync` with `@codaco/studio-api`. Run
`pnpm check:changesets`.

Pull request: push the branch; create `integration/schema-9-multiplex-directed`
from `origin/main` if it does not exist; open a draft pull request into it.
Comment on #1532 and #1669 to #1674 linking the pull request and the design;
leave them open until the work reaches `main`. Comment on #2725 and #2727
linking the design, saying what schema 9 leaves for them (filter and skip
logic rules as in schema 8; census piped text label only on a stage with
several node types); they stay open.

Skills: `verifying-translations`, `creating-a-changeset`, `ci-and-e2e-policy`,
`shipping-a-pull-request`.

Done when: `pnpm --filter @codaco/documentation exec vitest run lib/__tests__/translations.test.ts`,
`pnpm --filter @codaco/protocol-review-worker exec vitest run src/__tests__/prompt.test.ts`,
`pnpm exec vitest run --config scripts/invariants/vitest.config.mts scripts/invariants/edge-type-field-readers.test.mjs`,
`pnpm check:changesets`, `pnpm agent:check`, and the draft pull request exists.

## F. Coverage

| Design bullet                                                               | Slice                                                                                                                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge `directed` stored only when true                                       | 1                                                                                                                                              |
| `endpointRules` absent, non-empty, types exist, no duplicate pair           | 1                                                                                                                                              |
| Same-type rule, no self-loops                                               | 1 (helpers), 6, 8, 9 (runtime refusal)                                                                                                         |
| Unordered rules for undirected types                                        | 1                                                                                                                                              |
| Migration leaves edge types undirected                                      | 1 (`removeEdgeDirection` strips both keys)                                                                                                     |
| Shared edge helpers, no package reads the fields                            | 1, 5 (`PERMITTED_LITERALS`), 10 (stale entry removed), 11 (writers), 13 (failure message, contributor note); run by every slice; never relaxed |
| Edge identity in shared-consts subpath                                      | 1                                                                                                                                              |
| Node subjects as `types` lists, capability table                            | 2, raised in 6, 7, 8, 9 (the Composer reads its node entries)                                                                                  |
| `codebook.layouts`, positions under layout id, nodes only                   | 2b (record), 3a (references, positions)                                                                                                        |
| Layout name rules including derived columns                                 | 2b (codebook and node-variable scope)                                                                                                          |
| Sets and reads table                                                        | 3a (all Sociograms set), 4 (task-based)                                                                                                        |
| "Has layout" helper                                                         | 3a                                                                                                                                             |
| Unused layouts listed and deletable, referenced ones blocked                | 2b (delete), 3a (refusal in every host; rules swept in Studio, refusing in Architect), 3b (Architect Codebook)                                 |
| Advisory for unreachable reads                                              | 3b, extended in 7                                                                                                                              |
| Migration of layout variables, removal of ego and edge layouts              | 3a                                                                                                                                             |
| Subject change keeps the stage, prunes per-type rows                        | 6, 7, 8; 9 (node entries: add, remove, reorder)                                                                                                |
| Sociogram stage names one layout                                            | 3a                                                                                                                                             |
| Prompt tasks layout, highlight, connect                                     | 4                                                                                                                                              |
| Per-type highlight entries                                                  | 4 (one type), 6 (several)                                                                                                                      |
| Highlights only during highlight tasks                                      | 4                                                                                                                                              |
| Automatic layout sets the layout                                            | 4                                                                                                                                              |
| First-use alert                                                             | 4                                                                                                                                              |
| Disabled nodes and custom-shape proof                                       | 4 (unplaced, highlight), 6 (connect endpoint rules)                                                                                            |
| Per-type sort rules and sort by node type                                   | 6 (Sociogram), 8 (One-to-Many); sorter strips `type` (C8)                                                                                      |
| Sociogram directed creation, removal, arrowheads, reciprocal line           | 6                                                                                                                                              |
| Narrative several types, preset layout, highlight entries, groups, directed | 3a (layout), 7                                                                                                                                 |
| Narrative free-draw and repositioning unchanged                             | 4 (regression tests with the Canvas change)                                                                                                    |
| Name generators one type, no directed change                                | 2                                                                                                                                              |
| Dyad Census                                                                 | 8                                                                                                                                              |
| One-to-Many Dyad Census                                                     | 8                                                                                                                                              |
| Tie Strength Census                                                         | 8                                                                                                                                              |
| Network Composer                                                            | 3a (layout), 9 (node types only in node entries, no stage subject, unique entry types, edge entry pair check, node type deletion)              |
| Bins one type, sort unchanged                                               | 2, 6 (SortOrderRows keeps untyped mode)                                                                                                        |
| Ego Form, Alter Form                                                        | 2                                                                                                                                              |
| Alter Edge Form                                                             | 10                                                                                                                                             |
| Family Pedigree and Narrative Pedigree                                      | 2 (subject), 10 (rules)                                                                                                                        |
| Geospatial, Anonymisation, Information, Language Chooser, Finish Session    | 2                                                                                                                                              |
| Piped text on census stages                                                 | 8 (piped text and conditions, a B exception); 9 (Composer node entry roles and conditions); attributes there are #2727, commented on in 13     |
| Node rules naming a layout                                                  | 3a (validation, reference resolution, deletion, running, showing and editing), 3b (Architect Codebook lists rule uses); parity only            |
| Filter and skip logic rules as in schema 8 (#2725)                          | 6 (limits pinned by tests), 13 (documentation states the limits); no slice changes a rule beyond the two exceptions in B                       |
| Checking a network against endpoint rules                                   | 1 (helper), 11 (Architect assets), 6, 8, 9, 12a (synthetic assertions)                                                                         |
| Edge list unchanged                                                         | 5 (`edgeList.test.ts`)                                                                                                                         |
| Adjacency matrix directed                                                   | 5                                                                                                                                              |
| GraphML directed attribute                                                  | 5                                                                                                                                              |
| Layout columns in attribute lists                                           | 3a                                                                                                                                             |
| Endpoint rules not in exports                                               | 5 (`pipeline.test.ts`)                                                                                                                         |
| Architect Layouts section and node type layout list                         | 3b (tests and story)                                                                                                                           |
| Edge type entry shows direction and rules                                   | 11 (`Codebook` test)                                                                                                                           |
| Directed switch, Allowed connections, inline creation                       | 11                                                                                                                                             |
| Confirmation, undirected cleanup, pedigree refusal                          | 11 (including merged rules; filter rules untouched)                                                                                            |
| Refusal of rules that leave a stage without work                            | 11 (census, connect, Composer)                                                                                                                 |
| Node type deletion blocked by rules                                         | 11                                                                                                                                             |
| Stage editors                                                               | 3a, 4, 6, 7, 8, 9, 10 (with walkthrough and printable summary)                                                                                 |
| Stories, capture stories, interface images                                  | each stage slice (storybook runs in Done when), images in 12b                                                                                  |
| Synthetic positions per type                                                | 3a                                                                                                                                             |
| Synthetic directed identity                                                 | 1 (identity), 6, 8, 9 (`generateNetwork.test.ts`)                                                                                              |
| Synthetic endpoint rules                                                    | 6, 8, 9 (`generateNetwork.test.ts`), 12a                                                                                                       |
| Synthetic directed census and focal setting                                 | 8 (including `focalRole` target)                                                                                                               |
| Migration step 1                                                            | 2 (N8), 9 (N7 removes the Composer subject)                                                                                                    |
| Migration step 2                                                            | 3a (N2, including shared keys and id precedence)                                                                                               |
| Migration step 3                                                            | 4 (N4)                                                                                                                                         |
| Migration step 4                                                            | 3a (N1)                                                                                                                                        |
| Migration step 5                                                            | 4 (Sociogram), 7 (Narrative, N5b, non-boolean dropped)                                                                                         |
| Migration step 6                                                            | 6 (N6a, tested), 8 (N6b, tested)                                                                                                               |
| Migration step 7                                                            | 9 (N7, plain-string label, stage subject removed), layout in 3a                                                                                |
| Migration step 8                                                            | 1, 3a (N3)                                                                                                                                     |
| Canonical protocols re-saved                                                | 2, 3a, 4, 6, 7, 8, 9 (scripts, `check:compat-protocols`), final content in 12a                                                                 |
| Documentation in every language                                             | 13                                                                                                                                             |
| GitHub issues                                                               | 13 (comment on #1532, #1669 to #1674, #2725, #2727), registry issues closed after the work reaches `main`                                      |
