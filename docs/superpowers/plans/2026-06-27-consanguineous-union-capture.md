# Consanguineous-Union Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a participant partner with an existing relative (consanguineous unions) and attribute children to that union, and make the NarrativePedigree genetics engine consanguinity-correct for the resulting recessive-homozygosity risk.

**Architecture:** Two largely-independent tracks. **Track A (capture & rendering, FamilyPedigree):** add a `partnerCandidates()` selector, extend the Add-partner form with an existing-or-new picker + screening prompt, route an existing-partner choice to an **edge-only** add (never `addNode`), and exercise/harden the already-built-but-dormant consanguinity rendering (NSGC double-line + duplicate-arc loops). **Track B (genetics & UI, NarrativePedigree):** de-duplicate genetic edges at ingestion, then add a **non-lattice `atRiskHomozygous` flag** as a _parallel map_ (the existing `computeStatuses` and lattice are untouched; a new `computeAtRiskHomozygous` computes the flag separately), set by a two-sided AR rule and an XLR daughter rule, and surface it in `StickerNode`/`ClassicNotationNode`.

**Tech Stack:** TypeScript (strict, no `any`/`as`/barrel files), React, Vitest, Storybook (interaction tests), `@codaco/protocol-utilities` `SyntheticInterview` for story fixtures.

**Source spec:** `docs/superpowers/specs/2026-06-27-consanguineous-union-capture-design.md` (read it; §-references below point to it).

## Global Constraints

Every task implicitly includes these. Copied from the spec and project conventions:

- **No data-model change.** Consanguinity is derived from graph structure; **no** new "consanguinity"/"degree" field. (spec §"Guiding principle", §7)
- **Never duplicate the partner.** Choosing an existing person as a partner creates **only** a partner edge; **never call `addNode`**. The same node must be reachable as both relative and partner (the mating loop). (spec §1.3)
- **Candidate scope:** `partnerCandidates` excludes exactly **self, parents, children, full siblings** (first-degree). Everyone else (cousins, half-sibs, uncle/niece, grandparents) is eligible; already-current partners are NOT hard-excluded (store de-dups identical edges). (spec §1.2)
- **Genetics flag is non-lattice & parallel.** `computeStatuses → Map<string, Status>` is **unchanged**. The flag is a **separate** `Map<string, boolean>` from a new `computeAtRiskHomozygous`, merged by monotone **OR**, never touching the precedence lattice. The status precedence (certainty order) is `affected(0) < obligateAffected(1) < obligateCarrier(2) < atRiskAffected(3) < atRiskCarrier(4) < unknown(5)`; lower index = more certain = wins `mergeStatus`. (spec §4.2)
- **AR elevation predicate is two-sided & allele-conditioned, NOT consanguinity/ancestor-detection:** a child gets the flag iff it has **≥2 distinct parents each `atRiskCarrier`-or-higher (status ≠ unknown) for the same disease**. This must also fire for unrelated compound-het lines; it must **NOT** gate on ancestor-set intersection. One-sided risk never flags. No segregating allele → no flag (all `unknown`). (spec §4.1, §4.3)
- **XLR daughter rule:** a daughter of an **affected father + carrier-or-affected mother** (same disease) keeps her primary `obligateCarrier` status **and** gets the flag. Sex required: if either parent's sex is `unknown`, omit the flag. (spec §4.3)
- **No consanguinity logic for AD / XLD / Y / mitochondrial / multifactorial** — these never change under consanguinity; do not add code for them. (spec §4.3, §7)
- **Never invent an `unaffected` status.** Absence from a result map = `unknown`. A loop never manufactures `obligate*` from topology; the autozygosity case is `atRiskHomozygous` (a flag), never `obligateAffected`. (spec §4.5)
- **UI copy must NOT read as reassurance.** The flag indicator must clearly signal _risk of being affected_, visually distinct from primary-status symbols. (spec §4.2)
- **Research-team sign-off gate (BLOCKING for merge), folds into the existing PR #713 genetics gate.** The §4 genetics changes (taxonomy/flag approach; the two-sided threshold of two merely-`atRiskCarrier` parents flagging the same as two obligate; known-carrier seeding; degree-scaling; multifactorial) need research-team sign-off before merge. Build it; do not merge without sign-off. (spec §6)
- **Project conventions:** TypeScript strict — **no `any`, no `as`-to-bypass, no `!` non-null assertions, no barrel files**; migrate call sites (no compat shims); run the formatter + `oxlint --fix` (pre-commit hook does this); add a **changeset** for `@codaco/interview` (released); run **targeted Vitest** per task; **never run e2e/Playwright locally** (CI owns e2e); defer `pnpm typecheck`/`pnpm knip` to ONE pass at the end (per project memory). Interview vitest uses `--project=units` locally.

