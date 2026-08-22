# Synthetic interview generation — implementation plan

**Date:** 2026-08-20
**Spec:** `docs/superpowers/specs/2026-08-20-synthetic-interview-generation-design.md`
**Status:** approved for implementation
**Shipping shape:** one PR on `claude/synthetic-interview-generation-7b1a23`
carrying the spec, this plan, and the complete implementation. Phases are
commit milestones inside that PR, each landing green
(`typecheck`, `lint`, `knip`, affected package suites). Nothing is deferred
to a follow-up: any issue discovered mid-phase is resolved in-branch before
the phase closes (maintainer's standing rule, 2026-08-20). The only
exclusions are the ones the spec's Out-of-scope section already draws
(Architect authoring UI #1420, classic apps, v9).

---

## Sources of truth

| Source                                                        | What it provides                                                                                                                                                                                                            | How to read it                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` (this branch's base)                                   | the live G1/G2 engine and every consumer; the recovery point for `feasibility.ts`, `entityCounts.ts`, `attributes.ts` bookkeeping, `assignBinValue`, `familyPedigree/` (3 post-fork fixes), the corpus + conformance suites | live tree                                                                                                                                                                                                                             |
| `synthetic-pre-revert-backup` (local branch, tip `14e9b8165`) | the G4 schema surface, resolvers, five simulators, walk skeleton, guards                                                                                                                                                    | `git show synthetic-pre-revert-backup:<path>`; **always diff three-dot** (`git diff main...synthetic-pre-revert-backup -- <path>`) — merge-base is `b6ed3926b`, `main` is 241 commits ahead, and two-dot diffs mix in main-side drift |
| `claude/synthetic-schema-only`                                | **nothing — do not extract from it** (the older #1374-era surface; no burden, no panel/prompt fields, no relative window)                                                                                                   | —                                                                                                                                                                                                                                     |

Thirteen protocol-validation files were changed on both sides since the
merge-base and need hand reconciliation during extraction (list in Phase 1.1).
The G4 branch does not build as a workspace (its consumers still import
deleted symbols) — it is raw material, never a merge source.

## Decision log

Resolutions of every conflict and open question the recon surfaced. Settled;
if implementation proves one unworkable, stop and report rather than
substituting.

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **`DEFAULT_SYNTHETIC_SEED = 42`** (main's live value; PR #1180's shared fixture seed). The branch's `1234` is not adopted. `MAX_SYNTHETIC_INTERVIEWS = 1000`; Fresco's local copy in `apps/fresco/schemas/synthetic-interviews.ts` is replaced by an import from `@codaco/protocol-utilities` in Phase 5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D2  | **`respectSkipLogic` defaults `true`** (spec API); the branch's `false` default and Interviewer's settings default flip accordingly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D3  | **Entry point is `generateInterviews`**; the branch's `generateSyntheticInterviews` name is not kept. The builder class renames to **`ProtocolBuilder`** in the Phase 6 sweep (spec, builder succession) — no alias, no deprecation shim; the 72 importing files change in one mechanical pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D4  | **Single root export.** No new package subpaths; `@codaco/protocol-utilities`'s `exports` stays `{".": "./src/index.ts"}` and the vite build stays single-entry with the **full externals list** (the branch's narrowed externals were an oversight — every runtime dep is externalised, including the newly added `zod`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D5  | **`stageRequiresEncryption` is removed from the runtime deliberately** (SessionPayload relocation, SessionState, the `transitionStage` clear). No code ever sets it true; no host persists it; relocating a dead field would enshrine noise. Named in the `@codaco/interview` changeset as a published-type narrowing. The relocated `shared-consts/session.ts` uses **extension-explicit** imports (`'./network.ts'`) — the branch's extensionless copy violates the package convention.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D6  | **The contract re-export stays** (spec decision 13): `packages/interview/src/contract/types.ts` adds `export type { SessionPayload } from '@codaco/shared-consts';` so both public entries keep exporting it — the branch's deletion is a proven TS2459 defect and is not adopted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D7  | **Stage-availability is a true move**: the branch's network-query addition lands verbatim (it needs no new imports), and `packages/interview/src/selectors/skip-logic.ts` **deletes** its own copy, consuming and re-exporting the moved types (`export type { StageAvailability, UnavailableStage } from '@codaco/network-query';`) so `Navigation.tsx`, `StagesMenu.tsx`, and `useInterviewNavigation.ts` keep their import paths. `getLastAvailableAuthoredStageIndex`, `resolveRecoveryStep`, `NavigableStages`, and every reselect selector stay in the interview package. The seven `buildStageAvailabilityMap` unit cases move to `packages/network-query/src/__tests__/skipLogic.test.ts` (importing through `'../index'`, per that file's convention).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D8  | **Hash boundary mechanics** (spec decision 15, completed): Interviewer hashes the post-migration pre-validation document — `extractZip`'s return widens from `unknown` to `VersionedProtocol` (what `extractProtocolFromZip` genuinely returns) so no cast is needed. Fresco needs **three coordinated edits**: `validateAndMigrateProtocol` returns `{ protocol, documentForHashing }` (the pre-parse input for v8, the migration output for pre-v8); `useProtocolImport` computes one hash from `documentForHashing` for the dedupe check **and** passes it as a new `protocolHash` field on `protocolInsertSchema`; `insertProtocol` uses `input.protocolHash` and drops its own `hashProtocol` call (the third site recon found). The Prisma unique constraint remains the backstop. The v7→v8 script needs **no change** (migration output is inherently parse output on both sides of the boundary; add a comment saying so). Pre-v8 imports therefore hash parse output by construction — decision 15's stability promise is scoped to v8 inputs, and the pre-existing `showAtRiskStatuses` injected default means protocols with a NarrativePedigree stage that omits it take a **one-time** stored-hash shift; the host import-hash test uses the sample protocol (no injected defaults) and a second case documenting the NarrativePedigree shift as expected. |
| D9  | **Recovery point for deleted G2 machinery is `main`**, not `fc2e90158^` — main carries `c7e5ccf46`'s "variable → attribute" string rename (the end-state wording; the branch's ported constraint files are reconciled to it in the same pass) and three `materializeFamilyPedigree` fixes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D10 | **Anonymisation attaches `stageNoDataSynthetic`** (`generatesData: false`, burden 0.1): it writes nothing to the network (passphrase is UI state). `NO_DATA_STAGES` in `stageSyntheticDefaults.test.ts` becomes `{Information, Narrative, NarrativePedigree, Anonymisation}`. The branch's `stageValuesSynthetic` tagging was wrong. FamilyPedigree keeps `stageValuesSynthetic` (it writes entities via the run-level module; it declares no count/topology).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D11 | **Synthetic exports route through `schemas/8/schema.ts`** (`export * from './synthetic/index.ts';`), not through the codebook barrel (the branch's smell). `src/index.ts` additionally names `MAX_SYNTHETIC_POPULATION`, `MAX_SYNTHETIC_PAIRS`, `syntheticCountSupport`, and all ten `Resolved*Synthetic` types (entry-file exports are knip-exempt); `syntheticCountCeiling` is un-exported unless a cross-file consumer exists after extraction. The `synthetic/helpers.ts` type import through the package barrel is rewritten as a direct relative import.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D12 | **All session timestamps are ISO strings end to end.** The branch's `toDateString()` startTime and the builder's live `Date` objects are gone; `StoryInterviewShell`'s coercion layer simplifies accordingly in Phase 6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D13 | **`todayYmd` and `ymdParity.test.ts` are deleted** in Phase 5: their subject (`GenerationConfig.today`'s clock read) no longer exists — the session date is the seeded `startTime`'s date. The C3 conformance harness pins `vi.setSystemTime` to the session's start instant wherever a validator anchors at "today".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D14 | **Bare-fixture tests wrap into parsed protocols.** The four `@codaco/interview` generator tests build `CurrentProtocolSchema.parse({name, schemaVersion: 8, codebook, stages})` via a local helper; `config: { today }` pins become `startWindow` pins.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D15 | **Prompt spread implements the spec's rule**: a stage's drawn count distributes across its prompts so every prompt gets at least one nomination whenever `count ≥ #prompts` (round-robin remainder); below that, earliest prompts win. The branch's plain even-split (`1,0,0` for count 1 over 3 prompts) already satisfies the sub-count case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D16 | **CategoricalBin's regular-bin write unsets `otherVariable`** (the branch omitted it; its own docblock demands it). C4 asserts the unset in both directions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D17 | **Creation draws do not close over rule-tied variables.** A form field with a cross-variable rule whose counterpart the form does not collect draws with the comparator folded only against collected/persisted values — the runtime validator no-ops when either side is unanswered, so G1's `withRuleTiedVariables` closure was a final-state artifact and is not ported into creation scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D18 | **Feasibility is walk-scoped.** `analyseFeasibility` receives the effective stage list — the full protocol normally, the `[0..stopAt.stageIndex]` prefix under `stopAt` — so Architect's preview of stage 3 is never refused by stage 7's roster. Rule 5 holds per call signature. Roster pools: an ABSENT `rosterNodes` map is a caller opting out of the roster contract entirely (pools untracked, no roster refusals — the parity suite's bundled-protocol legs run this way); a PRESENT map missing a stage's key is an unresolved source, and an unresolved-or-known pool `< behaviours.minNodes` refuses pre-seed with a structured conflict naming the stage. PreviewHost's per-asset soft-fail (key absent within a present map) therefore surfaces as an actionable constraint screen instead of silently fabricating people — the intended preview behaviour.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D19 | **Topology realisation mirrors the count pattern**: `protocol-validation` exports a pure `topologyTargetBounds(topology, pairCount) → { min: 0, max: pairCount }` resolver plus the per-metric mapping (density × pairs, meanDegree × n/2); the engine's `sampleTopologyTarget` draws with those bounds exactly as `sampleCount` reads its resolved count's bounds — intersection reads, whitelisted by the C6 guard's receiver-keyed patterns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D20 | **The e2e adapter's unseeded branch** (blank network _and_ blank ego) is expressed as the delegate with `stopAt: { stageIndex: 0 }` — the walk hasn't run any stage, so ego attributes are empty by construction. The adapter keeps hashing its own parsed fixture protocol (test-local identity, never compared to host-stored hashes; one comment records the deliberate divergence from decision 15).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D21 | **Builder `initialNodes`/`initialEdges` translate at delegate time**: `initialNodes: { count: N, promptIndex? }` becomes the owning stage's authored `synthetic.count = { distribution: 'constant', value: N }` before parsing, and explicit entities/values flow through the engine's `overrides` channel (which absorbs `setNodeAttribute` / the `omittedAttributeValue` suppression / `addManualNode`'s no-draw semantics). `getProtocolParsed()` is added to the builder (parse + cache of `getProtocol()` output) — it exists on neither branch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D22 | **`SyntheticDataConstraintError`/`ConstraintConflict` keep their names and shape** (both hosts' failure UIs render them); `US_FAMILY_PEDIGREE_POPULATION` and the five FamilyPedigree types stay exported (the run-level `familyPedigree` option's vocabulary).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D23 | **The showcase protocol relocates** to `packages/protocols/e2e/synthetic-showcase/{protocol.json, assets/colleagues-roster.json}` with a manifest entry (`kind: 'e2e'`, `architectTemplate: false`) in Phase 1, where the role-conflict, bundled-parse, idempotency, and derived-default guards pick it up automatically; the spec's companion-path paragraph updates in the same commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D24 | **`interviewer-e2e/data-management.spec.ts`'s dropout arithmetic is re-derived** against the seeded burden model in Phase 5 (deterministic counts under a pinned seed — a stronger spec than the old probabilistic comment).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

---

## Phase 0 — guards

Objective: the acceptance criteria in executable form, plus the scaffolding
every later phase's tests hang off. No engine behaviour yet.

1. **Create `packages/protocol-utilities/src/synthetic-interviews/`** with:
   - `constants.ts` — exactly `MAX_SYNTHETIC_INTERVIEWS = 1000` and
     `DEFAULT_SYNTHETIC_SEED = 42` (D1), docblock ported from the branch.
   - `utils/invariant.ts` — ported verbatim (23 lines), with a new
     `utils/__tests__/invariant.test.ts` (throw / no-throw / message
     prefix). Landing one real source file makes the guard's source scan
     non-vacuous on day one.
   - `__tests__/schemaOwnsParameters.test.ts` — ported from the branch
     (200 lines) with three adjustments: an added
     `expect(sourceFiles.length).toBeGreaterThan(0)` sanity assertion (the
     recon's "guard that cannot fail" window); a behavioural D1 pin that
     **imports** the two constants and asserts their values (`1000` / `42`)
     — which also gives both new files an importer, keeping the package
     inside `pnpm knip`'s default unused-file analysis (protocol-utilities
     has no knip workspace block; a `readFileSync`-only guard would leave
     `constants.ts` and `invariant.ts` unreachable and red the gate); and
     the bundled-parse + idempotency half kept **here** as the single owner
     (no duplicate in protocol-validation). Note: it needs
     `CurrentProtocolSchema` only — already a dependency.
   - Deliberate spec deviation, stated: the spec's Phase-0 line item
     "corpus harness wiring" is consolidated into Phase 4, where the corpus
     itself is rewritten against `generateInterviews` — main's corpus suite
     keeps running unmodified until then, so there is nothing to wire
     earlier.
2. **Parity project scaffolding in `packages/interview`** (the four
   mechanical constraints recon identified):
   - `vitest.config.ts` gains a third project `parity`
     (`environment: 'node'`, `include: ['__tests__/**/*.test.ts']`, **no
     setupFiles** — the Architect `scripts` project is the in-repo
     precedent);
   - `package.json` `test` becomes
     `vitest run --project=units --project=storybook`… correction: today's
     script names only `units`; it becomes
     `--project=units --project=parity`;
   - `tsconfig.node.json` `include` gains `"__tests__/**/*.ts"`;
   - `knip.json`'s `packages/interview.project` gains `"__tests__/**/*.ts"`.
     The directory ships with a placeholder-free smoke test: create the real
     store headlessly (`store(payload, {onSync})`) and dispatch one `addNode`
     — the proven probe, now pinned as CI signal for the harness itself.
3. **Host import-hash tests** (red until Phase 1's hash change, so they land
   `.todo`-annotated with the failing assertion written and are activated in
   Phase 1 — written first because they are C10's executable form):
   - extend `apps/interviewer/src/lib/protocol/__tests__/importProtocol.test.ts`
     with "an untouched v8 .netcanvas imports with the raw document's hash"
     (assert `saveProtocolMock.mock.calls[0][1] === hashProtocol(rawJson)`)
     using the in-file `buildArchive` apparatus;
   - create `apps/fresco/hooks/__tests__/useProtocolImport.test.tsx`
     (Fresco's first import-flow test; `vi.hoisted` + `renderHook` per the
     `useUploadAssets.test.tsx` precedent) asserting the dedupe hash and the
     `insertProtocol` `protocolHash` agree and equal the raw document's;
   - both host tests additionally drive a **showcase archive** (authored
     stage/panel/prompt/variable `synthetic` blocks) through the import
     flow and assert success — C10's "imports cleanly into Interviewer and
     Fresco" leg, which otherwise had no phase item. Red until Phase 1
     lands the schema; activated with the hash assertions.
4. Nothing else moves. The old engine and its entire suite remain live and
   green (they stay so through Phase 4 and die in Phase 5).

Gate: `pnpm --filter @codaco/protocol-utilities --filter @codaco/interview
test`, `pnpm typecheck`, `pnpm lint:fix`, `pnpm knip`.

## Phase 1 — schema surface, relocations, hash boundary, Architect carries

Objective: the protocol format knows `synthetic`; the two symbols the engine
needs live where decision 13 requires; hashes are stable; Architect cannot
destroy authored parameters. Still no engine.

### 1.1 Extract the G4 schema surface

Extraction is per-file `git show synthetic-pre-revert-backup:<path>`
reconciled against main. New files land verbatim (modulo D11's import-path
fix): `src/shared/synthetic/helpers.ts` (445), `src/schemas/8/synthetic/index.ts`
(597), `src/schemas/8/synthetic/helpers.ts` (93),
`src/utils/resolveVariableSynthetic.ts` (788), and the seven test files
(`synthetic.test.ts` 1981, `resolveVariableSynthetic.test.ts` 636,
`stageSyntheticDefaults.test.ts` 172, `stageCountBehavioursWindow.test.ts`
237, `defaultSyntheticCount.test.ts` 183, `zeroVariancePoissonFloor` 39,
`zeroVarianceDatetimeIntersection` 70, `composerFixedAnchorWindow` 44).

Modified files reconcile against main's copies. The 13 both-sides files:
`src/index.ts`, `common/panels.ts` (**keep main's `assetReference`
dataSource**; the G4 `Panel` hand-written type's `dataSource` re-uses the
branded union), `common/prompts.ts`, `schema.ts`, `variables/variable.ts`,
`utils/collectEntityAttributeReferences.ts`, and the stage files
`ego-form/family-pedigree/geospatial/information/name-generator-roster/`
`narrative-pedigree/network-composer` — for the three
`withStageSubjectResolution`-wrapped stages the `synthetic:` field goes
**inside** the wrapped `.extend({...})`, never after the wrapper.

Per-stage attachments land exactly as the recon's table (values/edge
`.prefault({})`; no-data `.prefault({generatesData: false})` — **including
Anonymisation per D10**; NetworkComposer's full default block; the three
name generators `.optional()` + `withResolvedSyntheticCount` +
`requireCountWithinBehaviours` + `requireDrawableCount`), plus the panel
transform, the CategoricalBin prompt attachment on both narrowed branches,
the nine variable-branch descriptors with their refinements, the
`stages/index.ts` exhaustiveness assertion, and the three composer-rendering
validators with their two `schema.ts` call sites and the CategoricalBin
selection-count rule.

Companions that MUST land in the same commit:

- the `collectEntityAttributeReferences` discriminated-union `unwrap()` fix
  (main still has the unfixed form; without it every reference inside the
  three name-generator stages vanishes from the collector the moment the
  transform lands);
- ZodPipe tolerance in the two main-side tests that map `.shape` over
  `stageSchema.options`:
  `schemas/8/__tests__/stage-subject-resolution.test.ts:285,294` and
  `packages/protocol-utilities/src/__tests__/generateNetwork.test.ts:34`
  (alive until Phase 5), using the branch's unwrap idiom
  (`option instanceof z.ZodPipe && option.in instanceof z.ZodObject ? option.in : option`);
- the third schema-shape reader, which needs a **key-sweep** fix rather
  than pipe tolerance:
  `packages/interview/e2e/matrix/coverage-manifest.test.ts` sweeps every
  top-level stage key outside `BASE_KEYS` (and every prompt key) into the
  option inventory, so the new `synthetic` keys would demand scenario
  claims no scenario can make until Phase 6. Add `'synthetic'` to
  `BASE_KEYS` (:51) and skip `prompts[].synthetic` beside the existing
  `id` skip (:108), commented as authoring-time generation metadata the
  runtime never renders. Its `unwrap` already peels `ZodPipe`, as does
  `stage-config-schema-support.test.ts`'s — neither needs pipe work, and
  the latter needs no change at all;
- exports per D11; `package.json` gains the `@codaco/protocols`
  devDependency (`stageSyntheticDefaults.test.ts` consumes the development
  protocol);
- the new schema constants the spec requires that exist nowhere yet:
  `SYNTHETIC_SECONDS_PER_BURDEN`, the lognormal clock-jitter parameters,
  `SYNTHETIC_START_WINDOW_DAYS = 7`, `GEOSPATIAL_OUTSIDE_AREAS_PROBABILITY`,
  and D19's `topologyTargetBounds` — each with a calibration docblock,
  landing beside `DEFAULT_RESPONSE_BURDEN`;
- `resolveVariableSynthetic` closes its one gap vs the 2026-08-19 table: the
  **bin-only** implied rule joins `collectInterfaceImpliedRules` (today it
  lives only in protocol-utilities' `binOnlyVariables.ts`; the collector
  gains the same schema-tag walk so the rule has one home; the engine's copy
  becomes a consumer in Phase 2).

### 1.2 Relocations

Part A (SessionPayload): branch `shared-consts/src/session.ts` shape with
extension-explicit imports and **without** re-adding
`stageRequiresEncryption` (D5 removes it runtime-wide:
`contract/types.ts`, `store/modules/session.ts` state + `transitionStage`
reset). `contract/types.ts` re-imports and **re-exports** it (D6);
`StageMetadataEntry` + `ts-utils.ts` come along (the engine consumes them in
Phase 2). No exports-map or dependency changes anywhere (verified: every
consumer already reaches shared-consts).

Part B (stage availability): per D7. After the move,
`selectors/skip-logic.ts` replaces its now-unused
`isStageSkipped`/`resolveSkipLogicDestinationIndex` import block with the
`buildStageAvailabilityMap`/`RoutableStage` import, keeps
`getLastAvailableAuthoredStageIndex`/`resolveRecoveryStep`/selectors, and
re-exports the moved types.

### 1.3 Hash boundary

Per D8, with the tests from Phase 0 activated. Blast-radius notes carried
into code comments: the Interviewer hash is the Dexie row id and every asset
row's prefix; Fresco's stored hash must equal the dedupe hash by
construction (one computation, threaded).

### 1.4 Architect survival

- `withStageIdentity` gains the unconditional `synthetic` carry (the
  committed value merged back exactly like `id`/`type`; `prune` strips the
  `undefined` case so fresh stages are byte-identical — zero e2e JSON
  snapshot movement, verified mechanism);
- `NodePanels` panel carry is the closed three-part change: a fifth
  `useStageFormValue` read + memo key in `usePanelAt`, a fifth
  `setStageValue` in `writePanelAt`, and a `HiddenFieldValue`
  registration for `panels[N].synthetic` beside the id registration;
- unit guards: extend `StageEditor.test.tsx`'s committed-skipLogic describe
  with the three `synthetic` analogues; add the `panels[n].synthetic`
  add/reorder/toggle-off case to `NodePanels.identity.test.tsx` via
  `renderStageForm`; extend `interfaces.skipLogic.test.ts` with the
  "no interface authors synthetic yet, so the carry is unconditional" guard;
- e2e: new `apps/architect/e2e/specs/synthetic-round-trip.spec.ts` — seed a
  `NameGenerator` stage carrying stage-, panel-, prompt-, and
  variable-level blocks; open; edit an unrelated field; save; assert via
  `readProtocolJson` (with `until`) that all four blocks survive
  byte-identically. Untagged (native lane). The
  `00-sample-protocol.spec.ts` whole-document oracle stays untouched as the
  no-invented-defaults tripwire;
- `synthetic` is **not** added to `CODEBOOK_PROPERTIES` or any
  `replaceProperties` set (that is what preserves it through variable
  edits).

### 1.5 Showcase relocation + changeset

Move the showcase per D23; add the manifest entry; update
`packages/protocols/manifest.json`, the spec's companion paragraph, and
delete the docs copy. The showcase now parses under the new schema
(authored blocks and all — already verified against the branch validator)
and enters the role-conflict, bundled-parse, idempotency, and
derived-default sweeps automatically.

Single normal-lane changeset (the `sparse-entity-attributes.md` precedent):
`@codaco/protocol-utilities` major, `@codaco/protocol-validation` minor,
`@codaco/shared-consts` minor, `@codaco/network-query` minor,
`@codaco/interview` major (type narrowing D5 + edge-id channel in Phase 2),
`@codaco/architect` / `@codaco/interviewer` / `fresco` /
`@codaco/protocols` patch-or-minor. Written once here, amended as phases
add reader-facing surface.

Gate: everything in Phase 0's gate plus
`node packages/protocol-validation/scripts/cli.js` over the relocated
showcase (post-build), `pnpm --filter @codaco/architect test`, and the
Architect e2e native lane for the new spec. Phase 1 auto-selects the
Architect/Interview/Interviewer e2e suites via the dependency closure —
expected, budgeted.

## Phase 2 — session engine, walk, and the parity oracle

Objective: `generateInterviews` exists end to end for the five built
interface types, with sessions proven identical to the real store's.

New structure under `synthetic-interviews/`:

```
session-engine/actions.ts    SyntheticSessionAction union (engine-owned,
                             payload-for-payload with the runtime thunks)
session-engine/engine.ts     primitives + fold (reducer semantics: key
                             validation w/ allowUnknownAttributes on node
                             adds for roster+pedigree, patch null-drop and
                             unset-delete, promptID accumulation,
                             additional-attribute overwrite/reconciliation,
                             deleteNode cascade + census-tuple pruning,
                             both-direction toggleEdge dedupe, index-keyed
                             updateStageMetadata, lastUpdated from the
                             clock), optional trace capture
session-engine/streams.ts    per-session substreams derived from
                             seed + index: values, ids (uuid-format),
                             counts, coins, dropout dice, clock jitter —
                             adding a draw on one never shifts another
session-engine/clock.ts      startWindow draw; per-stage advance =
                             responseBurden × SYNTHETIC_SECONDS_PER_BURDEN
                             × lognormal jitter; writes spread in-stage
session-engine/envelope.ts   SessionPayload finalisation (ISO everywhere,
                             finishTime for completes, stageMetadata only
                             when non-empty) + SyntheticInterviewResult
walk/route.ts                nextStageIndex over the relocated
                             buildStageAvailabilityMap + FINISH_SENTINEL
walk/walk.ts                 the per-session linear walk: route → simulate
                             → burden/clock → dropout roll → advance;
                             stopAt (stage and prompt bounds); trace.
                             A stage type with no simulator THROWS a
                             structured "no simulator for stage type X"
                             error — never a silent no-op, which would be
                             a second model of stage behaviour (rule 1).
                             The dispatch table is total from Phase 3 on;
                             during Phase 2 it covers the five built types
                             plus the no-op content simulators below
walk/dropout.ts              branch module re-seated on the dice substream
index.ts                     options schema (spec verbatim: floor D-,
                             stopAt, startWindow, familyPedigree,
                             captureTrace, D2's respectSkipLogic: true),
                             batch loop, deterministic floor top-ups
                             (decision 20), onProgress, feasibility call
                             (stubbed pass-through until Phase 4, marked
                             by a failing-on-purpose C12 `.todo`)
```

Ports re-expressed against the engine: the five simulators +
`simulators/shared/*` (their decisions stand; their direct mutations become
primitive calls; provenance already correct), **plus the three no-op
content simulators the spec's Phase 2 names — Anonymisation, Information,
Narrative — as one shared burden-only implementation** (NarrativePedigree
joins them in Phase 3 item 8), `utils/{eligibleNodes,
sampleCount, panels}`, `value-generators/*`, `constraints/*` per the
recon's ledger — **plus** the two G2 pieces the branch dropped that the spec
says carry over unchanged: the `unique` reservation bookkeeping from main's
`generateNetwork/attributes.ts` (prompt-fixed + roster holds/claims) and
`assignBinValue`'s out-of-band write registry. D15 (prompt spread), D16
(other-variable unset), D17 (no creation closure) apply here.

The runtime gains the **edge-id injection channel**: `addEdge` and
`toggleEdge` accept optional `modelData: { [entityPrimaryKeyProperty] }`
exactly like `addNode` (thunk uses it over its minted uuid; reducer
unchanged). Two-file change + unit cases in
`store/modules/__tests__/session.test.ts`.

The parity suite (`packages/interview/__tests__/replayParity.test.ts`)
implements C1 in full: dispatch the trace through the real store (ids
injected; `setPassphrase` unused — decision 17), assert deep-equality with
the fold (clock normalised; absent-vs-false equivalence), zero rejections,
route parity at every `transitionStage`, and drop-out `currentStep` equal to
the runtime-computed resume position. **Phase 2's legs run over
purpose-built fixtures restricted to the built types** (builder recipes
constructed in the test — the dev/sample protocols contain unbuilt types
and would hit the structured throw); the full-protocol legs over the
development, sample, and showcase protocols move to the end of Phase 3,
and the corpus leg switches on in Phase 4.

C5 (stopAt-prefix equality + trace stage attribution), C8's **model** tests
(monotonicity, skipped-stage zero-burden, N-mixed + floor semantics — over
the same built-type fixtures), and C9 (byte-identical batches incl.
ids/timestamps; n→n+1 prefix scoped to floorless runs; deterministic
top-ups) land here. C8's 50 000-run sample-protocol calibration within
±1.5 pp requires the full simulator matrix and lands at the end of
Phase 3 — where it is also more honest, since the branch's 10.6 %
measurement was itself taken with only five simulators. The branch's
`generateSyntheticInterviews.test.ts` assertions port with the harness
adjustments recon enumerated.

## Phase 3 — the remaining fourteen simulators

Each simulator lands with its C4 property tests in the same commit, written
from the spec's fidelity row and the runtime source cited there. Order (by
dependency, censuses after topology):

1. **NameGeneratorRoster** — roster pool via `assetData.rosterNodes`
   (stage-id keyed; `collectRosterExternalData` remains the producer),
   `modelData._uid` = roster uid, attributes verbatim +
   `allowUnknownAttributes`, uniform draw without replacement, network
   dedupe, D18's pool semantics.
2. **Topology consumption** + **Sociogram** (layout for every subject node,
   `toggleEdge` creation per drawn target, highlight via the boolean
   descriptor, create/highlight exclusivity).
3. **DyadCensus** (per prompt × pair yes/no; tuples both signs, replace
   same-pair-same-prompt, node-list order), **TieStrengthCensus**
   (edgeVariable ordinal on every yes; negatives-only tuples),
   **OneToManyDyadCensus** (toggleEdge only; **no metadata**;
   `removeAfterConsideration` pair-once).
4. **AlterForm / AlterEdgeForm** (stage-filtered iteration in network
   order; patches over exactly the form's fields; zero-item pass-through).
5. **Geospatial** — string values drawn from
   `assetData.geojsonPropertyValues[stageId]` or the sentinel; the
   `collectGeospatialPropertyValues` helper joins the interview contract
   (fetch + pluck `targetFeatureProperty`, Node-safe like its roster
   sibling); the outside-areas share reads the Phase 1 constant.
6. **NetworkComposer** — quickAdd nodes at grid positions, per-edge-type
   topology, inspector-form descriptors, hull membership `string[]`; the
   ported `composerRenderings` overlay gains its consumer here.
7. **FamilyPedigree** — main's `materializeFamilyPedigree` (with its three
   post-fork fixes) wrapped to drive the engine primitives
   (`allowUnknownAttributes` on nodes only, plain `addEdge`, committed
   membership metadata); run-level `familyPedigree` options threaded from
   the API.
8. **NarrativePedigree** — joins the Phase-2 no-op content simulators
   (burden only); all four no-ops pinned by a C4 "writes nothing" case.

At the end of this phase: C2 (every generated session round-trips
`NcNetworkSchema` + `StageMetadataSchema` and flows through
`network-exporters`' `processSessions` in all formats, complete and dropped
alike); the parity suite's full-protocol legs over the development, sample,
and showcase protocols (all 19 types); and C8's 50 000-run sample-protocol
calibration within ±1.5 pp of the closed form, re-deriving
`DROPOUT_HAZARD_RATE`'s docblock measurement against the complete matrix.

## Phase 4 — descriptor-driven values, feasibility, corpus

- The descriptor-driven `ValueGenerator`/`valueSpace`/`descriptors` are
  already the branch's Phase-5/7 work — they arrived in Phase 2's port.
  This phase re-ports the **predictive** half from main and rewrites it
  against schema-resolved counts: `feasibility.ts` + `entityCounts.ts`
  (walk-scoped per D18; pool-aware roster refusal; `MAX_SYNTHETIC_PAIRS`'s
  one job — the cumulative worst-case pair-cap refusal; descriptor-aware
  `valueSpaceSize`), reconnected as `generateInterviews`' pre-seed gate.
- Re-port the deleted oracles: `runtimeValidationConformance.test.ts`
  (the fresco-ui devDependency is retained — main never dropped it; the
  branch had), `generateNetwork.corpus.test.ts`
  rewritten to drive `generateInterviews` (same env scaling:
  `CORPUS_SHAPES`/`CORPUS_SEEDS`/`CORPUS_SHARD`/`CORPUS_REPORT`; same
  brute-force feasibility oracle) — C3, C6 (guard already live), C7
  (the branch's `sampleCount` distribution tests plus per-family
  statistical tolerances and weight/missingness realisation), C12
  (refusal invariance over 500 seeds).
- The C1 corpus leg switches on.

## Phase 5 — hosts migrate; the old engine dies

- **Interviewer** `lib/synthetic/generate.ts`: re-parse the stored protocol
  at the boundary, single `generateInterviews` call (engine floor, engine
  seeding — a per-batch random seed by default, surfaced in the completion
  toast for reproducibility), envelope mapping (`finishedAt` from
  `session.finishTime`, `progress` via `getInterviewProgress`), batch
  rollback kept. Settings default flip (D2). `generate.test.ts` rewritten
  against the new mock surface; `rosterIntegration.test.ts` re-pointed;
  `data-management.spec.ts` re-derived (D24).
- **Fresco** route: re-parse stored `stages`/`codebook` into a protocol,
  `include: { assets: true }`, the server-side roster resolver over
  `Asset.url`/`Asset.name` (no cleanup; fetch failures = unresolved pools
  per D18), engine timestamps replacing the fabricated ones (`lastUpdated`
  is `@updatedAt` — noted, accepted), SSE progress via `onProgress`,
  `MAX_SYNTHETIC_INTERVIEWS` imported from the package (D1),
  `knip.config.ts`'s `validateAndMigrateProtocol` ignore updated with its
  new return shape.
- **Architect PreviewHost**: `StageEditor`/`launchPreview`/`PreviewPayload`
  pass `validationResult.data`; `buildSession` calls `generateInterviews`
  (`count: 1`, dropout off, `respectSkipLogic: false`, `stopAt:
{ stageIndex: startStage }`, seed `DEFAULT_SYNTHETIC_SEED`, real
  `assetData`); the stage-metadata salvage loop and conflict screen stay;
  `PreviewHost.test.tsx` drops its `Math.random` stub for the seed option.
- **Delete**: `src/generateNetwork.ts` + the `generateNetwork/` subtree,
  `GenerationConfig`, `todayYmd` (D13), their 28 test files, and the old
  `src/index.ts` exports; `SyntheticDataConstraintError`/`ConstraintConflict`
  re-home under `synthetic-interviews/constraints/error.ts` with unchanged
  names.
- **The four interview tests** rewrite per D13/D14; `ymdParity` deleted.
- C10's host-hash tests re-verified; C11's knip sweep.

## Phase 6 — builder succession and the fixture estate

- Builder: G4's `synthetic-protocols/` split adopted **inside `src/`
  without a subpath** (D4): `ProtocolBuilder` (renamed per D3;
  1,957-line construction half), `getProtocolParsed()`,
  `getInterviewPayload(opts)` as the engine delegate (D12 ISO output;
  D20/D21 semantics; `GetSessionInput` gains `stopAt`-shaped fields where
  scenarios need mid-stage states), `getNetwork()` as a thin
  `getInterviewPayload().session.network` accessor (9 call sites keep
  working). The orphaned duplicate types (`variableEntry` vs
  `types.ts`) collapse to one definition.
- Mechanical sweep over the 72 importing files (248 constructions): rename,
  delegate options, `StoryInterviewShell` ISO simplification,
  `CaptureStory` unchanged externally, e2e adapter per D20,
  `synthetic-payload.test.ts` updated. Run as a worktree-isolated agent
  fleet with per-file verification; every scenario's `build()` remains a
  pure builder recipe.
- Baseline adoption: Chromatic (three projects re-select via the package
  graph) and the interview ARIA/pixel matrix regenerate once — through
  `adopting-a-test-baseline` / `regenerating-e2e-visual-snapshots` /
  `preparing-e2e-visual-baselines`, never hand-accepted; interviewer and
  architect suites re-run. This is the spec's "seeded output changes"
  risk, budgeted here.

## Phase 7 — docs and release notes

`CLAUDE.md` (package one-liners + the protocol-utilities section),
`packages/protocol-utilities/README.md` rewrite, `AUTHORING_GUIDE.md` gains
the `synthetic` block section, the two skills that name the dying API
(`creating-a-network-canvas-interface` ×4 sites,
`verifying-an-interface-change` ×1) update to the simulator/`ProtocolBuilder`
vocabulary, the changeset's final reader-facing prose lands, and the spec's
Status flips to `Implemented (PR #…)` in the merge commit.

## Verification (whole-PR)

```bash
pnpm --filter @codaco/protocol-validation --filter @codaco/protocol-utilities \
     --filter @codaco/shared-consts --filter @codaco/network-query \
     --filter @codaco/interview test
pnpm --filter @codaco/architect --filter @codaco/interviewer --filter fresco test
pnpm typecheck && pnpm lint:fix && pnpm knip && pnpm check:changesets
pnpm --filter @codaco/protocol-validation build   # dts lane + CLI
node packages/protocol-validation/scripts/cli.js \
     packages/protocols/e2e/synthetic-showcase/protocol.json
CORPUS_SHAPES=2000 CORPUS_SEEDS=8 pnpm --filter @codaco/protocol-utilities test
```

plus the three e2e suites (auto-selected), the Architect round-trip spec,
and one full filtered package build per the release lane
(`run-the-package-build-before-pushing`).
