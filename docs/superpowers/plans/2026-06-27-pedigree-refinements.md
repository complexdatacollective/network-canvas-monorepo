# Pedigree Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the FamilyPedigree intro/wizard and rework the NarrativePedigree
interaction model, focal behaviour, and visuals (PR #713 follow-up).

**Architecture:** Replace NarrativePedigree's preset model with a persistent
disease legend + interactive single-disease focus and inheritance-aware focal
dimming; share one status-marker component between sticker and classic nodes;
swap FamilyPedigree's language selector to RichSelectGroup and fold the
biological-parents step into the editable Information step.

**Tech Stack:** React 19, Zustand/redux-form, fresco-ui (Base-UI), Zod schema 8,
Vitest + Storybook interaction tests.

## Global Constraints

- TypeScript strict: no `any`, no `as`-to-bypass, no `!` non-null assertions, no
  barrel files.
- Reuse fresco-ui; build new UI on Base-UI primitives (no raw-div widgets).
- Every interactive control: keyboard operable, visible focus, `aria-live`
  announcements for view/focal changes; icon-only buttons get `aria-label`.
- Participant copy: plain, whole, externalisable strings; no leaked internal
  vocabulary; disease colours (`disease.color`) are author data, chrome uses
  design tokens.
- Schema 8 is unreleased → no migrations.
- No backwards-compat shims; migrate all call sites.
- Disease colours are arbitrary author hex; do not tokenise them.
- Defer `pnpm typecheck` / `pnpm knip` to the final task; run targeted Vitest per
  task. Never run e2e/Playwright locally.
- Changesets (minor) for released packages changed: `@codaco/fresco-ui`,
  `@codaco/protocol-validation`, `@codaco/interview`, and `@codaco/shared-consts`
  if its exports change. `apps/architect-web` is an app (no changeset).
- B3 (contributor highlight) is genetics-domain logic → it folds into the PR #713
  research-team genetics sign-off gate; verify it adversarially.

---

### Task 1: Camera icon in fresco-ui

**Files:**

- Create: `packages/fresco-ui/src/icons/camera.svg.react.tsx`
- Modify: `packages/fresco-ui/src/icons/customIcons.ts`

**Interfaces:**

- Produces: `InterviewerIconName` union gains `'camera'`; `<Icon name="camera" />`
  renders a camera glyph.

- [ ] **Step 1:** Inspect an existing `*.svg.react.tsx` (e.g.
      `add-a-screen.svg.react.tsx`) and the `customIcons.ts` registry to mirror the
      exact export shape (component name, props, `currentColor` fill, the registry
      key→component mapping).
- [ ] **Step 2:** Create `camera.svg.react.tsx` — a simple camera outline using
      `fill="currentColor"` / `stroke="currentColor"`, `aria-hidden`, matching the
      viewBox/size conventions of the sibling icons.
- [ ] **Step 3:** Register it in `customIcons.ts` under key `camera` so
      `InterviewerIconName` includes `'camera'`.
- [ ] **Step 4:** If fresco-ui has an icon gallery story, confirm `camera` appears;
      otherwise add a minimal render assertion. Run the fresco-ui icon test if present.
- [ ] **Step 5:** Commit: `feat(fresco-ui): add camera icon`.

---

### Task 2: Shared status-marker component

**Files:**

- Create: `packages/interview/src/interfaces/NarrativePedigree/components/StatusMarker.tsx`
- Create: `packages/interview/src/interfaces/NarrativePedigree/components/__tests__/StatusMarker.test.tsx`

**Interfaces:**

- Produces: `StatusMarker({ status, color, variant, atRiskHomozygous? })` where
  `variant: 'sticker' | 'classic'` selects sticker (small, in a coloured
  background chip) vs classic (large pedigree-notation overlay) rendering. Renders
  the six status symbologies (solid / double-ring / ring-dot / half / dot /
  unknown) + the at-risk-homozygous triangle, in the disease `color`. Exposes the
  same `data-*` test hooks the current StickerMarker / NotationOverlay use
  (`data-sticker-status` for sticker variant, `data-notation-status` parity left
  to consumers).
- Consumes: `Status` from `../genetics/status`.

This consolidates the parallel SVG sets currently in `StickerNode.tsx` (lines
41–256) and `ClassicNotationNode.tsx` (lines 20–282). Keep both visual styles
identical to today's, parameterised by `variant`.

- [ ] **Step 1:** Write `StatusMarker.test.tsx` asserting: for each `Status`, the
      expected marker shape renders (query the distinguishing `data-*`/element);
      `atRiskHomozygous` adds the triangle; the disease `color` is applied. Cover both
      variants.
- [ ] **Step 2:** Run it — fails (no component).
- [ ] **Step 3:** Implement `StatusMarker.tsx` by lifting the existing SVG markers
      (sticker variant ← StickerNode markers; classic variant ← ClassicNotationNode
      overlays), preserving shapes, strokes, and `data-*` hooks.
- [ ] **Step 4:** Run the test — passes.
- [ ] **Step 5:** Commit: `feat(interview): shared StatusMarker for pedigree nodes`.

---

### Task 3: computeContributors (inheritance-aware highlight)

**Files:**

- Modify/replace: `packages/interview/src/interfaces/NarrativePedigree/highlight.ts`
- Create: `packages/interview/src/interfaces/NarrativePedigree/__tests__/highlight.test.ts`

**Interfaces:**

- Produces: `computeContributors(focalId: string | null, graph: GeneticGraph,
statusesByDisease: Map<string, Map<string, Status>>): { nodes: Set<string>;
edges: Set<string> }`. When `focalId` is null → `{ nodes: <all node ids>, edges:
<all genetic edges> }` (nothing dimmed). Otherwise: the highlighted node set is
  the focal plus every **ancestor reachable from the focal through a chain of
  transmitting nodes** — walk parents only, and from a node continue to a parent
  only if that **parent has a non-`unknown` status for at least one disease in
  `statusesByDisease`**. The focal is always included regardless of its own
  status. `edges` = `parentId->childId` keys between two highlighted nodes.
- Consumes: `GeneticGraph` (`parentsOf`, `propagate`), `Status`.
- Keep `edgeKey(parentId, childId)` exported (unchanged).

Algorithm:

```ts
export function computeContributors(focalId, graph, statusesByDisease) {
  if (focalId === null) {
    const nodes = new Set(graph.nodeIds());
    const edges = new Set<string>();
    for (const id of nodes)
      for (const c of graph.childrenOf(id))
        if (nodes.has(c)) edges.add(edgeKey(id, c));
    return { nodes, edges };
  }
  // Ancestors-only walk, gated on the *parent* being a transmitter.
  const nodes = graph.propagate([focalId], (id) =>
    graph
      .parentsOf(id)
      .map((p) => p.id)
      .filter((pid) => hasNonUnknownStatus(pid, statusesByDisease)),
  );
  const edges = new Set<string>();
  for (const id of nodes)
    for (const c of graph.childrenOf(id))
      if (nodes.has(c)) edges.add(edgeKey(id, c));
  return { nodes, edges };
}
```

`hasNonUnknownStatus` is the existing helper (keep it). `propagate` seeds the
visited set with the focal, so the focal is always present even if no ancestor
transmits.

- [ ] **Step 1:** Write `highlight.test.ts` building small `GeneticGraph`s (via
      `buildGeneticGraph` with a stub `resolveSex`) covering:
      (a) focal=null → all nodes highlighted, none dimmed;
      (b) dominant: affected grandparent → affected parent → focal: grandparent+parent
      highlighted, focal's children/siblings dimmed;
      (c) a non-transmitting branch (unknown-status parent) is NOT highlighted;
      (d) recessive both-parent contribution: both carrier lineages highlighted;
      (e) **partner-side**: disease enters via the focal's father-in-law → partner →
      child(focal); focal's maternal (ego) side dimmed, partner side highlighted;
      (f) all-diseases union: contributor set is the union across two diseases.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement `computeContributors`; remove the old bidirectional
      `computeHighlight` (no shim).
- [ ] **Step 4:** Run — passes.
- [ ] **Step 5:** Commit: `feat(interview): inheritance-aware contributor highlight`.

---

### Task 4: DiseaseLegend component

**Files:**

- Create: `packages/interview/src/interfaces/NarrativePedigree/components/DiseaseLegend.tsx`
- Create: `packages/interview/src/interfaces/NarrativePedigree/components/__tests__/DiseaseLegend.test.tsx`

**Interfaces:**

- Produces: `DiseaseLegend({ diseases, selectedDiseaseId, onSelect })` where
  `diseases: { id, label, color }[]`, `selectedDiseaseId: string | null`,
  `onSelect: (id: string | null) => void`. Renders an "All diseases" control +
  one control per disease (colour swatch + label); the active one is marked
  (`aria-pressed`/`aria-checked`). Selecting calls `onSelect(id)` or
  `onSelect(null)`.

- [ ] **Step 1:** Write `DiseaseLegend.test.tsx`: renders an "All diseases" button
  - one per disease; active reflects `selectedDiseaseId`; clicking a disease calls
    `onSelect(diseaseId)`; clicking the active disease (or "All diseases") calls
    `onSelect(null)`; each control is keyboard-focusable with an accessible name.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement using fresco-ui `Button`/`Badge` (or a Base-UI
      toggle-group) — token chrome, no raw divs; colour swatch uses the disease hex via
      inline `backgroundColor`. Keyboard + visible focus.
- [ ] **Step 4:** Run — passes.
- [ ] **Step 5:** Commit: `feat(interview): NarrativePedigree disease legend`.

---

### Task 5: StickerNode visuals + shared marker

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/StickerNode.tsx`
- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/stickerPositions.ts`
- Modify/Create tests: `…/components/__tests__/stickerPositions.test.ts` (create if absent)

**Interfaces:**

- Consumes: `StatusMarker` (Task 2). `StickerNode` keeps its public props
  (`label, shape, diseases, color?, selected?, highlighted?`).

- [ ] **Step 1 (geometry test):** Write/extend `stickerPositions.test.ts` asserting
      positions lie **on the rendered shape outline**: for `circle`, every point
      satisfies `(x-0.5)²+(y-0.5)² ≈ 0.25` (on the inscribed circle, not the bounding
      box corners); for `square`, points lie on the box edges; for `diamond`, on the
      rhombus edges. (Today the circle case already uses the inscribed circle; assert
      it and add the missing coverage.)
- [ ] **Step 2:** Run — adjust `stickerPositions` until the geometry test passes
      for all three shapes (fix any off-perimeter mapping).
- [ ] **Step 3:** In `StickerNode.tsx`: increase `STICKER_SIZE_PX` (start ~22) and
      give each sticker a **solid background** chip (token surface colour, e.g.
      `bg-[var(--surface-1)]` or `Surface`) behind the `StatusMarker`; replace the inline
      marker SVGs with `<StatusMarker variant="sticker" … />`. Keep `data-sticker-status`
      and the overflow/at-risk-homozygous behaviour.
- [ ] **Step 4:** Run the StickerNode/story unit tests that assert
      `[data-sticker-status]` presence — pass. (Visual size/background is tuned later in
      Storybook by the user.)
- [ ] **Step 5:** Commit: `feat(interview): larger backgrounded perimeter stickers`.

---

### Task 6: ClassicNotationNode — disease colour, smaller, shared marker

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/ClassicNotationNode.tsx`

**Interfaces:**

- Consumes: `StatusMarker` (Task 2). Keeps props (`node, disease, shape, label`).

- [ ] **Step 1:** Replace the inline `NotationOverlay` SVG set with
      `<StatusMarker variant="classic" status={status} color={disease.color}
atRiskHomozygous={…} />`.
- [ ] **Step 2:** Change the underlying `Node` body colour so the symbol reads in
      the **disease colour** (match the all-diseases sticker for that disease) rather
      than `node-color-seq-1`; reduce the rendered size (smaller than today's `sm`
      footprint — verify against the layout). Keep `data-notation-status` + the label.
- [ ] **Step 3:** Run the SingleDiseaseClassicView-style unit assertions
      (`[data-notation-status]` present, no `[data-sticker-status]`) — pass.
- [ ] **Step 4:** Commit: `feat(interview): disease-coloured shared-marker classic node`.

---

### Task 7: NarrativePedigree node-label fix (TDD)

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.tsx`
- Possibly modify: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeNode.tsx` (`computeNodeDisplayLabels`) and/or `…/FamilyPedigree/utils/getDisplayLabel.ts`
- Create: `…/NarrativePedigree/components/__tests__/labels.test.tsx`

**Interfaces:**

- No signature change; behavioural fix.

Symptom: multiple nodes render `'You'` (e.g. the whole top row) and generic
relationship labels instead of the seeded names. Suspects: `labelFor`
(`NarrativePedigreeView.tsx:261`) returns `'You'` for any `egoVariable===true`
node; `computeNodeDisplayLabels` keys by `_uid`, excludes ego, reads
`node.attributes[nodeLabelVariable]`; `labelFor` looks up `displayLabels.get(node.id)`
(verify `node.id === _uid`); framing hardcoded `'gamete'`.

- [ ] **Step 1:** Write `labels.test.tsx` that builds the story network
      (`buildPedigreeInterview`) and renders the view (or directly exercises the label
      derivation), asserting: each named node shows its **seeded name** (Eleanor,
      Arthur, Rose, …), exactly **one** node shows `'You'` (ego), and no node shows an
      incorrect generic/`'You'` label.
- [ ] **Step 2:** Run — fails (reproduces the bug). Diagnose the root cause from the
      failure (name not read vs ego-fallback misfiring vs id/\_uid key mismatch).
- [ ] **Step 3:** Fix at the root (e.g. correct the `displayLabels` key, gate the
      `'You'` fallback on the actual ego id, and/or read the stored name in `labelFor`).
      Do not regress FamilyPedigree's own labels — if touching `computeNodeDisplayLabels`,
      run the FamilyPedigree label tests too.
- [ ] **Step 4:** Run both — pass.
- [ ] **Step 5:** Commit: `fix(interview): correct NarrativePedigree node labels`.

---

### Task 8: NarrativePedigreeView rework (legend + focal + snapshot)

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.tsx`
- Delete: `packages/interview/src/interfaces/NarrativePedigree/components/PresetSwitcher.tsx`

**Interfaces:**

- Consumes: `DiseaseLegend` (T4), `computeContributors` (T3), `StickerNode` (T5),
  `ClassicNotationNode` (T6), `ActionButton` + camera icon (T1).

- [ ] **Step 1:** Replace preset state with `const [selectedDiseaseId,
setSelectedDiseaseId] = useState<string|null>(null)` and `const [focalId,
setFocalId] = useState<string|null>(null)`. Remove `activePresetIndex`,
      `activePreset`, `presets`/`behaviours` reads, and the `PresetSwitcher` import.
- [ ] **Step 2:** `shownDiseases` = all `diseases` when `selectedDiseaseId===null`,
      else the single selected disease. Drive sticker-vs-classic off `shownDiseases.length`
      (unchanged). A node sticker click for disease D calls `setSelectedDiseaseId(D.id)`
      (wire an `onSelectDisease` from StickerNode/StickerMarker).
- [ ] **Step 3:** `highlight = computeContributors(focalId, graph, statusesByDisease)`.
      Any node click sets `setFocalId(node.id)`; the focal node renders emphasised
      (`Node selected`/`highlighted`). Always allow node selection (drop `allowReselect`).
- [ ] **Step 4:** Render `<DiseaseLegend diseases={diseases} selectedDiseaseId
onSelect={setSelectedDiseaseId} />` where the switcher was; add a **"Clear focus"**
      control shown when `focalId !== null` calling `setFocalId(null)`; replace the text
      snapshot `Button` with `<ActionButton iconName="camera" aria-label="Save snapshot"
onClick={handleSnapshot} />`.
- [ ] **Step 5:** Add an `aria-live="polite"` region announcing disease selection
      ("Showing all diseases" / "Showing <label>") and focal changes ("Focused on
      <label>. Showing who contributes to their inheritance." / "Focus cleared.").
- [ ] **Step 6:** Run the (to-be-rewritten in T11) targeted story/unit checks that
      compile against this file; at minimum ensure the file typechecks in isolation and
      existing non-preset assertions pass. Commit: `feat(interview): legend + interactive
focal NarrativePedigree view`.

---

### Task 9: Remove presets/behaviours from schema + delete focal resolver

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/stages/narrative-pedigree.ts`
- Delete: `packages/interview/src/interfaces/NarrativePedigree/focalResolver.ts` (+ its test if any)
- Modify: `packages/shared-consts/src/…` (remove `FOCAL_POSITIONS` + `FocalPosition` if now unused)

- [ ] **Step 1:** Remove the `presets` and `behaviours` blocks from
      `narrativePedigreeStage`; keep `diseases`. Update/trim the schema test fixtures
      that include presets/behaviours.
- [ ] **Step 2:** Delete `focalResolver.ts` and any import of it (the view no longer
      uses `resolveFocal` after Task 8).
- [ ] **Step 3:** Remove `FOCAL_POSITIONS`/`FocalPosition` from shared-consts if no
      longer referenced (grep first). Keep `INHERITANCE_PATTERNS`.
- [ ] **Step 4:** Run the protocol-validation schema tests for NarrativePedigree —
      pass. Commit: `refactor(protocol-validation): drop NarrativePedigree presets/behaviours`.

---

### Task 10: Architect — remove NarrativePedigree presets/behaviours editors

**Files:**

- Delete: `apps/architect-web/src/components/sections/NarrativePedigree/{Presets,PresetFields,Behaviours}.tsx` (+ tests)
- Modify: `apps/architect-web/src/components/StageEditor/Interfaces.tsx`
- Check: `apps/architect-web/src/lib/ProtocolSummary/components/Stage/Stage.tsx`

- [ ] **Step 1:** Remove `Presets` + `Behaviours` from the NarrativePedigree
      `sections` array and delete the `presets: []` / `behaviours` entries from its
      `template` in `INTERFACE_CONFIGS`.
- [ ] **Step 2:** Delete the three section component files (+ their tests).
- [ ] **Step 3:** Confirm `ProtocolSummary/Stage.tsx`'s generic `presets` extraction
      still compiles and renders nothing for NarrativePedigree (it's optional); adjust if
      it assumed presence.
- [ ] **Step 4:** Run architect-web's StageEditor/related unit tests — pass. Commit:
      `refactor(architect-web): remove NarrativePedigree presets/behaviours editor`.

---

### Task 11: Rewrite NarrativePedigree stories for the new model

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/NarrativePedigree.stories.tsx`

- [ ] **Step 1:** Remove `presets`/`allowFocalReselection` from the builder's
      NarrativePedigree stage config (keep `diseases`). Add a **partner-side disease**:
      give the partner an affected/transmitting parent (new nodes + biological edges) so
      a disease enters the children via the partner's lineage.
- [ ] **Step 2:** Rewrite the interaction stories for the new model:
  - `AllDiseasesStickerView`: default render → `[data-sticker-status]` present.
  - `SelectSingleDisease`: click a disease in the legend (by accessible name) →
    `[data-notation-status]` present, `[data-sticker-status]` absent; click "All
    diseases" → stickers return.
  - `FocalContributors`: click the partner-side child → assert the partner-side
    contributors are un-dimmed (`data-dimmed="false"`) and ego's maternal side is
    dimmed (`data-dimmed="true"`); click "Clear focus" → all un-dimmed.
  - `SaveSnapshot`: the snapshot ActionButton (`aria-label="Save snapshot"`) is
    present and clickable.
  - `Labels`: assert distinct correct labels (ties to Task 7).
- [ ] **Step 3:** Run the units project for these stories (`--project units`). Pass.
- [ ] **Step 4:** Commit: `test(interview): NarrativePedigree stories for legend/focal model`.

---

### Task 12: FamilyPedigree language selector → RichSelectGroup

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/quickStartWizard/FramingSelectionStep.tsx`

- [ ] **Step 1:** Replace the hand-rolled radio cards with `RichSelectGroupField`
      (mirror `AddPersonForm`'s usage): single-select, two options
      (`gamete`/`gendered`) with the reworded label + description copy from the spec.
      Keep writing the `framing` store value via the existing `setFraming`.
- [ ] **Step 2:** Update/extend the step's test (or add one) asserting both options
      render with the new copy and selecting one sets `framing`. Keyboard operability
      comes from RichSelectGroup.
- [ ] **Step 3:** Run the FamilyPedigree wizard/framing unit + story tests — pass.
- [ ] **Step 4:** Commit: `feat(interview): RichSelectGroup language selector`.

---

### Task 13: Fold biological-parents step into the Information step

**Files:**

- Delete: `packages/interview/src/interfaces/FamilyPedigree/components/quickStartWizard/BioParentsIntroStep.tsx` (+ test)
- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/EgoCellWizard.tsx`
- Modify: `apps/architect-web/src/components/StageEditor/Interfaces.tsx`

- [ ] **Step 1:** Define the default Information copy as a single externalisable
      string constant (framing-neutral biological-parents explanation adapted from
      `BioParentsIntroStep`), e.g.:
  > "Building a pedigree means asking about the people you're biologically
  > related to — not the people who raised you. A pedigree maps genetic
  > relationships, so we focus on biological parents. You'll be able to include
  > non-biological parents later."
- [ ] **Step 2:** In `Interfaces.tsx`, add `introScreen: { text: <that string> }`
      to `INTERFACE_CONFIGS.FamilyPedigree.template` so new stages pre-fill it
      (editable/removable; video field already present in the IntroScreen editor).
- [ ] **Step 3:** Remove the "Your biological parents" step from `EgoCellWizard.tsx`
      and delete `BioParentsIntroStep.tsx` (+ test). Confirm the Information (`IntroStep`)
      step still renders `introScreen.{title,text,video}` and is skipped only when
      `introScreen` is absent.
- [ ] **Step 4:** Run the FamilyPedigree wizard story/unit tests (the step-sequence
      fixtures must drop the bio-parents step) — pass.
- [ ] **Step 5:** Commit: `feat(interview): Information step replaces biological-parents step`.

---

### Task 14: Changesets + final verification

**Files:**

- Create: `.changeset/pedigree-refinements-*.md` (as needed)

- [ ] **Step 1:** Add changesets (minor): `@codaco/fresco-ui` (camera icon),
      `@codaco/protocol-validation` (drop presets/behaviours), `@codaco/interview`
      (interfaces + stories), and `@codaco/shared-consts` if `FOCAL_POSITIONS` export was
      removed. Describe behaviour, not internals.
- [ ] **Step 2:** Run `pnpm typecheck` (force/uncached), fix any cross-package
      breakage (the StageProps/`StageType` consumers, removed exports).
- [ ] **Step 3:** Run `pnpm knip` — resolve any newly-unused exports (e.g.
      `FOCAL_POSITIONS`, deleted components).
- [ ] **Step 4:** Run `pnpm lint:fix`. Run the interview + protocol-validation +
      architect-web + fresco-ui unit suites (`--project units` for interview).
- [ ] **Step 5:** Commit: `chore: changesets + verification for pedigree refinements`.
- [ ] **Step 6 (manual, user):** Tune sticker sizes/background, legend layout, and
      copy live in Storybook; confirm the new interaction in a browser.

---

## Self-review notes

- Spec coverage: A1→T12, A2→T13, B1→T9/T10, B2→T4/T8, B3→T3/T8/T11, B4→T7,
  B5→T5, B6→T2/T6, B7→T1/T8. All covered.
- Type consistency: `computeContributors` signature is used identically in T3 and
  T8; `StatusMarker` props identical in T2/T5/T6; `selectedDiseaseId|focalId` are
  the only new view state.
- Sequencing: T8 depends on T1–T7; T9/T10 remove schema/editor after T8 stops
  reading presets; T11 stories after T8/T9. Full typecheck/knip deferred to T14.