---

## File structure

**Track A (capture & rendering) — `packages/interview/src/interfaces/FamilyPedigree/`:**

- `components/wizards/parentCandidates.ts` — add `partnerCandidates()` (Task A1).
- `components/wizards/__tests__/parentCandidates.test.ts` — tests (A1, A2).
- `components/AddPersonForm.tsx` — existing-or-new screening + picker (A3).
- `pedigree-layout/components/PedigreeView.tsx` — `handleAddPerson` routing (A4).
- `pedigree-layout/__tests__/connectors.test.ts` — double-line connector test (A5).
- `FamilyPedigree.consanguinity.stories.tsx` — representation + creation-via-wizard (A5).

**Track B (genetics & UI) — `packages/interview/src/interfaces/NarrativePedigree/`:**

- `genetics/geneticGraph.ts` + `genetics/__tests__/geneticGraph.test.ts` — edge de-dup (B1).
- `genetics/computeStatuses.ts` — new `computeAtRiskHomozygous` orchestrator (B2).
- `genetics/patterns/autosomal.ts` — `computeAutosomalRecessiveHomozygous` (B2).
- `genetics/patterns/xLinked.ts` — `computeXLinkedRecessiveHomozygous` (B3).
- `genetics/__tests__/{autosomal,xLinked,computeStatuses}.test.ts` — tests (B2, B3).
- `components/StickerNode.tsx` + `__tests__/StickerNode.test.tsx` — flag marker (B4).
- `components/ClassicNotationNode.tsx` + `__tests__/ClassicNotationNode.test.tsx` — flag notation (B5).
- `NarrativePedigreeView.tsx` — thread `statusesByDiseaseHomozygous` (B6).

The two tracks are independent (different interfaces, different concerns) and may be implemented in either order or in parallel. **B1 (de-dup) must land before B2** (the two-sided count needs distinct parents). Within Track A, A1 → A3 → A4 (A3/A4 consume `partnerCandidates`); A5 is independent (pre-seeded). The final task (C1) is cross-cutting.

---

## Track A — Capture & Rendering

### Task A1: `partnerCandidates()` selector

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/parentCandidates.ts` (add export after `siblingIds`, ~line 110)
- Test: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/__tests__/parentCandidates.test.ts`

**Interfaces:**

- Produces: `export function partnerCandidates(anchorId: string, nodes: Map<string, NcNode>, edges: Map<string, NcEdge>, variableConfig: VariableConfig): Set<string>` — every node except `anchorId`, its parents, its children, and its full siblings.
- Consumes: existing private helpers in the same file — `parentIdsOf`, `siblingIds`, `descendantIds`.

