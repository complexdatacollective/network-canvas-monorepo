# Synthetic interview generation — sessions, schema-owned parameters, and the linear walk

**Date:** 2026-08-20
**Status:** Implemented ([PR #1426](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1426))
**Packages:** `@codaco/protocol-validation`, `@codaco/protocol-utilities`,
`@codaco/shared-consts` (SessionPayload relocation), `@codaco/network-query`
(stage-availability relocation), `@codaco/interview` (tests, contract helpers,
edge-id injection), `apps/interviewer`, `apps/fresco`, `apps/architect`
(preview host only)
**Relationship to prior work:** re-affirms and completes the approved
`2026-08-19-synthetic-parameters-in-schema-design.md` (branch-only); adopts the
Generation-4 rewrite (`synthetic-pre-revert-backup`) as raw material; replaces
`generateNetwork` and `SyntheticInterview` end-state; supersedes the reverted
plan-first architecture of PR #1235.

---

## Summary of the approach

One function, `generateInterviews(protocol, options, assetData?)`, walks the
protocol **stage by stage in interview order**, exactly as a participant would.
Each of the 19 interface types has exactly one simulator, and each simulator
mutates the session only through a small **session engine** whose write
primitives mirror the interview runtime's reducer actions one for one. The
walk's output is a batch of **complete Interviewer-shaped sessions** — network,
stage metadata, timestamps, current step — not bare networks. Every number that
shapes the data (counts, distributions, weights, probabilities, burdens) has
exactly one definition in `@codaco/protocol-validation`: either an authored
`synthetic` block embedded in the protocol, or a schema-owned default resolved
at parse time (stage level) or generation time (variable level). Values honour
every validation rule through the existing, corpus-proven constraint machinery
(feasibility analysis + finite-domain solver), extended to honour authored
distributions. Dropout is a dice roll after every completed stage against a
hazard that grows with accumulated response burden. Structural fidelity is not
asserted but **proven by replay**: the engine can emit its write trace, and a
conformance suite in `@codaco/interview` replays that trace through the real
Redux session store and requires the resulting session to be identical.

## The governing rules

1. **One model of stage behaviour.** The linear walk is the only place stage
   semantics exist in generation. There is no plan layer, no materialise layer,
   and no fallback path holding a second opinion about what a stage can do.
   The single permitted predictive model is `analyseFeasibility`, and it is
   held to the generator by a brute-force corpus oracle, not by review.
2. **The schema owns every number.** Generation never writes a `??`, a clamp,
   or a numeric constant to decide what a value looks like. Every number it
   draws against comes from the protocol or from a resolver exported by
   `@codaco/protocol-validation`. (Re-affirmed from 2026-08-19.)
3. **A simulator may write only what its interface can write.** Every write is
   expressed in the runtime's own action vocabulary with the runtime's own
   payload shapes, and carries the same provenance (`stageId`, `promptIDs`)
   the reducer would stamp. If the real interface cannot produce a value shape,
   the simulator must not either.
4. **Generated values satisfy the rules the variable is actually held to** —
   its declared `validation` plus the rules its collecting interfaces imply —
   and authored synthetic parameters may be **more strict than validation,
   never more loose** (open-tailed distributions truncate).
5. **A protocol either always generates or never generates.** Unsatisfiable
   protocols are refused before the seed is consulted, with a structured
   conflict; no seed-dependent failure is acceptable.
6. **Same seed, same batch — byte for byte.** All randomness, including entity
   ids and timestamps, flows from seeded streams. Two runs with the same
   protocol, options, and seed produce identical output.
7. **Fidelity is proven, not asserted.** Every structural claim ("exactly what
   Interviewer stores") is backed by an executable oracle: replay-parity
   against the real session store, round-trips through `NcNetworkSchema` /
   `StageMetadataSchema`, and the exporter pipeline.

## Problem

The product ships a synthetic data feature (Interviewer settings, Fresco's
generate-test-interviews route, Architect's preview) built on
`generateNetwork`. Since PR #1108/#1109 it respects validation rules, and it
already walks stages in order — but four residues of the original
final-state design remain, and two of the brief's requirements have no
implementation at all:

- **Order residues.** Edges are filled whole-type at creation
  (`edges.ts:101-104`), EgoForm fills the whole ego variable set rather than
  its form's fields (`stageHandlers.ts:453-461`), roster stages fill the whole
  node type, and "in progress" is a post-pass that deletes values after all
  stages ran. A dropped-out session therefore carries answers for stages that
  never happened.
- **Structure residues.** The generator returns a bare
  `{network, stageMetadata, currentStep, droppedOut}`; each host reassembles a
  session around it, duplicating envelope logic (the ≥10 %-completed floor
  exists twice). CategoricalBin can emit two categories where the interface
  writes exactly one; OneToManyDyadCensus gets metadata the runtime never
  writes; Geospatial writes `{x,y}` where the runtime writes a feature-property
  string.
- **No researcher-tunable distributions.** Nothing in the protocol carries
  distribution metadata; every draw is uniform (or positional) over the
  constrained space. `GenerationConfig` knobs exist but no host exposes them,
  and they are global, not per-stage/per-variable.
- **No burden model.** Dropout is `((i+1)/totalStages) * dropOutFactor` —
  position-linear, blind to what the stages ask of the participant.

## What four generations established

| Generation                                        | What it was                                                         | Outcome                                   | The lesson this design keeps                                               |
| ------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| G1 stage handlers (`generateNetwork`)             | per-stage handlers, final-state fills                               | live on `main`, patched                   | stage order matters; handlers per interface are the right unit             |
| G2 validation conformance + CSP (#1108, #1109)    | `VariableConstraints`, feasibility gate, finite-domain solver       | merged, corpus-proven                     | keep wholesale — value production and refusal semantics are solved         |
| G3 plan-first redesign (#1235)                    | analyse → plan → materialise + `synthetic` schema + Architect UI    | merged and reverted same day              | **never hold two models of stage behaviour**; schema surface largely right |
| G4 linear rewrite (`synthetic-pre-revert-backup`) | linear walk + simulators + schema-owned parameters + burden dropout | abandoned mid-flight (5 of 19 simulators) | the architecture of this spec; completed and hardened here                 |

Why #1235 failed, mechanically: its three layers (feasibility, plan,
materialise) plus a fallback each modelled stage behaviour independently, and
review kept constructing protocols on which two layers disagreed — cap
overflows, skipped stages donating edges to later stages, degenerate
distributions collapsing in one layer but not another. 37 fix rounds did not
converge; fixes introduced bugs; one fix could not be demonstrated by any
failing construction. The countermeasure is architectural, not procedural:
**rule 1**. A linear walk has one state (the session so far), advanced by one
model (the simulator of the stage the participant is on). There is nothing for
a second layer to disagree with.

The recurring failure mechanisms and their countermeasures here:

| Mechanism (observed)                                          | Countermeasure (this design)                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| plan-then-replay multiplies models that disagree pairwise     | linear walk; rule 1                                                               |
| values ignoring validation                                    | G2 machinery retained; conformance seam tests through fresco-ui's real validators |
| greedy draws seed-dependently wrong both ways                 | G2 feasibility + complete solver retained, corpus oracle retained                 |
| generation defaults silently overriding authored declarations | rule 2; Phase-0 regex guard; `.prefault` mechanics                                |
| output structurally unlike real sessions                      | session engine + replay-parity oracle (rule 7)                                    |
| review non-convergence on unprovable fixes                    | acceptance criteria are executable, mutation-verified, and measured               |

## Decisions

Rows 1–8 were settled with the maintainer on 2026-08-19 and are re-affirmed
unchanged. Do not relitigate; if implementation shows one is unworkable, stop
and report rather than substituting a different design.

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Stage-level** parameters are baked in at parse time (per-factory prefault/transform attachments + field-level defaults — see the schema surface for the exact per-factory forms).                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2   | **Variable-level** descriptors are resolved at generation time by schema-exported `resolveVariableSynthetic`; only USER-authored parameters are written to the protocol; derived defaults never are.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3   | **Response burden** is a stage-level field, defaulted per stage type from `DEFAULT_RESPONSE_BURDEN`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 4   | **Existing-panel nomination odds** are per panel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 5   | **Categorical other-bin probability** is per prompt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 6   | **Dropout hazard rate** is a schema-exported constant, not authorable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7   | Variable synthetic parameters are user-authorable in Architect and never silently rewritten; conflicts are surfaced.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 8   | Validation bounds the parameters: a descriptor may be more strict, never more loose (open-tailed draws truncate).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 9   | **Architecture is the linear walk** with one simulator per interface and a shared session engine; the plan-first architecture is rejected permanently.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 10  | **Output is sessions.** `generateInterviews` returns complete `SessionPayload`-shaped sessions plus `{currentStep, droppedOut}`; hosts only wrap them in their storage envelope. The batch loop and the completed-floor policy move into the engine.                                                                                                                                                                                                                                                                                                                                                                                                             |
| 11  | **Dropout returns N total, mixed.** Asking for N yields exactly N sessions; drop-outs are genuine abandoned sessions (`finishTime: null`, `currentStep` at the next unreached stage), exactly as Interviewer represents an abandoned interview.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 12  | **Full replacement.** `generateNetwork`, its `GenerationConfig`, and `SyntheticInterview`'s generation half are deleted at end state; Architect preview, Interviewer, Fresco, stories, and the e2e matrix all consume the new engine.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 13  | The engine lives at `packages/protocol-utilities/src/synthetic-interviews/` and **never imports `@codaco/interview`** (a proven Turbo `topo` cycle). Two relocations make that possible and are part of this design: `SessionPayload` moves to `@codaco/shared-consts` (the interview contract re-exports it), and the stage-availability machinery (`buildStageAvailabilityMap`, `RoutableStage`, `StageAvailability`) moves — a true relocation, not a fork — to `@codaco/network-query`, with the interview selectors consuming the single new export. Runtime-parity tests live in `@codaco/interview`, where protocol-utilities is already a devDependency. |
| 14  | Schema changes are **additive on v8, no version bump, no migration** (established precedent; the unmerged v9 timeline branch keeps its reservation).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 15  | **The hash boundary is the pre-parse document.** Both hosts today hash the Zod parse output (`importProtocol.ts:178`, `useProtocolImport.tsx:197`), which parse-injected stage defaults would change for every protocol, breaking re-import dedupe and `protocol_hash` continuity. Both call sites therefore move to hashing the post-migration, pre-validation document. Authored `synthetic` blocks live in the raw file and change the hash — deliberately: a protocol whose expected data was deliberately described _is_ a different protocol. Parse-injected defaults never reach the hashed representation, so untouched protocols keep their hashes.     |
| 16  | **stageMetadata stays keyed by stringified stage index**, matching every runtime writer/reader. Re-keying by stage id is out of scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 17  | Synthetic sessions are **plaintext**: `encrypted` variables generate readable values and no `_secureAttributes`. Encrypting under a synthetic passphrase would make the data uninspectable everywhere, defeating its purpose.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 18  | Entity ids and timestamps come from **seeded streams** — full byte-reproducibility, improving on G1's unseeded uuids. Roster-sourced nodes keep their content-derived deterministic uids.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 19  | Dropout is rolled **after every completed stage, including the last authored stage** — "abandoned at the finish line" (all data present, never finished) is a real state worth modelling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 20  | The ≥ completed floor becomes an engine option `minimumCompletedRatio` (default 0.1, `0` disables), replacing the duplicated host loops. A floor top-up re-runs the deficit session with its **own per-session substreams and dropout disabled** — the same participant finishing — so the floor stays deterministic under rule 6. (Today's host loops regenerate unseeded; that behaviour is replaced, not preserved.)                                                                                                                                                                                                                                          |

## Design

### Public API

```ts
// packages/protocol-utilities/src/synthetic-interviews/index.ts

export const generateInterviewsOptions = z.object({
  count: z.number().int().min(1).max(MAX_SYNTHETIC_INTERVIEWS),
  seed: z.number().optional().default(DEFAULT_SYNTHETIC_SEED),
  simulateDropOut: z.boolean().default(true),
  respectSkipLogic: z.boolean().default(true),
  /** Regenerate dropped sessions (without dropout) until this share of the
   *  batch is complete. 0 disables. The ratio mirrors today's hosts; the
   *  mechanism is deterministic per decision 20. */
  minimumCompletedRatio: z.number().min(0).max(1).default(0.1),
  /** Stop the walk at a stage (and optionally a prompt) instead of running to
   *  the end. Used by Architect's preview; mutually exclusive with dropout. */
  stopAt: z.object({ stageIndex: z.number().int().min(0),
                     promptIndex: z.number().int().min(0).optional() })
          .optional(),
  /** ISO instant anchoring the start window: sessions start uniformly within
   *  [startWindow − SYNTHETIC_START_WINDOW_DAYS, startWindow]. A NEW default
   *  (schema-exported constant, 7 days) — today Interviewer stamps the
   *  generation instant and Fresco draws within the last hour; both are
   *  replaced by this seed-stable window. */
  startWindow: z.string().datetime().optional(),
  /** Family-pedigree population/scenario options (run-level; deliberately not
   *  protocol-embedded — see the FamilyPedigree row). */
  familyPedigree: familyPedigreeOptionsSchema.optional(),
  /** Capture the engine's write trace for parity testing. */
  captureTrace: z.boolean().default(false),
});
export type GenerateInterviewsOptions = z.input<typeof generateInterviewsOptions>;

export type SyntheticInterviewResult = {
  session: SessionPayload;      // complete: id, startTime, finishTime,
                                // exportTime: null, lastUpdated, network,
                                // stageMetadata? — exactly the folded reducer
                                // shape (see envelope section)
  currentStep: number;          // resume position; stages.length when finished
  droppedOut: boolean;
  trace?: SyntheticSessionAction[];  // present when captureTrace; an
                                     // engine-owned type mirroring the runtime
                                     // action vocabulary (protocol-utilities
                                     // must not import the runtime's types)
};

export function generateInterviews(
  protocol: CurrentProtocol,          // a PARSED protocol (see schema section)
  options: GenerateInterviewsOptions,
  assetData?: AssetData,              // rosters + geojson values, host-resolved
  onProgress?: (done: number, total: number) => void,  // outside the zod
                                                       // options: functions
                                                       // don't parse
): SyntheticInterviewResult[];
```

`SessionPayload` is today defined only in `@codaco/interview`'s contract;
decision 13 moves it to `@codaco/shared-consts` (the G4 branch already made
exactly this move), with `@codaco/interview/contract` re-exporting it for its
existing consumers.

`AssetData = { rosterNodes?: Record<StageId, NcNode[]>; geojsonPropertyValues?:
Record<StageId, string[]> }`. Roster rows keep a three-way key contract —
rows present = draw without replacement, empty array = source known empty,
key absent = source unresolved (behaviour defined under roster nomination
below) — and arrive **pre-transformed** through the existing
`collectRosterExternalData` helper in `@codaco/interview/contract`, so roster
node uids keep the runtime's deterministic
`${subjectType}_${hash({node,index})}` identity without this package importing
the interview runtime. A sibling `collectGeospatialPropertyValues` helper is
added to the same contract module (fetch the stage's GeoJSON asset, pluck
`mapOptions.targetFeatureProperty` off every feature).

Refusal: unsatisfiable protocols throw `SyntheticDataConstraintError` with the
existing structured `ConstraintConflict[]`, before any session is produced.
Feasibility runs once per batch, pre-seed (rule 5).

### The walk

Per session: create `createInitialNetwork()`-shaped state, then repeatedly
resolve the next available stage against the network **as it now stands**
(`buildStageAvailabilityMap` over `[...stages, FINISH_SENTINEL]`, exactly as
G4 built it — that function lives today in `@codaco/interview`'s selectors;
decision 13 relocates it, with its `RoutableStage`/`StageAvailability` types,
into `@codaco/network-query` as a **single** definition that the interview
selectors then consume, so the engine and the runtime cannot hold two skip
routing models), simulate it, roll dropout, advance. Skip logic is therefore evaluated at the same moment and
against the same state as the runtime evaluates it: after the previous stage's
writes. `respectSkipLogic: false` (preview use) visits every stage in order.

Each visited stage dispatches to its simulator. Simulators receive
`(state, stage, context)` and return the new state; `context` carries the
protocol, resolved descriptors, seeded streams, the unique registry, the
session date, and the interface-implied rules (`collectInterfaceImpliedRules`,
walked once per batch).

`stopAt` ends the walk mid-protocol; a `promptIndex` bound makes the stage's
simulator apply only prompts `< promptIndex`, which is what replaces G1's
delete-values-afterwards post-pass: an in-progress stage is a stage whose later
prompts simply never ran.

### The session engine and the replay-parity oracle

Simulators never touch the network directly. They call a session engine whose
primitives are the runtime's action vocabulary with the runtime's payload
shapes:

```
addNode { type, attributeData, modelData?: {_uid}, currentStep }   → stamps
    stageId + promptIDs:[currentPromptId] exactly as session.ts:626-634
addNodeToPrompt / removeNodeFromPrompt   (prompt reconciliation semantics)
addEdge { from, to, type, attributeData?, currentStep }            (no
    provenance fields — edges carry none)
toggleEdge (both-direction dedupe via the runtime's edgeExists rule)
updateNode / updateEdge / updateEgo with AttributePatch {set, unset}
    (null/undefined dropped; unset deletes — an unanswered variable is ABSENT)
toggleNodeAttributes
deleteNode (cascades incident edges; prunes census tuples)
deleteEdge
updatePrompt / transitionStage / updateStageMetadata (index-keyed)
```

The engine folds these into the session (network, `stageMetadata`,
`promptIndex`, `lastUpdated` from the simulated clock) with the reducer's exact
semantics, including codebook attribute-key validation (unknown keys throw,
except `allowUnknownAttributes` on **node** adds for roster and pedigree
sources — mirroring `session.ts:184-194`; the runtime's `addEdge` has no such
option and neither does the engine's).

**The oracle.** With `captureTrace`, the engine also returns the action list.
A conformance suite in `packages/interview` (`replayParity.test.ts`, its own
node-environment vitest project — the `units` project's setup assumes jsdom)
creates the **real** store via its own factory (`store(payload, {onSync})` —
proven to run headlessly), dispatches the trace, and asserts the resulting
session equals the engine's folded session after normalising clock stamps.
Ids need no normalising because they are injected: `addNode` already accepts
`modelData._uid`, and this design adds the same optional injection channel to
the runtime's `addEdge`/`toggleEdge` (today the thunk mints its own uuid with
no way in — without the channel, replaying `updateEdge`/`deleteEdge` against
engine edge ids would reject and the oracle would be unsatisfiable). Any thunk
rejection is a parity failure. The comparison also checks **route parity**: at
every `transitionStage` in the trace, the replayed store's availability map
must agree with the walk's chosen next stage, and a dropped session's
`currentStep` must equal the runtime-computed resume position — so the engine
cannot drift from the runtime's routing either. This makes "exact same
structure as an interview in the Interviewer app" an executable property
instead of a review claim, and it pins every reducer subtlety the fold could
drift from: promptID accumulation, additional-attribute
overwrite/reconciliation, census-tuple pruning, edge-direction dedupe. The
suite runs over the development protocol, the sample protocol, the spec's
sample protocol, and the randomized corpus shapes.

Storage round-trip is separately pinned: every generated session must pass
`NcNetworkSchema.parse` and `StageMetadataSchema.parse` (what Interviewer's
encrypted Dexie layer enforces on read/write) and flow through
`network-exporters`' `processSessions` without error.

### Session envelope, clock, and identity

`SessionPayload` fields the engine owns:

- `id`: uuid-format string from the seeded id stream.
- `startTime`: drawn uniformly in the start window from the session's stream.
- `lastUpdated`: the simulated clock at the last write.
- `finishTime`: for completed sessions, the simulated clock after the final
  stage plus a finish-confirmation beat; `null` for drop-outs and `stopAt`
  runs. (The runtime never writes `finishTime`; the _host_ stamps it at
  `onFinish`. The engine emits what the host would have stored, which is what
  both hosts' synthetic writers already fabricate today.)
- `exportTime`: always `null`.
- `promptIndex`: the folded value — 0 after any completed stage
  (`transitionStage` resets it), possibly non-zero after a mid-stage `stopAt`.
  Interviewer rehydrates it as 0 and Fresco omits it; the field is optional
  and excluded from sync diffs, so either is faithful.
- `stageRequiresEncryption`: omitted. The reducer's `transitionStage` clears
  it to `false` and no runtime code ever sets it true (vestigial contract
  surface); the fold treats absent and false as equivalent and the parity
  comparison does the same.
- `stageMetadata`: present only when non-empty.

The clock: each visited stage advances time by
`responseBurden × SYNTHETIC_SECONDS_PER_BURDEN × jitter`, where the seconds
constant and the lognormal jitter parameters are schema-exported constants
(rule 2), and writes within a stage are spread across its span. Timestamps are
plausibility, not analysis targets; the approximation is deliberate and
documented. `currentStep` for a completed session is `stages.length`; for a
drop-out it is the next stage the participant would have reached (skip-logic
resolved), which is exactly the resume position Interviewer stores. Hosts
derive `progress` with the `getInterviewProgress` helper they already use.

The session date (`today`) is the session's own `startTime` date, resolved once
per session; every relative date window resolves against it.

### Per-interface simulators — the fidelity table

The contract per interface, derived from the runtime inventory (citations are
the runtime sources a reviewer should diff against). "Gates" are honoured by
construction: the simulator never produces a state the interface would refuse
to leave.

| Interface                                   | Writes (engine primitives)                                                                                                                                                                                                                                | Parameters consumed                                                                                                                                              | Gates honoured / notes                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NameGenerator                               | per prompt: `addNode` with form-field values + prompt `additionalAttributes`; panel re-nominations via `addNodeToPrompt` (existing) / `addNode` `allowUnknownAttributes` + roster `_uid` (external)                                                       | stage `synthetic.count`, per-panel `nominationProbability`, variable descriptors for form fields                                                                 | count truncated into `behaviours.minNodes/maxNodes`; creates only its form's fields (+ rule-tied closure); min-nodes floor always met                          |
| NameGeneratorQuickAdd                       | as above; `addNode` writes only the `quickAdd` variable + prompt attributes                                                                                                                                                                               | same                                                                                                                                                             | quick-add value never unanswered (interface-implied rule)                                                                                                      |
| NameGeneratorRoster                         | `addNode` with `modelData._uid` = roster uid, roster attributes verbatim, `allowUnknownAttributes: true`, + prompt attributes                                                                                                                             | stage `synthetic.count`                                                                                                                                          | draws uniformly without replacement from the resolved pool; count clamped to pool; a row already in the network is ineligible (runtime dedupe); no fabrication |
| Sociogram                                   | per prompt: `updateNode` layout `{x,y}` (0–1 space) for subject nodes; `toggleEdge` for `edges.create`; `toggleNodeAttributes` boolean for highlight                                                                                                      | stage `synthetic.topology` (edge-creating prompts); highlight variable's Boolean descriptor (`probabilityTrue`); layout positions engine-deterministic in-bounds | `create` and `allowHighlighting` are schema-exclusive per prompt; automatic-layout stages position **every** subject node (the settle persists all); no gate   |
| DyadCensus                                  | per prompt × pair: yes → `addEdge` (no attributes, dedupe-guarded) + tuple `[promptIndex,a,b,true]`; no → `deleteEdge` if present + false tuple; `updateStageMetadata` per answer                                                                         | `synthetic.topology` decides the yes-probability realisation                                                                                                     | every pair of every prompt answered (hard gate); tuples replace same-pair-same-prompt entries; pairs in node-list order                                        |
| TieStrengthCensus                           | yes → `addEdge`/`updateEdge` setting the prompt's `edgeVariable` (ordinal descriptor / `optionWeights`); no → `deleteEdge` + false tuple; **negatives only** in metadata                                                                                  | `synthetic.topology`; edge variable's ordinal descriptor                                                                                                         | every pair answered; edge variable set on every yes-pair                                                                                                       |
| OneToManyDyadCensus                         | `toggleEdge` per selected target                                                                                                                                                                                                                          | `synthetic.topology`                                                                                                                                             | **no stage metadata, no negative record** (fixes G1's inert tuples); `removeAfterConsideration` = each unordered pair considered once                          |
| OrdinalBin                                  | per prompt × subject node: `updateNode` set `variable` to **one scalar option value**                                                                                                                                                                     | prompt variable's ordinal descriptor (`optionWeights`, `missingProbability` → node left unbinned)                                                                | bin-only variables draw with validation stripped (runtime enforces none there); no gate — unbinned = unset                                                     |
| CategoricalBin                              | regular bin: `updateNode` set `[value]` (single-element array) + unset `otherVariable`; other bin (prompt `synthetic.otherBinProbability`): set `otherVariable` text (validated) + unset `variable`                                                       | prompt's `otherBinProbability`; variable's categorical descriptor collapses to selection count 1 (interface-implied `maxSelected: 1`)                            | exactly one category per placement; no gate                                                                                                                    |
| EgoForm                                     | one `updateEgo` patch covering **exactly the form's fields**; mounted-but-missing values `unset`                                                                                                                                                          | variable descriptors; `missingProbability` only on non-required fields                                                                                           | patch passes the real validator stack (form validity gates forward)                                                                                            |
| AlterForm                                   | per subject node (stage-filtered, network order): `updateNode` patch over the form's fields                                                                                                                                                               | variable descriptors                                                                                                                                             | zero items ⇒ stage auto-advances with no writes; per-slide validity honoured                                                                                   |
| AlterEdgeForm                               | per subject-type edge: `updateEdge` patch over the form's fields                                                                                                                                                                                          | variable descriptors                                                                                                                                             | same                                                                                                                                                           |
| Information / Narrative / NarrativePedigree | none                                                                                                                                                                                                                                                      | `responseBurden` only                                                                                                                                            | content stages; Narrative persists nothing (annotations are ephemeral)                                                                                         |
| Anonymisation                               | none (passphrase is UI state; decision 17 keeps values plaintext)                                                                                                                                                                                         | `responseBurden`                                                                                                                                                 | —                                                                                                                                                              |
| NetworkComposer                             | `addNode` (quickAdd value + layout at grid position), `addEdge`/`toggleEdge` per configured edge type, `updateNode`/`updateEdge` inspector patches, hull membership `string[]`                                                                            | `synthetic.count` + `synthetic.topology`; nodeForm/edge-form field descriptors                                                                                   | burden 0 default retained from G4 (composition typically facilitated; authorable per stage); metadata `{automaticLayout}` not generated (UI preference)        |
| Geospatial                                  | per prompt × subject node: `updateNode` set `variable` to a **string** — a drawn `targetFeatureProperty` value, or `'outside-selectable-areas'`                                                                                                           | `geojsonPropertyValues[stageId]` from AssetData; schema constant for the outside-areas share                                                                     | fixes G1's `{x,y}` divergence; without asset data every answer is the outside sentinel (the only value producible without the map)                             |
| FamilyPedigree                              | the existing `materializeFamilyPedigree` module, unchanged, driving the session engine (`addNode` with `allowUnknownAttributes`, mirroring the runtime's pedigree commit, + plain `addEdge` over codebook edge variables + committed-membership metadata) | run-level `familyPedigree` population options (deliberately not protocol-embedded: a family is a structure, not a population)                                    | completeness rules met by construction                                                                                                                         |

Prompt-fixed `additionalAttributes` continue to be reserved against `unique`
before any draw, and the bin write-without-claim bookkeeping
(`assignBinValue` / out-of-band registry) carries over from G2 unchanged.

### Value generation

The G2 constraint machinery is retained wholesale: `buildEntityConstraints`
(validation + component parameters + date windows), dependency ordering with
`sameAs` groups and comparator propagation, the finite-domain component solver
with seeded value ordering, bounded greedy fallback, and the cross-entity
unique registry. Two changes:

1. **Descriptors drive the draw.** `ValueGenerator` loses every default
   (2026-08-19 Phase 7). For each variable it asks
   `resolveVariableSynthetic(variable, effectiveRules)` — authored `synthetic`
   block if present, derived descriptor otherwise — and draws from that
   distribution, truncated into the constraint window (rule 8). `unique`
   variables draw from the declared distribution with bounded retries before
   falling back to the distinct-value sequence.
2. **Effective validation is one derivation.** The per-type resolution table
   and the interface-implied rules table of the 2026-08-19 spec apply verbatim
   (CategoricalBin ⇒ `maxSelected: 1`; bin-only variables ⇒ form rules not
   enforced; quick-add ⇒ never unanswered; one-option Boolean ⇒ single-value
   domain; RelativeDatePicker ⇒ its window; datetime defaults are
   session-relative windows, never absolute dates). `collectVariableRoleHits`
   is the walk; do not write a new one.

`missingProbability` is legal only where the effective rules permit emptiness
(never on `required`, never on quick-add); a missing draw leaves the attribute
**absent**, never null.

Feasibility (`analyseFeasibility`) is updated in lockstep so it counts exactly
what the descriptor-driven generator can draw (`valueSpaceSize` reads resolved
descriptors), preserving the always-or-never refusal invariant. The randomized
corpus test (feasibility ≡ brute-force satisfiability, every accepted shape
generates on every seed with every rule satisfied) remains the gate.

### Counts, topology, rosters, panels

- **Node counts** (`synthetic.count`, per node-creating stage):
  `constant | uniform | poisson | normal`, integer draws truncated into
  `[max(0, minNodes), min(maxNodes ?? ∞, MAX_SYNTHETIC_POPULATION, pool)]`
  and renormalised by resampling (bounded attempts, then clamp — the clamp
  lives in the schema-owned resolver, not in generation). Default:
  `normal(mean 8, sd 3, min 0)` — the personal-network elicitation prior.
  Counts are per stage, distributed across its prompts by the stage's seeded
  stream (every prompt nominates at least one node when the count allows,
  matching how participants actually spread nominations).
- **Edge topology** (`synthetic.topology`, per edge-creating stage):
  `density (constant|uniform|normal|beta)` or
  `meanDegree (constant|uniform|normal)`, realised per prompt over the
  eligible pair set with the both-directions dedupe. Default:
  `density beta(mean 0.3, sd 0.15)`. Census stages realise the drawn density
  as the yes-rate over the answered pairs. A schema-exported realisation
  resolver `(topology, pairCount) → target edge count` owns the truncation
  into `[0, pairCount]` (meanDegree is schema-unbounded above), parallel to
  the count resolver — generation itself writes no clamp (rule 2).
- **Roster nomination**: the stage's `count` governs how many rows are drawn;
  selection is uniform without replacement. Attribute-biased roster sampling
  is deliberately excluded: the roster's composition is the researcher's data,
  and which rows a participant picks has no observable structure to imitate —
  a count distribution is the whole model. The `rosterNodes` key contract:
  rows present ⇒ draw from them; empty array ⇒ source known empty; **key
  absent ⇒ source unresolved**, treated as an empty pool. Feasibility is
  pool-aware: a roster stage whose known (or unresolved) pool is smaller than
  `behaviours.minNodes` is refused pre-seed with a structured conflict —
  which is runtime-faithful, since the live interface's min-nodes gate would
  strand a real participant on exactly that stage. (Fabrication is gone:
  under the old contract an absent key invented people a roster interface
  cannot create.) Fresco's route therefore starts resolving rosters
  server-side through the host-agnostic `collectRosterExternalData` — a named
  Phase 5 item; today it passes nothing.
- **Cumulative pair cap**: `MAX_SYNTHETIC_PAIRS` has exactly one job — a
  feasibility-time refusal. Feasibility computes each census/edge stage's
  pair count from the cumulative per-type counts of the creator stages
  feeding it, measured on the **guaranteed (floor) demand the author
  declared** — not the ceilings. The ceilings cannot be the measure: the
  schema resolves an unbounded name generator's count `max` to
  `MAX_SYNTHETIC_POPULATION` (100 per stage), so a ceiling-based cumulative
  cap refuses every bundled protocol (two defaulted generators feeding one
  census read as 19,900 worst-case pairs against a 4,950 cap) for a demand
  no author stated. Floor demand fires exactly on authored excess (two
  `constant: 60` generators → 7,140 guaranteed pairs, refused) and never on
  a schema default — which is also the always-or-never shape rule 5 asks
  for. Deterministic, structured, seed-independent. Generation never
  truncates a pair set: the census hard gate ("every pair answered") is
  absolute.
- **Existing-network panels**: one weighted coin per candidate at the panel's
  `nominationProbability` (default 0.3); when two panels show the same person,
  the first panel in stage order decides (the panel they meet first) — the
  tie-break is specified and tested in both directions.

### Dropout and burden

After every completed stage (including the last), roll once:

```
p(drop after stage k) = 1 − exp(−DROPOUT_HAZARD_RATE × Σ_{j≤k} burden_j)
```

`burden_j` is `stage.synthetic.responseBurden` — the schema's per-type default
(`DEFAULT_RESPONSE_BURDEN`: Information 0, censuses 1.0, Sociogram 0.6, forms
0.3–0.4, …) unless the researcher overrode it on the stage. "Normalised", in
the brief's sense, is the default table's scale convention: per-type defaults
live in [0, 1] with the heaviest interfaces (DyadCensus, TieStrengthCensus,
FamilyPedigree) anchored at 1.0 — OneToManyDyadCensus sits at 0.5, since
tap-all-that-apply asks far less per pair than a per-pair question — which is
what makes burdens comparable across stage types and the hazard constant
calibratable. Authored overrides
are unbounded non-negative **rates**, not probabilities (a researcher must be
able to say their sociogram costs 1.5 of the usual one); risk grows
monotonically with fatigue and never reaches certainty. Skipped stages contribute nothing — a
question nobody was asked cannot tire them. `DROPOUT_HAZARD_RATE = 0.0011`,
calibrated against the sample protocol to lose ≈1 participant in 10 (measured
10.6 % over 50 000 simulated interviews on the G4 branch); the docblock carries
the closed-form recalibration
(`rate = −ln(1 − targetDropout) / S`, `S` = Σ cumulative burden). Burden
stays flat per stage instance rather than scaling with realised volume:
volume factors would be a second, engine-owned model of burden — the exact
class of divergence rule 1 eliminates — and a researcher whose census is
unusually heavy overrides that stage's burden directly.

A dropped session is truncated at the stage boundary: network and metadata
reflect exactly the completed stages, `finishTime` is null, `currentStep`
points at the next unreached stage. With `minimumCompletedRatio > 0`, deficit
sessions are regenerated with dropout disabled (decision 20).

### Determinism

One options seed fixes the batch. Per-session streams derive from it
(`seed + index`, session 0 preserving single-interview compatibility);
independent substreams for values, ids, clock jitter, dropout dice, and the
pedigree (per-stage-id derivation retained) so adding a draw in one place
never perturbs another. Entity ids are uuid-formatted draws from the id
stream; roster uids keep their content-derived identity. Reproducibility is
asserted byte-for-byte in tests — no `stripUnstableIds` indirection.

### The schema surface

Adopt the G4 v8 `synthetic` surface — the full surface lives on
`synthetic-pre-revert-backup` (`schemas/8/synthetic/`,
`shared/synthetic/helpers.ts`, and the stage/panel/prompt/variable
attachments); the earlier `claude/synthetic-schema-only` extraction is the
narrower #1374-era surface (no burden, no panel/prompt fields, no relative
window) and must **not** be the starting point — with these confirmations and
deltas:

- **Placement, per factory** (the attachment form differs because the
  defaults' inputs differ): values and edge factories attach
  `synthetic: <factory>('<Type>').prefault({})`; no-data factories attach
  `.prefault({ generatesData: false })`; NetworkComposer prefaults its full
  default block `{ count: DEFAULT_NODE_COUNT, topology: DEFAULT_EDGE_TOPOLOGY }`
  (its own refinement rejects a bare `{}`); and the three node-count stages
  attach `.optional()` plus the `withResolvedSyntheticCount` **transform**,
  because the count default must be fitted to the sibling
  `behaviours.minNodes/maxNodes` window, which no field-level default can
  see. (**`.prefault`, not `.default`**, wherever prefault appears — Zod 4's
  `.default()` short-circuits unparsed; the trap gets a comment at every
  site.) Panels gain `synthetic.nominationProbability` (existing-network
  panels only; refused on roster panels). CategoricalBin prompts gain
  `synthetic.otherBinProbability` (only with `otherVariable`). Every variable
  union branch gains its per-type optional `synthetic` descriptor
  (`NumberSynthetic`, `ScalarSynthetic`, `BooleanSynthetic`,
  `OrdinalSynthetic` with `optionWeights`, `CategoricalSynthetic` with
  `selectionCount` + `optionWeights`, `DatetimeSynthetic` incl. the
  **relative window** form, `TextSynthetic` with the curated generator enum).
  `layout`/`location` take none.
- **Refinements refuse unusable metadata** (weights naming absent options,
  selection counts outside the effective window, missingness on required,
  disjoint bounds, degenerate means outside their windows, blocks that declare
  nothing) — these same refinements are what make Architect's existing
  commit-validation listener surface authored-parameter conflicts for free.
- **Constants exported for the engine** (rule 2): `DEFAULT_RESPONSE_BURDEN`,
  `DROPOUT_HAZARD_RATE`, `DEFAULT_OPTION_WEIGHT`, `DEFAULT_NODE_COUNT`,
  `DEFAULT_EDGE_TOPOLOGY`, `DEFAULT_PANEL_NOMINATION_PROBABILITY`,
  `DEFAULT_CATEGORICAL_OTHER_BIN_PROBABILITY`, `MAX_SYNTHETIC_POPULATION`
  (100 per stage), `MAX_SYNTHETIC_PAIRS`, plus new
  `SYNTHETIC_SECONDS_PER_BURDEN`, clock-jitter parameters,
  `SYNTHETIC_START_WINDOW_DAYS` (7), and the Geospatial outside-areas share.
  `resolveVariableSynthetic`, `collectInterfaceImpliedRules`, and the count
  and topology realisation resolvers are exported functions.
- **`generateInterviews` takes a parsed protocol, and each host parses at the
  generation boundary.** Stage-level defaults exist because parsing put them
  there; the engine invariant-checks `stage.synthetic` rather than
  re-defaulting. Interviewer and Fresco store parse output but their stored
  back catalogue predates this schema, so their generation entry points
  (`lib/synthetic/generate.ts`, the Fresco route) re-parse the stored
  protocol before calling the engine — which also upgrades pre-release rows
  for free. Architect stores the authored document raw and its preview
  currently forwards it unparsed; `launchPreview`/`PreviewHost` start passing
  the `validateProtocol` result they already compute. All three are named
  Phase 5 items.
- **Compatibility.** Additive-optional on v8; every existing protocol parses
  unchanged (guarded by a before/after test over `packages/protocols`).
  Deployed apps pinned to older `@codaco/protocol-validation` builds reject
  protocols that _carry authored blocks_ until they update — the normal
  consequence of any additive schema change here, accepted. Host-computed
  protocol hashes move to the pre-parse document (decision 15): one-line
  changes at `importProtocol.ts:178` and `useProtocolImport.tsx:197`, pinned
  by a host-level test that an untouched `.netcanvas` imports with an
  identical hash before and after the schema change.
- **Architect survival rule (load-bearing).** Architect's stage-editor commit
  is overwrite-not-merge from registered form fields; an unregistered
  stage-level key is dropped on the first save of that stage. Therefore the
  schema phase must add `synthetic` to the `withStageIdentity` carry set (the
  `skipLogic`-on-Anonymisation precedent) so authored stage parameters survive
  editing **before** any authoring UI exists. Panels need their own carry:
  `NodePanels` reassembles each panel from exactly four registered leaves
  (id/title/dataSource/filter), so `panels[n].synthetic` must be registered as
  a hidden field alongside the panel id (or re-attached by panel id in the
  save normalisation) or Architect deletes it on the first save of a
  panel-bearing stage. Variable-level and prompt-level keys survive already
  (codebook merges; prompts round-trip as whole arrays and item edits merge
  over the committed row). A pinned Architect round-trip test (open → edit an
  unrelated field → export, over a protocol carrying stage-, panel-, prompt-,
  and variable-level blocks) guards all four.

### Host integration

- **Interviewer** (`lib/synthetic/generate.ts`): drops its loop, floor, and
  `StageMetadataSchema.parse` scaffolding; calls `generateInterviews`, wraps
  each result in `createSession`/`updateSession`
  (`caseId: synthetic-<uuid>`, `isSynthetic: true`, `finishedAt` from
  `session.finishTime`, `progress` via `getInterviewProgress(stages,
currentStep)`), keeps batch rollback. Settings UI unchanged
  (count / dropout / skip-logic toggles; skip-logic toggle now defaults on).
- **Fresco** (`generate-test-interviews` route): same replacement server-side;
  Prisma rows map fields 1:1.
- **Architect preview** (`PreviewHost`): `generateInterviews` with `count: 1`,
  `simulateDropOut: false`, `respectSkipLogic: false` (preview strips skip
  logic today), `stopAt: { stageIndex: startStage }`, real roster
  `assetData`; consumes `session.network` + `session.stageMetadata`.
  Constraint-conflict rendering unchanged.
- **Batch progress**: `generateInterviews` accepts an optional `onProgress`
  callback (sessions are generated synchronously in sequence; both hosts
  stream progress today).

### Builder succession (stories and the e2e matrix)

`SyntheticInterview` has two roles today: fluent protocol/fixture construction
and payload generation. The construction half survives as `ProtocolBuilder`
(same fluent surface: `addNodeType`, `addStage`, `addPrompt`, seeded counter
ids). The generation half is deleted; `getInterviewPayload()` becomes a thin
delegate: `generateInterviews(this.getProtocolParsed(), { count: 1, seed,
simulateDropOut: false, respectSkipLogic: false, stopAt })` plus an
`overrides` channel — explicit per-entity attribute values applied at that
entity's creation draw (validated against constraints; contradictions refuse
up front, as the builder refuses today). Stories and the 21 e2e scenario files
(19 per-interface plus cross-cutting and finish-session) migrate mechanically;
method names are preserved wherever semantics are unchanged to bound the diff.

## Out of scope

- **Architect authoring UI** for `synthetic` blocks — tracked as #1420; the
  schema refinements already make conflicts surface through the existing
  commit-validation listener. Nothing in this design depends on the UI.
- Re-keying stageMetadata by stage id (decision 16).
- Attribute-weighted roster selection; per-participant heterogeneity beyond
  seeded variation (e.g. frailty terms); volume-scaled burden. Each was
  considered and rejected in place (see Decisions / Dropout).
- Encrypted synthetic values (decision 17).
- Classic apps; v9.

## Rejected alternatives

- **Drive the real `@codaco/interview` store at generation time.** Proven
  headless-feasible, but: reducers stamp wall-clock `lastUpdated` and mint
  unseeded uuids, so determinism (rule 6) requires stubbing `Date`/`crypto`
  globally — unacceptable inside Interviewer's live browser runtime, which is
  where researchers generate; the store is unexported (new subpaths or moving
  the generator into the interview package, bloating the participant bundle);
  and placement in protocol-utilities is a proven Turbo cycle. The store is
  instead used as the **oracle** (replay-parity), which captures its full
  value — reducer-exact structure — with none of the runtime costs.
- **Plan-first (analyse → plan → materialise).** Rejected permanently; it is
  the architecture whose layered disagreements consumed 37 review rounds and
  forced the same-day revert of #1235 (decision 9).
- **A new workspace package.** No cycle would result, but the engine shares
  the constraint machinery, builder, and consumers with protocol-utilities;
  splitting duplicates the dependency surface and CLAUDE.md already names
  protocol-utilities as the home of synthetic generation.
- **Sidecar parameters (separate file / experiments bag / loose objects).**
  Unknown keys anywhere in the protocol — top level, `experiments`, stages —
  are **rejected loudly** by the strict schemas, so an undeclared bag cannot
  travel at all; a plain-`z.object` pocket would be silently stripped by
  Interviewer/Fresco (which persist parse output) while surviving Architect
  (which keeps the raw file) — the FamilyPedigree pocket demonstrates exactly
  that asymmetry; and a separate file inside the `.netcanvas` is silently
  dropped by every import. Whichever way it is attempted, parameters cannot
  travel outside first-class schema.
- **Zod-schema mock generation.** Removed 2026-06-26 for cause: per-field
  mocking cannot honour cross-field invariants.
- **Modelling dropout as a per-stage probability table.** A table is a second
  authorable surface with no measurement behind it; the burden→hazard model
  gives one researcher-meaningful number per stage plus one global constant,
  with closed-form calibration.

## Testing and acceptance criteria

Phase 0 writes the guards; every criterion is executable and, where marked
(M), mutation-verified: disable the mechanism, confirm the guard fails,
restore it. A guard that cannot fail proves nothing.

- **C1 — Replay parity (M).** For the development, sample, and spec sample
  protocols and ≥200 corpus shapes × 3 seeds: replaying the captured trace
  through the real interview store — engine ids injected via `modelData._uid`
  on nodes and the new edge-id channel on `addEdge`/`toggleEdge` — yields a
  session deep-equal to the engine's fold (clock stamps normalised;
  absent-vs-false `stageRequiresEncryption` equivalent), with zero rejected
  thunks, and with **route parity**: at every `transitionStage` the replayed
  store's availability map agrees with the walk's chosen next stage, and a
  dropped session's `currentStep` equals the runtime-computed resume
  position. Mutation: bypass the engine's promptID accumulation → test fails.
- **C2 — Schema round-trip.** Every generated session passes
  `NcNetworkSchema.parse` + `StageMetadataSchema.parse` and flows through
  `network-exporters` `processSessions` (GraphML + all CSV formats) without
  error, complete and dropped sessions alike.
- **C3 — Validation conformance (M).** Every generated value for every
  validated variable passes fresco-ui's real `makeValidationFunction` under
  the true `ValidationContext`; the corpus oracle (feasibility ≡ brute force;
  accepted ⇒ generates on every seed) stays green at existing scale.
- **C4 — Interface write discipline (M).** Property tests per interface from
  the fidelity table: single-element categorical-bin arrays; scalar ordinal
  values; layout within [0,1]²; Geospatial strings from the candidate set or
  the sentinel; no OneToManyDyadCensus metadata; DyadCensus tuple
  completeness (#prompts × #pairs), and TieStrengthCensus metadata containing
  exactly the negative pairs with every pair carrying either the edge with
  its `edgeVariable` set or a negative tuple; min-nodes floors met;
  EgoForm/AlterForm patches touch exactly their form's fields; edges carry no
  provenance fields.
- **C5 — Order.** Generating with `stopAt` at stage k equals the first-k-stage
  prefix of the full walk under the same seed (state isolation), and a
  dropped session's network/metadata contain no write attributable to an
  unvisited stage (assert via trace stage attribution).
- **C6 — Schema owns the numbers (M).** The Phase-0 regex guard: no `??`,
  clamp, or numeric literal between a descriptor and a drawn value anywhere
  under `synthetic-interviews/`; `constants.ts` exports only run options.
  Declared parameters contradicting former defaults (`constant: 250`,
  `selectionCount: 4`, a 1990–1995 window) are produced unmodified.
- **C7 — Distribution faithfulness.** For each distribution family, a
  10 000-draw sample's summary statistics land within pre-registered tolerance
  of the declared parameters (χ²/KS-style bounds fixed in the test, seeded);
  option weights realise within tolerance; `missingProbability` realises
  within tolerance.
- **C8 — Dropout model (M).** Measured completion over 50 000 simulated
  sample-protocol interviews within ±1.5 pp of the closed-form prediction;
  monotonicity: raising any stage's burden never lowers p(drop) at any later
  boundary; skipped stages contribute zero burden; N-total-mixed and the
  floor-ratio semantics asserted exactly.
- **C9 — Determinism.** Same inputs ⇒ byte-identical batch, including ids and
  timestamps; with the floor disabled (`minimumCompletedRatio: 0`) or dropout
  off, changing only `count` from n to n+1 leaves sessions 0…n−1 identical
  (the floor is batch-global by design, so the prefix property is scoped to
  floorless runs); a floor top-up is itself deterministic — the deficit
  session re-run on its own substreams with dropout disabled.
- **C10 — Compatibility.** Every protocol in `packages/protocols` parses
  before and after the schema change, and `hashProtocol` over the **raw
  files** is unchanged; a host-level import test pins that an untouched
  `.netcanvas` yields an identical stored hash in Interviewer and Fresco
  before and after the change (their call sites now hash the pre-parse
  document); a protocol with authored stage-, panel-, prompt-, and
  variable-level blocks survives Architect open → edit-unrelated → export
  byte-identically (modulo asset-source rewrite), and imports cleanly into
  Interviewer and Fresco.
- **C11 — Consumer parity.** PreviewHost, Interviewer, Fresco, stories, and
  the e2e matrix run on the new engine; `generateNetwork`, `GenerationConfig`,
  and the builder's generation half are deleted; `knip` reports no orphans.
- **C12 — Refusal invariance.** For every corpus shape: refused ⇒ refused on
  500 consecutive seeds pre-seed; accepted ⇒ generates on all of them.

## Work breakdown

Phases are sequential; each lands green (`typecheck`, `lint`, `knip`, both
package suites) and each carries its guards from day one. Phase 0 first —
the acceptance criteria in executable form.

- **Phase 0 — guards.** C6 regex guard; parity harness skeleton in
  `packages/interview` under its own node-environment vitest project (real
  store driven headlessly — the pattern is proven); before/after parse test
  over `packages/protocols`; the host import-hash test; corpus harness
  wiring.
- **Phase 1 — schema surface + relocations.** Land the G4 `synthetic` schema
  from `synthetic-pre-revert-backup` (schemas/8/synthetic, shared helpers,
  per-factory attachments incl. `withResolvedSyntheticCount`; the relative
  datetime window ships with it), `resolveVariableSynthetic`,
  `collectInterfaceImpliedRules`, the new clock constants; move
  `SessionPayload` to `@codaco/shared-consts` and the stage-availability
  machinery to `@codaco/network-query` (interview re-exports/consumes);
  switch both hosts' hash call sites to the pre-parse document; land the
  Architect `withStageIdentity` + panel carry changes with the four-level
  round-trip test. No engine changes; every bundled protocol still parses
  (C10).
- **Phase 2 — session engine + walk.** The engine primitives with the reducer
  fold, the clock, seeded id streams, skip-logic routing over the relocated
  availability map, dropout, batch loop, floor, `stopAt`, trace capture, and
  the runtime `addEdge`/`toggleEdge` edge-id injection channel. C1/C5/C8/C9
  green against the five built G4 simulators (ported) plus
  Information/Narrative/Anonymisation.
- **Phase 3 — the remaining simulators.** Roster, Sociogram, DyadCensus,
  TieStrengthCensus, OneToManyDyadCensus, AlterForm, AlterEdgeForm, Geospatial,
  NetworkComposer, FamilyPedigree (wrapping the existing materializer). C4
  rows land with each; C2/C3 across the set.
- **Phase 4 — descriptor-driven values.** ValueGenerator loses its defaults;
  feasibility counts descriptors; corpus oracle re-verified (C3/C6/C7/C12).
- **Phase 5 — consumers.** Interviewer, Fresco, PreviewHost migrate, each
  parsing at its generation boundary (Interviewer/Fresco re-parse the stored
  protocol; Architect's preview passes the `validateProtocol` result it
  already computes); Fresco's route starts resolving rosters server-side via
  `collectRosterExternalData`; `generateNetwork`/`GenerationConfig` deleted
  (C11).
- **Phase 6 — builder succession.** `ProtocolBuilder` + payload delegation +
  overrides; stories and e2e matrix migrate; Chromatic/e2e baselines reviewed
  through the repo's snapshot-adoption process.
- **Phase 7 — docs.** CLAUDE.md package description, AUTHORING_GUIDE section
  for `synthetic` blocks, changeset (normal lane: libraries + Interviewer +
  Architect + Fresco).

Architect authoring (#1420) follows separately and depends only on Phase 1.

## Risks

- **The parity fold drifts from the reducer.** That is C1's job; the suite
  runs per-PR in `@codaco/interview`, and any new reducer behaviour breaks it
  loudly. The fold deliberately contains no logic the trace cannot express.
- **Descriptor-aware feasibility under-/over-refuses.** The corpus oracle
  (C12) is the containment; it caught exactly this class in G2.
- **Seeded output changes on migration.** Expected; existing tests compare
  runs to runs, not literals. Chromatic/e2e story baselines will move once and
  are reviewed through the adoption workflow, not rubber-stamped.
- **Review scale.** The G3 failure mode was architectural, but the sweep
  discipline stands: every review claim needs a runnable repro failing on
  HEAD; pattern-sweep across families rather than per-round whack-a-mole.

## Verification

```bash
pnpm --filter @codaco/protocol-validation --filter @codaco/protocol-utilities \
     --filter @codaco/interview test
pnpm --filter @codaco/protocol-validation --filter @codaco/protocol-utilities typecheck
pnpm typecheck && pnpm lint:fix && pnpm knip
pnpm --filter @codaco/protocol-validation build   # then the CLI on the sample
node packages/protocol-validation/scripts/cli.js <sample-protocol.json>
```

E2E: Interview + Interviewer + Architect suites run under the affected-suite
policy once consumers migrate (Phases 5–6).

## The sample protocol

A companion purpose-built protocol
(`packages/protocols/e2e/synthetic-showcase/protocol.json` with
`assets/colleagues-roster.json`, carrying a `packages/protocols` manifest entry
so CI validates it alongside every other bundled protocol)
demonstrates the full authored surface: quick-add nomination `normal(8, 2)`
(the brief's own example), form name-generator with a `poisson` count and an
existing panel at `nominationProbability 0.5`, roster nomination
`uniform(2, 6)` from a bundled JSON roster, sociogram
`meanDegree normal(2.5, 1)` with a highlight-variable `probabilityTrue 0.25`,
dyad census `density beta(0.2, 0.1)`, tie-strength census with
`density uniform(0.3, 0.5)` and skewed edge-variable `optionWeights`, ordinal
bin `optionWeights`, categorical bin with `otherBinProbability 0.15`, an
alter-edge form categorical with a `selectionCount` table
(`{1: 0.6, 2: 0.4}`) plus `optionWeights`, alter form with a
truncated-`normal` age, a scalar `beta` closeness, a session-relative
datetime window with `missingProbability 0.1`, text `missingProbability 0.2`
on occupation, ego descriptors (`probabilityTrue 0.95` consent,
`normal(2.8, 1.4, min 1)` household size), cross-variable date validations,
a consent skip-to-finish route, authored `responseBurden` overrides on both a
heavy stage (1.2) and a light one (0.25), and text generators (`personName`,
`occupation`). Stripped of its `synthetic` blocks it validates against the
shipped schema (CLI exit 0, verified); intact, it passes the full
Generation-4 branch validator including every protocol-level refinement, and
five adversarial mutations (an over-window selection count, a phantom option
weight, missingness on a required variable, a count ceiling above `maxNodes`,
nomination odds on a roster panel) are each refused with the expected message
(verified).
