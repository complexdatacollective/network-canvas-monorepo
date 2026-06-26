# Narrative Pedigree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new read-only `NarrativePedigree` interface that renders a captured pedigree, computes faithful Mendelian carrier/at-risk status per disease, highlights a focal node's affected genetic lineage (dimming the rest) under participant-switchable presets, renders disease status as edge stickers or classic pedigree notation, and exports a PNG snapshot.

**Architecture:** A new stage type reads the shared network the FamilyPedigree wrote (via `sourceStageId`), reusing `PedigreeLayout`/`EdgeRenderer` for rendering. A pure genetics engine (annotated genetic graph → per-pattern recursive status with a visited-set) produces a `Map<nodeId, Status>` per shown disease. A focal resolver + highlight computer drive dim/emphasis. Two node modes (sticker overlay / classic notation) render through a custom `renderNode`.

**Tech Stack:** TypeScript, Zod, Zustand, React, `@codaco/fresco-ui`, a DOM→image library (`html-to-image`) for export, Vitest, Storybook.

## Global Constraints

- **No `any` types; no `as` to bypass type errors; no barrel files.**
- **Depends on Plan #1's data-model tasks** (gameteRole persisted as `edgeConfig.gameteRoleVariable`; biological sex captured as `nodeConfig.biologicalSexVariable`; `BIOLOGICAL_SEX_VALUES` in shared-consts). Those must be implemented before the genetics engine can resolve sex. Do not duplicate them here.
- **Read-only:** the interface never mutates the network.
- **Status taxonomy (exact):** `affected · obligateAffected · obligateCarrier · atRiskAffected · atRiskCarrier · unknown`. **There is no `unaffected`** — un-nomination resolves to `unknown`; the UI never presents `unknown` as reassurance.
- **Inheritance patterns (exact):** `autosomalDominant · autosomalRecessive · xLinkedDominant · xLinkedRecessive · yLinked · mitochondrial · multifactorial · unknown`.
- **Focal positions (exact):** `ego · egoChildren · egoParents · egoSiblings · everyone`.
- **Genetics is recursive** over the lineage with a **visited-set** (consanguinity-safe); never first-degree-only. Sex-dependent steps with `unknown` sex yield `unknown` (sex-blocked), surfaced distinctly.
- **Categorical statuses only** — no numeric probabilities.
- **NEVER run e2e/Playwright locally** — CI owns e2e.
- Reference spec: `docs/superpowers/specs/2026-06-26-narrative-pedigree-design.md` (genetics rules in §3 are authoritative; the research team has reviewed them).

---

## File Structure

- `packages/shared-consts/src/narrative-pedigree.ts` (new) — `INHERITANCE_PATTERNS`, `FOCAL_POSITIONS`; `src/index.ts` export.
- `packages/protocol-validation/src/schemas/8/stages/narrative-pedigree.ts` (new) + `stages/index.ts` + `schema.ts` cross-refs.
- `packages/interview/src/interfaces/NarrativePedigree/` (new):
  - `genetics/geneticGraph.ts` — annotated graph + traversal/propagation helpers.
  - `genetics/resolveSex.ts` — per-person biological sex.
  - `genetics/status.ts` — `Status` type, precedence, affected-set.
  - `genetics/patterns/{autosomal,xLinked,uniparental}.ts` — per-pattern rules.
  - `genetics/computeStatuses.ts` — orchestrator.
  - `focalResolver.ts`, `highlight.ts`.
  - `components/StickerNode.tsx`, `components/ClassicNotationNode.tsx`, `components/NarrativePedigreeView.tsx`, `components/PresetSwitcher.tsx`.
  - `export/snapshot.ts`.
  - `NarrativePedigree.tsx` (main).
- `packages/interview/src/interfaces/index.tsx` (modify) — register.
- `apps/architect-web/src/components/sections/NarrativePedigree/{SourceStage,Diseases,Presets,Behaviours}.tsx` (new) + `StageEditor/Interfaces.tsx` + `Screens/NewStageScreen/interfaceOptions.ts` (modify).

---

## Task 1: shared-consts pattern + focal-position constants

**Files:**

- Create: `packages/shared-consts/src/narrative-pedigree.ts`; Modify: `src/index.ts`
- Test: `src/__tests__/narrative-pedigree.test.ts`

**Interfaces:**

- Produces: `INHERITANCE_PATTERNS`, `type InheritancePattern`, `FOCAL_POSITIONS`, `type FocalPosition`.