- [ ] **Step 1: Write the failing test.** In `parentCandidates.test.ts`, build a small graph using the file's existing test idiom (an `NcEdge` map + `VariableConfig`; mirror the existing `geneticParentCandidates` tests in this file). Tree: `ego` with parents `mum`,`dad`; `ego`'s child `kid`; `ego`'s full sibling `sib` (shares both parents); a `cousin` (child of `dad`'s sibling `uncle`); `grandma` (`mum`'s parent). Assert:

```ts
const c = partnerCandidates('ego', nodes, edges, variableConfig);
expect([...c].sort()).toEqual(['cousin', 'grandma', 'uncle'].sort());
expect(c.has('ego')).toBe(false); // self
expect(c.has('mum')).toBe(false); // parent
expect(c.has('dad')).toBe(false); // parent
expect(c.has('kid')).toBe(false); // child
expect(c.has('sib')).toBe(false); // full sibling
```

- [ ] **Step 2: Run it; verify it fails** with "partnerCandidates is not a function". Run: `pnpm --filter @codaco/interview exec vitest run --project units parentCandidates`

- [ ] **Step 3: Implement.** Add after `siblingIds`:

```ts
/**
 * People eligible to be partnered with `anchorId`: everyone except the node
 * itself and its first-degree relatives (parents, children, full siblings).
 * Second-degree+ relatives (cousins, half-sibs, uncle/niece, grandparents) are
 * eligible — this is what makes consanguineous unions capturable.
 */
export function partnerCandidates(
  anchorId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const excluded = new Set<string>([anchorId]);
  for (const p of parentIdsOf(anchorId, edges, variableConfig)) excluded.add(p);
  for (const c of childIdsOf(anchorId, edges, variableConfig)) excluded.add(c);
  for (const s of fullSiblingIds(anchorId, edges, variableConfig))
    excluded.add(s);
  const result = new Set<string>();
  for (const id of nodes.keys()) if (!excluded.has(id)) result.add(id);
  return result;
}
```

Note: `siblingIds` returns full+half siblings; first-degree excludes **full** siblings only. If a `fullSiblingIds` helper does not exist, add a private one (siblings sharing **both** parents) and a private `childIdsOf` (direct children, non-partner edges `from === anchorId`). Reuse `parentIdsOf`. Do not exclude half-siblings (second-degree, eligible).

- [ ] **Step 4: Run the test; verify it passes.**

- [ ] **Step 5: Commit.** `git add` the two files; `git commit -m "feat(interview): partnerCandidates selector for existing-partner picker"`

---

### Task A2: Verify partners are already valid co-parents (children of the union)

**Files:**

- Test only: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/__tests__/parentCandidates.test.ts`

**Interfaces:**

- Consumes: existing `geneticParentCandidates(anchorId, 'child', edges, variableConfig)` (no code change — this verifies the spec §2 "children fall out" claim).

- [ ] **Step 1: Write the test.** Add a `partner` edge `ego`⟷`cousin`. Assert the partner is offered as a co-parent of ego's child:

```ts
const coParents = geneticParentCandidates(
  'ego',
  'child',
  edges,
  variableConfig,
);
expect(coParents.has('cousin')).toBe(true); // partner is a valid co-parent
```

- [ ] **Step 2: Run it; verify it passes** (no production change — this confirms the dormant path). If it fails, STOP and report — the §2 assumption is wrong and the plan needs revisiting.

- [ ] **Step 3: Commit.** `git commit -m "test(interview): confirm an existing partner is a valid co-parent (union children)"`

---

### Task A3: Add-partner form — existing-or-new screening + picker

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/AddPersonForm.tsx`

**Interfaces:**

- Produces: the form result now carries `partnerType: 'existing' | 'new'` and (when `existing`) `existingPartnerId: string`. The `new` branch keeps today's fields (`name`, `current`, the per-child `parentType-{id}`).
- Consumes: `partnerCandidates` (A1); `buildNodeOptions` (existing, `components/wizards/buildNodeOptions.ts`) to turn the candidate `Set<string>` into labelled radio options.

- [ ] **Step 1: Write the failing test** (interaction, in a new/existing AddPersonForm test or a Storybook play — match the local idiom; if AddPersonForm has no test, add `components/__tests__/AddPersonForm.test.tsx`). With a pedigree that has an eligible `cousin`, render the form, assert the screening RadioGroup is present (`'Is this person already in your family tree'`), select **existing**, assert the existing-person picker lists `cousin` and the new-person fields are hidden; select **new**, assert `PersonFields` (name) is shown.

- [ ] **Step 2: Run it; verify it fails.**

- [ ] **Step 3: Implement.** Mirror `BioTriadStep`'s existing-or-new pattern (`RadioGroupField` + `FieldGroup watch=[...] condition`). Structure:
  - A screening `Field name="partnerType"` `RadioGroupField` with options `[{value:'existing', label:'Yes — already in the family tree'},{value:'new', label:'No — add a new person'}]`, prompt **"Is this person already in your family tree / related to you?"**, `initialValue` `'new'` (preserves today's default behaviour).
  - `FieldGroup watch={['partnerType']} condition={v => v.partnerType === 'existing'}`: a required `Field name="existingPartnerId"` `RadioGroupField` whose `options` come from `buildNodeOptions(partnerCandidates(anchorNodeId, nodes, edges, variableConfig), nodes, edges, variableConfig, framing)` (match `buildNodeOptions`'s real signature). Plus the `current`/`ex` RadioGroup (a chosen existing partner still has a current/ex status).
  - `FieldGroup watch={['partnerType']} condition={v => v.partnerType === 'new'}`: the **current** form body (`PersonFields` + `current`/`ex` + the per-child `parentType-{id}` fields), unchanged.
  - Keep the wording matter-of-fact and non-stigmatising (spec §1.1); ask it of everyone (do not gate on any attribute).

- [ ] **Step 4: Run the test; verify it passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(interview): add-partner existing-or-new picker + screening prompt"`

---

### Task A4: Route an existing-partner choice to an edge-only add

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeView.tsx` (`handleAddPerson`, ~lines 137-164)
- Test: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/__tests__/PedigreeView.test.tsx` (or the nearest existing harness)

**Interfaces:**

- Consumes: the A3 form result (`partnerType`, `existingPartnerId`).

- [ ] **Step 1: Write the failing test.** Drive the partner flow choosing an existing `cousin`; assert **exactly one** new edge is created (a `partner` edge `from: ego, to: cousin`) and **no** new node (`addNode` not called). Then a control: choosing **new** still creates a node + edge as today.

- [ ] **Step 2: Run it; verify it fails.**

- [ ] **Step 3: Implement.** In `handleAddPerson`, after `const result = await openDialog(...)` and the early `if (!result) return;`, branch on `result.partnerType`:

```ts
if (
  result.partnerType === 'existing' &&
  typeof result.existingPartnerId === 'string'
) {
  addEdge({
    from: nodeId,
    to: result.existingPartnerId,
    attributes: {
      [relationshipTypeVariable]: ['partner'],
      [isActiveVariable]: result.current !== 'ex',
    },
  });
  return; // NEVER addNode — preserve the mating loop
}
// else: existing new-person flow (addNode + partner edge + parentType edges), unchanged
```

Place the branch so the existing `new`-person path runs unchanged when `partnerType !== 'existing'` (including the legacy default).

- [ ] **Step 4: Run the test; verify it passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(interview): link an existing relative as a partner (no node duplication)"`

---

### Task A5: Exercise & harden the consanguinity rendering (stories + connector test)

**Files:**

- Create: `packages/interview/src/interfaces/FamilyPedigree/FamilyPedigree.consanguinity.stories.tsx`
- Test: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/__tests__/connectors.test.ts` (check whether it exists; if not, create it)
- Likely modify (bug-fix only, as driven out): `pedigree-layout/sugiyamaLayout.ts`, `pedigree-layout/connectors.ts`

**Interfaces:**

- Consumes: the consanguinity detection (`sugiyamaLayout.ts` ancestor-intersection → `group===2`) and the double-line/duplicate-arc connectors (`connectors.ts`), both currently **dormant**.

> ⚠️ These paths have never executed — expect latent bugs (ancestor traversal on the loop, `group` off-by-one, `doubleSegment` y-offset, duplicate-arc geometry). Fix what the story/tests drive out; keep fixes minimal and covered by a test.

- [ ] **Step 1: Connector unit test (failing).** In `connectors.test.ts`, construct a `PedigreeLayout` whose partner pair has `group[i][j] === 2`, call the connector entry point (`computeConnectors(layout, scaling, parents, ...)` — match the real signature), and assert the group line has `double === true` and a defined `doubleSegment`; and a negative case `group===1` → `double === false`, no `doubleSegment`. Run; verify it fails or surfaces a bug.

- [ ] **Step 2: Make it pass** — implement the connector test's fixture and fix any `connectors.ts` bug it reveals (e.g. `doubleSegment` not always paired with `double`). Run; green.

- [ ] **Step 3: Representation story.** In `FamilyPedigree.consanguinity.stories.tsx`, build a pre-seeded fixture with `SyntheticInterview` (mirror `FamilyPedigree.cousins.stories.tsx`; **include mandatory `framing` and `boundaries`** on the stage). Shape: shared grandparents → two of their children (ego's parent + the cousin's parent) → ego and the cousin (first cousins) → a `partner` edge **between ego and the cousin** (both existing) → a shared child (biological edges from ego and cousin). Render via `StoryInterviewShell`. Add a play function asserting the canvas renders with **no console error** and the union shows the double line.

- [ ] **Step 4: Drive it in Storybook and fix latent bugs.** Start Storybook (`pnpm --filter @codaco/interview storybook`), open the story, and fix any layout/connector crash or mis-render (ancestor loop, duplicate-arc geometry, double-line position) until it renders cleanly. Add a focused unit test for each non-trivial fix. **Do not** run e2e/Playwright — drive the story in the browser only.

- [ ] **Step 5: Creation-via-wizard story.** Add a second story starting from a network with ego, ego's parents/grandparents, and the cousin's branch already present, then a play function that opens **Add partner** on ego, picks the existing cousin, and adds a shared child — asserting the union + child render. (Reuses A3/A4.)

- [ ] **Step 6: Commit.** `git commit -m "feat(interview): consanguinity rendering stories; harden double-line/loop layout"`

---

## Track B — Genetics & UI flag

### Task B1: Edge de-duplication in `buildGeneticGraph`

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/genetics/geneticGraph.ts` (edge-ingestion loop, ~lines 110-126)
- Test: `packages/interview/src/interfaces/NarrativePedigree/genetics/__tests__/geneticGraph.test.ts`

**Interfaces:**

- Produces: `parentsOf`/`childrenOf`/`fullSiblingsOf`/`halfSiblingsOf` now count **distinct** individuals — a duplicated `parent→child` edge is ingested once.

- [ ] **Step 1: Write the failing test.** Using the file's edge fixture idiom (`makeGeneticEdge` or equivalent), ingest **two identical** `A→child` parent edges (no second parent). Assert `graph.parentsOf('child')` returns exactly **one** entry for `A`. Run; verify it returns two (fails).

- [ ] **Step 2: Implement de-dup.** In the edge-ingestion loop, before pushing a genetic (parent→child) edge to `parentMap`/`childMap`, key it `` `${parentId}>${childId}` `` in a `Set<string>` and skip if seen. Ensure `fullSiblingsOf`/`halfSiblingsOf` (derived from the de-duped maps) are also clean. Do not change non-genetic (`partner`) handling.

- [ ] **Step 3: Run; verify it passes.**

- [ ] **Step 4: Add the correctness guard test.** A single **affected** parent `A` via a **duplicated** edge → `child` is `obligateCarrier`, **never** `obligateAffected` (the duplicate must not satisfy `bothParentsAffected`). Run; green.

- [ ] **Step 5: Commit.** `git commit -m "fix(interview): de-duplicate genetic edges so count predicates stay distinct"`

---

### Task B2: `computeAtRiskHomozygous` orchestrator + AR two-sided rule

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/genetics/computeStatuses.ts` (add `computeAtRiskHomozygous`)
- Modify: `packages/interview/src/interfaces/NarrativePedigree/genetics/patterns/autosomal.ts` (add `computeAutosomalRecessiveHomozygous`)
- Test: `genetics/__tests__/autosomal.test.ts`, `genetics/__tests__/computeStatuses.test.ts`

**Interfaces:**

- Produces:
  - `export function computeAtRiskHomozygous(graph: GeneticGraph, statuses: Map<string, Status>, pattern: InheritancePattern, resolveSex: (id: string) => Sex): Map<string, boolean>` — dispatches `autosomalRecessive → computeAutosomalRecessiveHomozygous(graph, statuses)`, `xLinkedRecessive → computeXLinkedRecessiveHomozygous(graph, statuses, resolveSex)` (Task B3), **all other patterns → empty `Map`**. `statuses` is the already-computed primary status map for the same disease/pattern (so the flag computation reuses it, no recompute).
  - `export function computeAutosomalRecessiveHomozygous(graph: GeneticGraph, statuses: Map<string, Status>): Map<string, boolean>`.
- Consumes: B1 (distinct parents); `computeStatuses` (unchanged) for the `statuses` input.

`computeStatuses` and the `Status` lattice/`mergeStatus` are **unchanged** (Global Constraints).

- [ ] **Step 1: Write the failing AR tests** in `autosomal.test.ts` (use the file's fixture + a `status()`-style helper). Build first-cousin shared-ancestry fixtures (great-grandparent → two children → the two cousins → shared child). Compute primary AR `statuses`, then `computeAutosomalRecessiveHomozygous(graph, statuses)`:
  - **Autozygous cousin union:** GGP `affected`; cousins each `atRiskCarrier`; child → flag **true**.
  - **Unrelated compound-het:** two **disjoint** carrier lines, each producing an `atRiskCarrier` parent of the child → flag **true** (proves no ancestor-intersection gating).
  - **One-sided guard:** one carrier parent + one `unknown` parent → flag **false** (omitted).
  - **No segregating allele:** `affected` empty → empty map (no flags).

```ts
const statuses = computeAutosomalRecessive(graph, affected); // primary, unchanged
const flags = computeAutosomalRecessiveHomozygous(graph, statuses);
expect(flags.get('child')).toBe(true); // two-sided carriers
expect(flags.get('oneSidedChild') ?? false).toBe(false);
```

- [ ] **Step 2: Run; verify they fail** ("computeAutosomalRecessiveHomozygous is not a function").

- [ ] **Step 3: Implement the AR rule.** Add `computeAutosomalRecessiveHomozygous(graph, statuses)`: for each `id` in the graph's node ids, collect **distinct** parents via `graph.parentsOf(id)`; count parents whose `statuses.get(parentId)` is **`atRiskCarrier`-or-higher** — i.e. status is present and **not** `unknown` (the set `{affected, obligateAffected, obligateCarrier, atRiskAffected, atRiskCarrier}`). If `count >= 2`, set `result.set(id, true)`. Return the map (omission = false). **Do not** gate on ancestor intersection; **do not** mutate `statuses`. Add `computeAtRiskHomozygous` in `computeStatuses.ts` dispatching as in Interfaces (others → `new Map()`).

- [ ] **Step 4: Run; verify the AR tests pass.**

- [ ] **Step 5: Orchestrator + invariants tests** in `computeStatuses.test.ts`: AD/Y/mito/multifactorial patterns → `computeAtRiskHomozygous` returns an **empty** map (no flag); the AR flag is idempotent (a child reachable by two paths or with two shared ancestors → flagged once, never escalated). Run; green.

- [ ] **Step 6: Commit.** `git commit -m "feat(interview): non-lattice atRiskHomozygous flag + two-sided AR autozygosity rule"`

---

### Task B3: XLR daughter rule

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/genetics/patterns/xLinked.ts` (add `computeXLinkedRecessiveHomozygous`)
- Test: `genetics/__tests__/xLinked.test.ts`

**Interfaces:**

- Produces: `export function computeXLinkedRecessiveHomozygous(graph: GeneticGraph, statuses: Map<string, Status>, resolveSex: (id: string) => Sex): Map<string, boolean>`. Wired into `computeAtRiskHomozygous` (B2 dispatch).

- [ ] **Step 1: Write the failing tests** in `xLinked.test.ts`:
  - Affected **father** (`resolveSex` male, status `affected`) + carrier **mother** (`resolveSex` female, status `obligateCarrier` or `atRiskCarrier`) → **daughter** (`resolveSex` female) flag **true**; her primary status stays `obligateCarrier` (assert via the unchanged `computeXLinkedRecessive`).
  - Control: affected father + **non-carrier** mother (`unknown`) → daughter flag **false**.
  - Sex-unknown guard: either parent `resolveSex` `unknown` → flag **false** (omitted).

- [ ] **Step 2: Run; verify they fail.**

- [ ] **Step 3: Implement.** Add `computeXLinkedRecessiveHomozygous(graph, statuses, resolveSex)`: for each `id` with `resolveSex(id) === 'female'`, inspect `graph.parentsOf(id)`; if one parent is **male** with `statuses` `affected`/`obligateAffected` **and** another parent is **female** with `statuses` in `{affected, obligateAffected, obligateCarrier, atRiskCarrier}`, set `result.set(id, true)`. If either relevant parent's sex is `unknown`, do not set. Return the map.

- [ ] **Step 4: Run; verify they pass.**

- [ ] **Step 5: Commit.** `git commit -m "feat(interview): XLR daughter at-risk-homozygous flag (affected father + carrier mother)"`

---

### Task B4: Surface the flag in `StickerNode`

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/StickerNode.tsx` (`DiseaseSticker` type ~line 9; `StickerMarker` ~178-217)
- Test: `packages/interview/src/interfaces/NarrativePedigree/components/__tests__/StickerNode.test.tsx`

**Interfaces:**

- Consumes: `DiseaseSticker` gains `atRiskHomozygous?: boolean`.
- Produces: a distinct marker with a stable test hook `data-atrisk-homozygous-marker` and a **non-reassuring** accessible label.

- [ ] **Step 1: Failing test:** a sticker with `atRiskHomozygous: true` renders an element matching `[data-atrisk-homozygous-marker]`; a sticker with it false/omitted does **not**; a combined `status: 'obligateCarrier'` + `atRiskHomozygous: true` renders **both** the carrier symbol and the flag marker (distinct elements).

- [ ] **Step 2: Run; verify it fails.**

- [ ] **Step 3: Implement.** Add `atRiskHomozygous?: boolean` to `DiseaseSticker`. In `StickerMarker`, after the primary-status marker, conditionally render a second, visually distinct SVG marker (e.g. a small triangle) at a different position, with `data-atrisk-homozygous-marker` and an `aria-label`/`<title>` that signals risk — **not** reassurance (e.g. "At risk of being affected (homozygous)"). Do not alter the primary-status rendering.

- [ ] **Step 4: Run; verify it passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(interview): StickerNode at-risk-homozygous indicator"`

---

### Task B5: Surface the flag in `ClassicNotationNode`

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/ClassicNotationNode.tsx` (`ClassicDisease` type ~line 7; `NotationOverlay` ~233-256; `ClassicNotationNode` ~273-298)
- Test: `packages/interview/src/interfaces/NarrativePedigree/components/__tests__/ClassicNotationNode.test.tsx`

**Interfaces:**

- Consumes: `ClassicDisease` gains `atRiskHomozygous?: boolean`.
- Produces: a distinct overlay with test hook `data-atrisk-homozygous-notation` and a non-reassuring label.

- [ ] **Step 1: Failing test:** parallel to B4 — flag true renders `[data-atrisk-homozygous-notation]`; false/omitted does not; combined obligateCarrier + flag renders both; verify across the node shapes (square/circle/diamond).

- [ ] **Step 2: Run; verify it fails.**

- [ ] **Step 3: Implement.** Add `atRiskHomozygous?: boolean` to `ClassicDisease`; pass it from `ClassicNotationNode` into `NotationOverlay`; in `NotationOverlay`, after the primary overlay, conditionally render a distinct corner marker with the data hook and non-reassuring label.

- [ ] **Step 4: Run; verify it passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(interview): ClassicNotationNode at-risk-homozygous notation"`

---

### Task B6: Thread the flag from the engine to the view

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/NarrativePedigreeView.tsx` (`statusesByDisease` useMemo ~181-196; `renderClassic` ~305-321; `renderSticker` ~323-333)

**Interfaces:**

- Consumes: `computeAtRiskHomozygous` (B2); `DiseaseSticker.atRiskHomozygous` (B4); `ClassicDisease.atRiskHomozygous` (B5).

- [ ] **Step 1: Failing test** (component or Storybook play): with a pre-seeded cousin-union pedigree where the AR rule flags the child, `NarrativePedigreeView` renders the child's sticker/classic node with the at-risk-homozygous marker; a non-flagged node does not. (Mirror the existing NarrativePedigree story fixtures; the stage needs `framing`+`boundaries`.)

- [ ] **Step 2: Run; verify it fails.**

- [ ] **Step 3: Implement.** Add a parallel `statusesByDiseaseHomozygous` useMemo: for each shown disease, `computeAtRiskHomozygous(graph, statusesByDisease.get(disease.id), pattern, resolveSex)`. In `renderClassic`/`renderSticker`, read `statusesByDiseaseHomozygous.get(disease.id)?.get(node.id) ?? false` and pass it as `atRiskHomozygous` on `ClassicDisease`/`DiseaseSticker`. Keep the two memos' dependency lists in sync (diseases, pattern, graph).

- [ ] **Step 4: Run; verify it passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(interview): wire at-risk-homozygous flag from genetics engine into the pedigree view"`

---

## Task C1: Changeset, gate note, and final verification

**Files:**

- Create: `.changeset/<name>.md`
- Verify across the branch.

- [ ] **Step 1: Changeset.** `pnpm changeset` → **minor** for `@codaco/interview`; summary: "Family Pedigree: capture consanguineous unions (partner with an existing relative) and their children; consanguinity-correct recessive-homozygosity risk (research-team sign-off required)."

- [ ] **Step 2: PR/gate note.** Add to the PR body that the §4 genetics changes require **research-team sign-off** (the spec §6 items) and fold into the existing PR #713 genetics gate — do not merge without it.

- [ ] **Step 3: One verification pass.** `pnpm --filter @codaco/interview exec vitest run --project units` (all green); then `pnpm typecheck` and `pnpm knip` once (per project convention — defer to the end). Fix any fallout. Do **not** run e2e locally.

- [ ] **Step 4: Commit.** `git commit -m "chore(interview): changeset for consanguineous-union capture"`

---

## Self-review notes

- **Spec coverage:** §1 → A1/A3/A4; §2 → A2; §3 → A5; §4.4 de-dup → B1; §4.2 flag → B2 + B4/B5/B6; §4.3 AR → B2, XLR → B3; §4.3 "no AD/XLD/Y/mito/multifactorial change" → B2 Step 5 (empty-map assertion); §6 gate → C1; §7 out-of-scope → respected (no data-model field, no first-degree picker, no F-tiers).
- **Type consistency:** `partnerCandidates` (A1) signature matches its A3/A4 consumers; `computeAtRiskHomozygous`/`computeAutosomalRecessiveHomozygous`/`computeXLinkedRecessiveHomozygous` (B2/B3) signatures match the B6 caller; `atRiskHomozygous?: boolean` on `DiseaseSticker`/`ClassicDisease` (B4/B5) matches B6's pass-through. `computeStatuses` + `Status` lattice unchanged throughout.
- **Resolved design fork:** parallel-map flag (additive) over the composite-`StatusResult` refactor (breaking) — see Architecture / Global Constraints.