- [ ] **Step 1: Failing test** — assert `INHERITANCE_PATTERNS` and `FOCAL_POSITIONS` equal the exact arrays from Global Constraints.
- [ ] **Step 2: Run** `pnpm --filter @codaco/shared-consts test -- narrative-pedigree` → FAIL.
- [ ] **Step 3: Implement** the two `as const` arrays + derived types; export from `src/index.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shared-consts): add narrative-pedigree inheritance-pattern and focal-position constants`.

---

## Task 2: Schema — `NarrativePedigree` stage type

**Files:**

- Create: `packages/protocol-validation/src/schemas/8/stages/narrative-pedigree.ts`
- Modify: `stages/index.ts` (add to discriminated union + `StageType`), `schema.ts` (cross-refs)
- Test: `stages/__tests__/narrative-pedigree.test.ts`

**Interfaces:**

- Consumes: `INHERITANCE_PATTERNS`, `FOCAL_POSITIONS`.
- Produces: `narrativePedigreeStage` with `sourceStageId`, `diseases`, `presets`, `behaviours`.

- [ ] **Step 1: Failing test** — a valid NarrativePedigree stage parses; `presets[].diseases` referencing an undeclared disease id fails (protocol-level); `sourceStageId` not pointing at a FamilyPedigree fails; duplicate disease/preset ids fail.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the schema exactly as spec §1 (the `diseases`/`presets`/`behaviours` shapes), register in `stages/index.ts`, and add the `superRefine` cross-references in `schema.ts` (sourceStage is a FamilyPedigree; disease vars resolve on the source node type; preset disease ids exist; `findDuplicateId`).
- [ ] **Step 4: Run** → PASS; run full schema suite.
- [ ] **Step 5: Commit** `feat(protocol-validation): add NarrativePedigree stage type`.

---

## Task 3: Genetics — annotated genetic graph

**Files:**

- Create: `packages/interview/src/interfaces/NarrativePedigree/genetics/geneticGraph.ts`
- Test: `genetics/__tests__/geneticGraph.test.ts`

**Interfaces:**

- Consumes: network `nodes`/`edges`, the source `variableConfig` (relationshipType, gameteRole, biologicalSex variables) and a `resolveSex` function (Task 4).
- Produces:
  - `buildGeneticGraph(nodes, edges, variableConfig): GeneticGraph`
  - `GeneticGraph` with: `parentsOf(id): {id, sex}[]` (genetic = `biological`|`donor` edges into id, each annotated with the parent's resolved sex), `childrenOf(id): string[]`, `fullSiblingsOf(id): string[]`, `halfSiblingsOf(id): string[]`, `descendants(id): Set<string>`, `ancestors(id): Set<string>`, and `propagate(seedIds, step, visited?)` — a generic BFS that applies `step(currentId) => nextIds` until exhaustion, tracking a visited-set so consanguinity loops terminate.

- [ ] **Step 1: Failing tests** — using a small fixture (ego, two parents, both shared by a full sibling; one parent shared by a half sibling): `parentsOf(ego)` returns both parents with correct sexes; `fullSiblingsOf(ego)` includes the full sib and excludes the half sib; `halfSiblingsOf(ego)` includes the half sib; `propagate` from ego over `childrenOf` terminates on a consanguinity loop (build a small cyclic fixture) without infinite recursion.
- [ ] **Step 2: Run** `pnpm --filter @codaco/interview test -- geneticGraph` → FAIL.
- [ ] **Step 3: Implement** — build adjacency from `biological`/`donor` edges only; annotate each parent edge with `resolveSex(parentId)`; partition siblings by the set of shared parents (full = both parents shared; half = exactly one). Implement `propagate` with an explicit `Set` visited guard.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(interview): genetic graph builder for narrative pedigree`.

---

## Task 4: Genetics — sex resolution

**Files:**

- Create: `genetics/resolveSex.ts`; Test: `genetics/__tests__/resolveSex.test.ts`

**Interfaces:**

- Produces: `resolveSex(nodeId, nodes, edges, variableConfig): 'female' | 'male' | 'unknown'`.

- [ ] **Step 1: Failing tests** — explicit `biologicalSexVariable === 'female'` → `female`; no explicit value but the person is the `gameteRole === 'egg'` parent on an outgoing edge → `female`; `sperm` → `male`; `intersex`/absent/leaf → `unknown`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — read `biologicalSexVariable`; if `female`/`male`, return it; else scan outgoing parent edges for a `gameteRoleVariable` of `egg`→female/`sperm`→male; else `unknown`. (`intersex`/`unknown` map to `unknown` for sex-linked use.)
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(interview): biological-sex resolution for narrative pedigree genetics`.

---

## Task 5: Genetics — status types, precedence, affected set

**Files:**

- Create: `genetics/status.ts`; Test: `genetics/__tests__/status.test.ts`

**Interfaces:**

- Produces: `type Status = 'affected'|'obligateAffected'|'obligateCarrier'|'atRiskAffected'|'atRiskCarrier'|'unknown'`; `mergeStatus(a, b): Status` (keeps the higher-precedence per the spec order); `affectedSet(nodes, diseaseVariable): Set<string>` (only `=== true`; everyone else is `unknown` by omission).

- [ ] **Step 1: Failing tests** — `mergeStatus('atRiskCarrier','affected') === 'affected'`; `mergeStatus('unknown','atRiskAffected') === 'atRiskAffected'`; precedence order `affected > obligateAffected > obligateCarrier > atRiskAffected > atRiskCarrier > unknown`; `affectedSet` contains only `true` nodes.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the type, a precedence-indexed `mergeStatus`, and `affectedSet`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(interview): status taxonomy and precedence for narrative pedigree`.

---

## Task 6: Genetics — autosomal patterns (AD + AR)

**Files:**

- Create: `genetics/patterns/autosomal.ts`; Test: `genetics/__tests__/autosomal.test.ts`

**Interfaces:**

- Consumes: `GeneticGraph`, `affectedSet`, `mergeStatus`.
- Produces: `computeAutosomalDominant(graph, affected): Map<string, Status>`, `computeAutosomalRecessive(graph, affected): Map<string, Status>`.

- [ ] **Step 1: Failing tests** (canonical pedigrees, per spec §3):
  - **AD skipped generation:** affected grandparent → unaffected parent → affected child ⇒ the middle parent is `obligateCarrier` (child of an affected AND parent of an affected); the affected child's own unaffected children are `atRiskAffected`.
  - **AD de novo:** affected child with no affected ancestor ⇒ parents are `atRiskAffected`/`unknown`, **never** `obligateCarrier`.
  - **AR:** both parents and every child of an affected person are `obligateCarrier`; an unaffected **full** sibling of an affected person is `atRiskAffected`; a **half** sibling (one shared carrier parent) is `atRiskCarrier`; grandparents/aunts/uncles of an affected person are `atRiskCarrier`.
- [ ] **Step 2: Run** `pnpm --filter @codaco/interview test -- autosomal` → FAIL.
- [ ] **Step 3: Implement** the two functions as recursive propagations with a visited-set, exactly per spec §3 AD and AR bullets. Use `fullSiblingsOf`/`halfSiblingsOf` to split `atRiskAffected` vs `atRiskCarrier`. Where full/half cannot be determined, downgrade to `atRiskCarrier`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(interview): autosomal-dominant and -recessive status computation`.

---

## Task 7: Genetics — X-linked patterns (XLR + XLD)

**Files:**

- Create: `genetics/patterns/xLinked.ts`; Test: `genetics/__tests__/xLinked.test.ts`

**Interfaces:**

- Consumes: `GeneticGraph`, `resolveSex`, `affectedSet`, `mergeStatus`.
- Produces: `computeXLinkedRecessive(...)`, `computeXLinkedDominant(...)`.

- [ ] **Step 1: Failing tests** (per spec §3):
  - **XLR obligate:** every daughter of an affected male is `obligateCarrier`; a female with two affected sons (or an affected son + an affected maternal-line male) is `obligateCarrier`.
  - **XLR de novo downgrade:** the mother of a **single** affected male with no other affected male relative is `atRiskCarrier`, **not** obligate.
  - **XLR maternal line:** sons of a carrier female and maternal uncles of an affected male are `atRiskAffected`; the maternal grandmother and maternal aunts are `atRiskCarrier`; **no male-to-male transmission** (an affected male confers nothing to his sons).
  - **XLR sex-blocked:** a leaf with `unknown` sex → `unknown`.
  - **XLD:** every daughter of an affected male is `obligateAffected`; his sons get nothing from him; each child of an affected female is `atRiskAffected`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** both functions, recursive up the maternal line and down maternal branches with a visited-set; sex-dependent steps return `unknown` when `resolveSex` is `unknown`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(interview): X-linked recessive and dominant status computation`.

---

## Task 8: Genetics — uniparental patterns (Y + mitochondrial) + orchestrator

**Files:**

- Create: `genetics/patterns/uniparental.ts`, `genetics/computeStatuses.ts`; Test: `genetics/__tests__/uniparental.test.ts`, `genetics/__tests__/computeStatuses.test.ts`

**Interfaces:**

- Produces: `computeYLinked(...)`, `computeMitochondrial(...)`, and `computeStatuses(graph, affected, pattern, resolveSex): Map<string, Status>` dispatching on `InheritancePattern` (multifactorial/unknown → only `affected` entries; everyone else omitted = `unknown`).

- [ ] **Step 1: Failing tests** (per spec §3):
  - **Y-linked:** every male in unbroken male-line descent from — and male-line ancestors of — an affected male is `obligateAffected`; females get nothing.
  - **Mitochondrial:** every child of an affected/transmitting female is `atRiskAffected`; recursion continues **down daughters only** (through clinically-unaffected daughters) and stops at every male; up the maternal line.
  - **Orchestrator:** `multifactorial`/`unknown` patterns return only the `affected` nodes (no carrier/at-risk inference); dispatch routes each pattern to the right module.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** both pattern functions (recursive, visited-set, sex-gated) and `computeStatuses` dispatch.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(interview): Y-linked, mitochondrial, and orchestrated status computation`.

---

## Task 9: Focal resolver

**Files:**

- Create: `focalResolver.ts`; Test: `__tests__/focalResolver.test.ts`

**Interfaces:**

- Produces: `resolveFocal(position: FocalPosition, graph, egoId): Set<string>` — `ego`→{ego}; `egoChildren`/`egoParents`/`egoSiblings` via graph; `everyone`→all node ids.

- [ ] **Step 1: Failing tests** — each `FOCAL_POSITIONS` value resolves to the expected id set on a fixture; missing ego → empty set.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(interview): focal-node-by-position resolver`.

---

## Task 10: Highlight computer

**Files:**

- Create: `highlight.ts`; Test: `__tests__/highlight.test.ts`

**Interfaces:**

- Produces: `computeHighlight(focalIds, graph, statusesByDisease): { nodes: Set<string>, edges: Set<string> }` — focal ids ∪ their genetic-lineage relatives whose status (any shown disease) is not `unknown`, plus the edges connecting them; callers dim everything else.

- [ ] **Step 1: Failing test** — on a fixture with an affected grandparent in a focal child's lineage, the highlight set includes the focal child, the affected lineage, and the connecting edges, and excludes an unrelated branch.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (BFS over the genetic lineage from focal ids, including a relative iff some shown disease status ≠ `unknown`; collect traversed edges). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(interview): focal highlight + inheritance-pathway computation`.

---

## Task 11: Sticker node (placement + status style + overflow)

**Files:**

- Create: `components/StickerNode.tsx`; Test: `components/__tests__/StickerNode.test.tsx` + a Storybook story `StickerNode.stories.tsx`.

**Interfaces:**

- Consumes: a node, the per-disease `{ color, status }` list, the resolved node `shape`.
- Produces: the existing `Node` plus a sticker overlay — colour = disease, style = status (`solid`=affected, `double-ring`=obligateAffected, `ring+dot`=obligateCarrier, `half`=atRiskAffected, `dot`=atRiskCarrier, `?`=unknown), placed around the perimeter from top-left clockwise by shape; overflow beyond N capped with `+N` (tap reveals full list).

- [ ] **Step 1: Failing tests** — given three diseases with distinct statuses, three stickers render with the right style classes at perimeter positions for a square; a 7-disease node caps at N with a `+N` marker; `unknown` renders the `?` style (not absence).
- [ ] **Step 2: Run** `pnpm --filter @codaco/interview test -- StickerNode` → FAIL.
- [ ] **Step 3: Implement** — a placement function `stickerPositions(shape, count)` returning coordinates around the perimeter (square/circle/diamond) starting top-left clockwise (unit-test it separately); render markers with per-status SVG styling; cap + `+N`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(interview): disease-sticker node for narrative pedigree`.

---

## Task 12: Classic-notation node (single-disease mode)

**Files:**

- Create: `components/ClassicNotationNode.tsx`; Test: `components/__tests__/ClassicNotationNode.test.tsx`

**Interfaces:**

- Consumes: a node, the single disease `{ color, status }`, the resolved `shape`.
- Produces: a node whose symbol encodes status with traditional notation (filled = affected; central dot = carrier statuses; etc.) and the label rendered underneath; no stickers.

- [ ] **Step 1: Failing tests** — `affected` → filled symbol; `obligateCarrier`/`atRiskCarrier` → central dot; `unknown` → plain symbol with `?`; label rendered beneath.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(interview): classic pedigree-notation node for single-disease mode`.

---

## Task 13: PNG snapshot export

**Files:**

- Create: `export/snapshot.ts`; Test: `export/__tests__/snapshot.test.ts`
- Modify: `packages/interview/package.json` (add `html-to-image` to the interview package's own deps — app-specific, regular version per CLAUDE.md).

**Interfaces:**

- Produces: `exportSnapshot(element: HTMLElement, filename: string): Promise<void>` — rasterises the element to PNG and triggers a download.

- [ ] **Step 1: Failing test** — mock `html-to-image`'s `toPng` and assert `exportSnapshot` calls it with the element and triggers an anchor download with the filename.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** with `html-to-image`. **Step 4: Run** → PASS. Run `pnpm knip` to confirm the new dep is detected as used.
- [ ] **Step 5: Commit** `feat(interview): PNG snapshot export`.

---

## Task 14: Main view — mode selection, presets, click-to-refocus

**Files:**

- Create: `components/PresetSwitcher.tsx`, `components/NarrativePedigreeView.tsx`, `NarrativePedigree.tsx`
- Modify: `packages/interview/src/interfaces/index.tsx` (register `case 'NarrativePedigree'`)
- Test: `__tests__/NarrativePedigreeView.test.tsx` + a Storybook story.

**Interfaces:**

- Consumes: stage config, the shared network (filtered to the source node/edge types), `computeStatuses`, `resolveFocal`, `computeHighlight`, the two node components, `exportSnapshot`.

- [ ] **Step 1: Failing tests** — the active preset's shown-disease count selects the node mode (1 → ClassicNotationNode, ≥2 → StickerNode); the PresetSwitcher changes shown diseases/focal and recomputes highlight; with `allowFocalReselection`, clicking a member re-runs the focal/highlight; the "Save snapshot" control calls `exportSnapshot`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — `NarrativePedigreeView` resolves the source stage's node/edge types from `sourceStageId`, builds the genetic graph, computes statuses for the active preset's diseases, resolves focal + highlight, renders through `PedigreeLayout` with a `renderNode` choosing the mode, dims non-highlighted nodes/edges, mounts the `PresetSwitcher` and a snapshot button. `NarrativePedigree.tsx` is the thin interface entry. Register in `interfaces/index.tsx`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(interview): NarrativePedigree read-only interface view`.

---

## Task 15: Architect config UI + new-stage option

**Files:**

- Create: `apps/architect-web/src/components/sections/NarrativePedigree/{SourceStage,Diseases,Presets,Behaviours}.tsx`
- Modify: `StageEditor/Interfaces.tsx`, `Screens/NewStageScreen/interfaceOptions.ts`
- Test: section tests following existing patterns.

- [ ] **Step 1: Failing tests** — `SourceStage` lists the protocol's FamilyPedigree stages; `Diseases` edits `{ variable, label, colour, inheritancePattern (from INHERITANCE_PATTERNS) }` rows; `Presets` edits `{ label, diseases (multi-select), focal (FOCAL_POSITIONS) }`; `Behaviours` toggles `allowFocalReselection`; NarrativePedigree appears in the New Stage screen.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** following `sections/Narrative/*` patterns; register in `INTERFACE_CONFIGS` and `interfaceOptions.ts`. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(architect): NarrativePedigree configuration UI`.

---

## Task 16: Integration stories + verification

**Files:**

- Create: `NarrativePedigree.stories.tsx` — a captured pedigree under several presets (multi-disease sticker view; single-disease classic view), focal reselection, and a PNG-export smoke test.

- [ ] **Step 1** Author the stories using `SyntheticInterview` (seed a pedigree with disease booleans + sexes) + `StoryInterviewShell`.
- [ ] **Step 2** Run `pnpm --filter @codaco/interview test --project units` for these stories.
- [ ] **Step 3** Run `pnpm typecheck`, `pnpm lint:fix`, `pnpm knip` at root; fix at source.
- [ ] **Step 4: Commit** `test(interview): narrative pedigree integration stories`.

---

## Self-Review notes (author)

- **Spec coverage:** new stage type (T2), shared consts (T1), genetics engine (T3–T8, the corrected §3 rules), focal (T9), highlight (T10), sticker mode (T11), classic mode (T12), export (T13), presets/behaviours/mode-select/registration (T14), architect (T15), stories (T16) — all mapped. Data-model prereqs are Plan #1 (T7/T8), referenced not duplicated.
- **Type consistency:** `Status` is the six-member union everywhere; `computeStatuses(graph, affected, pattern, resolveSex)`; `resolveSex(...) → 'female'|'male'|'unknown'`; `resolveFocal(...) → Set<string>`; `computeHighlight(...) → {nodes,edges}`.
- **Genetics ordering:** T3–T5 (graph/sex/status) precede the pattern tasks T6–T8; T10 depends on T8 (statuses) and T3 (graph); T14 depends on T9–T13.
- **Risk:** the per-pattern modules are the highest-value and highest-risk; their tests encode the adversarial-review cases verbatim and the research team reviews expected outputs before merge.
