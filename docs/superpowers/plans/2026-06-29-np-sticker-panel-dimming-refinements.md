# NarrativePedigree sticker / panel / dimming refinements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Refine the NarrativePedigree interface (PR #713): SVG stickers with uniform 50% perimeter overlap and consistent per-shape distribution, a dedicated sticker story + an args-driven StickerNode story, a Select-in-panel disease picker + a key panel, the camera button pinned bottom-right, ClassicNotationNode alignment fix, and focal dimming reworked from opacity to background-colour blending with a corrected edge-dimming rule.

**Architecture:** All work is in `packages/interview/src/interfaces/NarrativePedigree` plus the shared `FamilyPedigree/pedigree-layout` it consumes. Geometry is pure (`stickerPositions.ts`); rendering composes `@codaco/fresco-ui/Node`; panels reuse `@codaco/fresco-ui` `MotionSurface`/`Select`; dimming is driven by `computeContributors` in `highlight.ts`.

**Tech Stack:** React + TypeScript, Tailwind (interview dark theme tokens), Vitest, Storybook.

## Global Constraints

- **No `any`; no `as`-to-bypass type checking; no non-null `!`.** Resolve types at the source; use runtime guards, not assertions.
- **No barrel files.** Per-file subpath imports only (`import Node from '@codaco/fresco-ui/Node'`).
- **Never re-export for convenience.** Import from the original source. Only export what another module actually consumes (run `pnpm knip`).
- **Style with tokens, never hardcoded values.** Colours via CSS vars / Tailwind token utilities (`bg-*`, `text-*`, `var(--background)`, `var(--surface*)`, `var(--node-*)`, `var(--edge-*)`); elevation via `shadow=`/`elevation-*`; no hex, no raw px font sizes. Blends via `color-mix(in oklab, …, var(--background))`.
- **Accessibility:** every interactive control keyboard-operable and labelled; state changes announced via existing `aria-live`; decorative SVG `aria-hidden`. Reuse fresco-ui (Base-UI-backed) primitives — never raw `div`+`onClick`.
- **Participant tone (interview runtime):** plain, calm, second-person imperative; never leak `node`/`edge`/`ego`/`stage` vocabulary to participants. Key-panel copy must read for a participant.
- **Reuse before build:** walk Reuse → Compose → Extend → Build-new; mirror the closest existing component.
- **Run the formatter + `lint --fix`** on every file touched. Defer the full `typecheck`/`knip`/`test` sweep to the final task (run targeted Vitest per task).
- **interviewer-v8 is unreleased — no changeset for it.** Released packages (`@codaco/interview`, `@codaco/fresco-ui`) DO get changesets.
- **The interview theme is dark-only**, scoped by `data-theme-interview`. `color-mix(… var(--background))` only resolves to navy-taupe inside that region — Storybook fixtures must render inside the themed wrapper.

### Shared facts (apply to several tasks)

- `StickerNode.tsx`: `NODE_SIZE_PX = 96` (Node `size="sm"` = `size-24`), `STICKER_SIZE_PX = 22`, `STICKER_HALF = STICKER_SIZE_PX/2`, `STICKER_CAP = 6`. A sticker centre = `(pos.x*96, pos.y*96)`; the box is offset by `-STICKER_HALF`. **50% overlap ⇔ the normalized point lies exactly on the rendered perimeter line.**
- `Node.tsx` (fresco-ui): `NodeShape = 'circle'|'square'|'diamond'`. Circle = inscribed circle radius 0.5. Square `sm` = `rounded-[24px]`. **Diamond = the square layer with `scale-[0.85] rotate-45`** (`shapeLayerVariants`), so its real edge ring is `|x-0.5|+|y-0.5| = 0.5*0.85 = 0.425`. Node colour is driven by CSS vars `--base`/`--dark`; `color="custom"` lets the caller set `--base` via `style` (precedent: `ClassicNotationNode.tsx`). No opacity/dim prop exists.
- `computeContributors(focalId, graph, statusesByDisease)` (`highlight.ts`) returns `{ nodes: Set<string>, edges: Set<string> }`. `nodes` = focal ∪ transmitting ancestors (parents-only walk, gated on non-`unknown` status). `edges` = contributing parent→child edges keyed `edgeKey(parent, child)` = `` `${parentId}->${childId}` ``. Currently only `nodes` is consumed; `edges` is computed then discarded.

---

### Task 16: stickerPositions geometry — uniform 50% overlap + per-shape ordering

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/stickerPositions.ts`
- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/StickerNode.tsx` (cap + overflow guard only)
- Test: `packages/interview/src/interfaces/NarrativePedigree/components/__tests__/stickerPositions.test.ts`

**Interfaces:**

- Produces: `stickerPositions(shape: NodeShape, count: number): { x: number; y: number }[]` — unchanged signature; returns normalized `[0,1]²` points, ordered.

**Current behaviour (why it's wrong):** all shapes place points by equal **arc-length** walks. Square `count=4` → all four corners (worst overlap; skips edge-midpoints); `count=6` skips top-right/bottom-left corners and mixes 50%/0% overlap. Diamond uses the implicit `0.5` ring (un-scaled) so every point sits ~5px outside the rendered `0.425` edge (~27% overlap at midpoints, ~0–10% near vertices); arc-length placement clusters two faces.

**Target:**

- **Circle** — unchanged (even angles on the radius-0.5 ring; already exact 50%). Must support up to 8.
- **Square** — corners first, then edge-midpoints; `slice(0, count)`:
  ```ts
  const SQUARE_ANCHORS = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 }, // corners (CW from top-left)
    { x: 0.5, y: 0 },
    { x: 1, y: 0.5 },
    { x: 0.5, y: 1 },
    { x: 0, y: 0.5 }, // edge-midpoints
  ];
  ```
- **Diamond** — edge-midpoints first, then vertices, all on the rendered `R = 0.5 * DIAMOND_RENDER_SCALE = 0.425` ring; `slice(0, count)`:
  ```ts
  const DIAMOND_RENDER_SCALE = 0.85; // MUST track Node.tsx shapeLayerVariants scale-[0.85]; comment the dependency
  const R = 0.5 * DIAMOND_RENDER_SCALE; // 0.425 — sticker centre must sit on this ring, not 0.5
  const half = R / 2; // 0.2125 — a face midpoint on |dx|+|dy|=R is at (0.5 ± R/2, 0.5 ± R/2)
  const DIAMOND_ANCHORS = [
    { x: 0.5 - half, y: 0.5 - half },
    { x: 0.5 + half, y: 0.5 - half }, // top-left, top-right face midpoints
    { x: 0.5 + half, y: 0.5 + half },
    { x: 0.5 - half, y: 0.5 + half }, // bottom-right, bottom-left face midpoints
    { x: 0.5, y: 0.5 - R },
    { x: 0.5 + R, y: 0.5 }, // top, right vertices
    { x: 0.5, y: 0.5 + R },
    { x: 0.5 - R, y: 0.5 }, // bottom, left vertices
  ];
  ```

**StickerNode cap + overflow:** raise `STICKER_CAP` to `8`. The `+N` overflow position is `stickerPositions(shape, count+1)[count]`; for square/diamond this is `undefined` once 8 anchors are used (slice can't return a 9th), silently dropping the `+N` marker. Guard: when there are hidden diseases AND the next anchor is unavailable, reserve the **last** visible slot for `+N` (render `STICKER_CAP-1` stickers + the `+N` chip in slot `STICKER_CAP-1`) so the count is never lost. Keep circle's existing behaviour (it can compute slot 8).

**Steps:**

- [ ] Write failing tests: square `count=4` → exactly the 4 corners in order; `count=8` → corners then midpoints; diamond `count=4` → the 4 face-midpoints on the 0.425 ring (assert `|x-0.5|+|y-0.5| ≈ 0.425`); `count=8` → midpoints then vertices; circle `count=8` → 8 points all at radius 0.5 from centre. Assert ordering stability (prefix property: `positions(n)` is a prefix-compatible subset for the anchor shapes).
- [ ] Run the tests; confirm they fail.
- [ ] Replace `squarePerimeter`/`squareTToXY` and `diamondPerimeter`/`diamondTToXY` with the explicit anchor arrays sliced to `count`. Keep `circlePerimeter`. Remove now-dead helpers (knip).
- [ ] Apply the `STICKER_CAP = 8` + overflow guard in `StickerNode.tsx`.
- [ ] Run tests; confirm pass. Format + lint --fix.
- [ ] Commit.

**Notes / risks:** corner stickers on a `rounded-[24px]` square sit on the bounding-box corner where the fill is clipped by the rounded arc — slightly less than a pixel-perfect 50%, accepted per the corners-first spec. `AtRiskHomozygousMarker` rides the same `pos`; re-check it still lands bottom-right of its sticker after redistribution. Existing committed PNGs (`stickernode-all-statuses.png` etc.) will need regenerating in Task 23.

---

### Task 17: Sticker chip component + visuals + dedicated story

**Files:**

- Create: `packages/interview/src/interfaces/NarrativePedigree/components/Sticker.tsx`
- Create: `packages/interview/src/interfaces/NarrativePedigree/components/Sticker.stories.tsx`
- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/StickerNode.tsx` (consume `Sticker`)

**Interfaces:**

- Produces: `Sticker` component rendering one disease sticker chip. Props: `{ status: Status; color: string; atRiskHomozygous?: boolean; sizePx?: number; onClick?: () => void; interactive?: boolean }` (or equivalent). It renders the white circular chip + the `StatusMarker variant="sticker"` SVG glyph + the optional at-risk triangle. The chip's absolute positioning stays in `StickerNode` (Sticker is position-agnostic; `StickerNode` wraps it in the positioned span).
- Consumes: `StatusMarker` (`variant="sticker"`), `Status`/`STATUS_LABELS` from `../genetics/status`.

**Current behaviour:** the sticker chip is the inline `StickerMarker` span in `StickerNode.tsx` (`bg-[var(--surface-1)]`, `border-2 border-white`, `rounded-full overflow-hidden`, `STICKER_SIZE_PX = 22`). The status glyph is **already** drawn as SVG by `StatusMarker.tsx` (`variant="sticker"`, viewBox 20). The `classic` variant of StatusMarker is fully separate (own constants/components/switch) — editing the sticker glyph cannot regress classic.

**Changes:**

- **White background, no border:** chip className becomes `absolute rounded-full overflow-hidden` + `bg-white` (drop `border-2 border-white`, drop `bg-[var(--surface-1)]`). Keep `rounded-full overflow-hidden` so the glyph stays clipped to a circle. (`bg-white` is a token utility — acceptable for an explicit white chip; if a theme token is preferred use it, but white is the spec.)
- **Larger:** raise `STICKER_SIZE_PX` (22 → start at **28**, exposed so the story can vary it). `STICKER_HALF`, span dims, and `+N` chip all derive from it. **Scale the at-risk triangle proportionally** — today it's hardcoded `width/height 8` with `8`-px offsets; make it derive from `STICKER_SIZE_PX` (e.g. `~0.36 * STICKER_SIZE_PX`) so it stays corner-anchored at the new size.
- **SVG contents:** already satisfied by `StatusMarker variant="sticker"`; reuse it inside `Sticker` unchanged.

**Story:** `Sticker.stories.tsx` — render inside the interview-themed wrapper (so colours resolve). One grid story showing all six statuses for a sample disease colour, plus an interactive/args story exposing `status`, `color`, `atRiskHomozygous`, and `sizePx` so the size and look can be dialled in. Mark decorative pieces `aria-hidden` consistent with current behaviour.

**Steps:**

- [ ] Extract `Sticker` from `StickerNode`'s `StickerMarker` (keep the positioned span in StickerNode; move the chip visuals into `Sticker`). Apply white-bg/no-border + larger size + proportional triangle.
- [ ] Point `StickerNode` at the new `Sticker` (preserve the `pointer-events-auto cursor-pointer` interactive path and `stopPropagation` → `onSelectDisease`).
- [ ] Add `Sticker.stories.tsx` (themed wrapper; statuses grid + args story with `sizePx`).
- [ ] Targeted Vitest on any Sticker/StickerNode unit test; format + lint --fix.
- [ ] Commit.

**Risks:** removing the white border removes the separator between overlapping stickers and against the node body — verify contrast of a white chip on the dark node/background and where stickers overlap; the `+N` chip (`bg-slate-600 border-2 border-white`) is a separate element — keep it visually distinct (it is a count badge, not a sticker). Near-white disease colours on a white chip: the glyph strokes carry the colour so they remain visible, but eyeball it.

---

### Task 18: StickerNode single args-driven story

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/StickerNode.stories.tsx` (or create if absent)

**Goal:** one args-driven story (not many fixed stories) to verify overlap + distribution per shape. Args: `shape` (circle/square/diamond), `diseaseCount` (1–8, drives a generated `DiseaseSticker[]` with varied statuses + distinct disease colours), `selected`, `label`. Render inside the interview-themed wrapper. The reviewer/user uses this to confirm 50% overlap and corner-first/midpoint-first distribution.

**Steps:**

- [ ] Write the single `Default`/`Playground` story with `argTypes` (shape select; diseaseCount number/range 1–8; selected boolean).
- [ ] Generate `diseases` from `diseaseCount` (cycle through the six statuses + `var(--node-*)`/disease colour tokens).
- [ ] Verify it renders for all three shapes at counts 1, 4, 6, 8.
- [ ] Format + lint --fix. Commit.

---

### Task 19: ClassicNotationNode alignment fix (disease-selected misalignment)

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/ClassicNotationNode.tsx`
- Test/stories: `ClassicNotationNode.test.tsx` + `ClassicNotationNode.stories.tsx` if present

**Root cause:** the layout grid is measured once from `<Node size="sm">` (96px); `PedigreeLayout` places each node in a 96×96 cell **anchored top-left** and connectors assume the node centre is at `(containerWidth/2, containerHeight/2) = (48,48)` (`pedigreeAdapter.ts` `xOffset = metrics.containerWidth/2`). `StickerNode` renders `Node size="sm"` in a `relative inline-block` → fills the cell, centre at (48,48) → aligned. `ClassicNotationNode` renders `Node size="xs"` (**64px**, `ClassicNotationNode.tsx:86`) inside `inline-flex flex-col items-center gap-1` with the label **below** the symbol → symbol centre ≈ (32, <48) → ~16px horizontal shift + vertical offset → connectors don't meet it.

**Fix (minimal, no layout/adapter changes):**

- Change `ClassicNotationNode`'s `Node` from `size="xs"` to `size="sm"` so it fills the measured 96px cell.
- Centre the symbol in the cell so its centre lands at (48,48) — mirror `StickerNode`'s `relative inline-block` pattern. Prefer rendering the label via the `Node` `label` prop (as StickerNode does) so the external stacked label no longer pushes the symbol off-centre; if an external label is retained, position it so it does not shift the symbol's centre or overlap sibling rows.
- Verify `StatusMarker variant="classic"` (overlays the Node, takes `shape`) and `AtRiskHomozygousNotation` (absolute `right-0 bottom-0`) still read correctly at 96px. `diamondInset` is already derived from the 96px size, so it becomes correct once the symbol is 96px.

**Steps:**

- [ ] Adjust ClassicNotationNode to `size="sm"` + centred symbol (label via Node or non-shifting).
- [ ] Update/verify ClassicNotationNode tests and story; confirm symbol centre aligns to cell centre.
- [ ] Visual check against a multi-node layout (story) that connectors meet the symbol.
- [ ] Format + lint --fix. Commit. (Interface image `np-view-classic.png` regenerated in Task 23.)

---

### Task 20: NP overlay — camera bottom-right + disease Select panel + key panel

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.tsx`
- Create: `packages/interview/src/interfaces/NarrativePedigree/components/DiseaseSelectPanel.tsx`
- Create: `packages/interview/src/interfaces/NarrativePedigree/components/StickerKeyPanel.tsx`
- Likely delete or repurpose: `DiseaseLegend.tsx` (if fully replaced by the Select panel — confirm no other consumer; knip).

**(a) Camera bottom-right.** Currently the camera `ActionButton` sits inside the centered overlay row `pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-center gap-4` (`NarrativePedigreeView.tsx:455`), so it floats beside the legend. Move it into its own sibling wrapper pinned bottom-right, mirroring the established convention (`EgoCellWizard.tsx:156-170`, `NameGenerator/NodeForm.tsx:167`):

```tsx
<div className="absolute right-12 bottom-4 z-20">
  <ActionButton
    iconName="camera"
    aria-label="Save snapshot"
    onClick={handleSnapshot}
  />
</div>
```

`ActionButton` base class already carries `mt-2 mr-4` + `h-26` — match EgoCellWizard which accepts those built-in margins. Drop the `pointer-events-auto` (only needed inside a `pointer-events-none` parent; the standalone corner wrapper isn't one). Keep `exportSnapshot` capturing `viewRef` (the camera wrapper stays a sibling outside `viewRef`, so it is excluded from the snapshot).

**(b) Disease Select panel** (`DiseaseSelectPanel.tsx`). Replace the `DiseaseLegend` pill row with a fresco-ui **Styled Select** inside a `MotionSurface` panel styled to match the **Narrative preset panel** (`PresetSwitcher.tsx`: `MotionSurface` with `spacing="xs" shadow="xs"` rounded surface; the legend body uses the popover surface). Mirror that surface treatment — do **not** hardcode shadow/padding/colour; go through `Surface`'s `shadow`/`spacing`/`level` props (`shadow` not `elevation`).

- `import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled'` — standalone controlled: `options: { value: string; label: string }[]`, `value`, `onChange(value)` (public handler is `onChange`, value-first, **not** `onValueChange`). `SelectOption` is not exported via a subpath — declare the local option shape `{ value: string; label: string }`.
- Include an **"All diseases"** option (value e.g. `''` / a sentinel) mapping to `selectedDiseaseId = null`; selecting a disease sets `selectedDiseaseId`.
- The Select has **no built-in label** — add an accessible label via `@codaco/fresco-ui/Label` with `htmlFor`/`id` (participant-friendly text, e.g. "Show condition").
- This preserves keyboard accessibility (Base-UI Select) — the legend's keyboard path is retained.

**(c) Key panel** (`StickerKeyPanel.tsx`). A `MotionSurface` panel matching the preset-panel styling that explains the sticker glyphs to participants. For each `Status`, show the `Sticker` (or `StatusMarker variant="sticker"`) glyph next to a plain-language label (reuse `STATUS_LABELS` / participant-appropriate wording — do not leak internal vocabulary). Use the legend-row recipe `flex items-center gap-4 text-base` with the glyph as the swatch. Decorative glyphs `aria-hidden`; the row's text label is the accessible content.

**Placement:** keep the disease Select panel and the key panel as absolutely-positioned overlay siblings (e.g. Select panel top-left/top-centre, key panel a corner not colliding with the camera at bottom-right or the Select). Use `pointer-events-auto` on the panels (the overlay container is `pointer-events-none`). Keep the existing `aria-live` region wiring.

**Note the node-switch trigger:** the StickerNode↔ClassicNotationNode switch keys on `shownDiseases.length === 1` (not `selectedDiseaseId !== null`). A one-disease protocol therefore renders ClassicNotationNode even with nothing selected. If the design intent is "stickers by default until the participant picks one", gate `renderClassic` on `selectedDiseaseId !== null` instead. **Confirm with the controller before changing the trigger** (it changes default presentation for single-disease protocols).

**Steps:**

- [ ] Build `DiseaseSelectPanel` (MotionSurface + Label + Styled Select incl. "All diseases").
- [ ] Build `StickerKeyPanel` (MotionSurface + per-status glyph + plain-language label).
- [ ] Restructure the overlay in `NarrativePedigreeView`: camera → bottom-right sibling; legend → DiseaseSelectPanel; add StickerKeyPanel; keep Clear-focus + aria-live.
- [ ] Remove `DiseaseLegend` if unused (knip), or keep if still referenced.
- [ ] Update NarrativePedigreeView story/tests selectors that targeted the old legend buttons.
- [ ] Targeted Vitest on NarrativePedigreeView unit tests; format + lint --fix. Commit.

**Risks:** two panel idioms exist in Narrative (draggable pill + popover vs fixed translucent bar `DrawingControls`); match the **preset** panel (`PresetSwitcher`) per the user. Don't copy only Surface props without the className look. Confirm each fresco-ui subpath is in `package.json` exports before importing.

---

### Task 21: Edge-dimming predicate fix (too many segments dimmed)

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/EdgeRenderer.tsx`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeLayout.tsx`
- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.tsx` (forward `highlight.edges`)
- Test: EdgeRenderer / highlight predicate unit tests under the relevant `__tests__`

**Root cause:** `EdgeRenderer.isDimmedByIds` (lines 305-314) dims a segment unless **every** endpoint id is in `highlightedNodeIds` (all-endpoints rule). For a descent connector, `parentIds` is the whole **couple** `[coupleLeft, coupleRight]`, but `computeContributors` highlights only the **transmitting** parent — the non-transmitting co-parent is intentionally excluded. So genuinely-contributing descent lines get dimmed because the co-parent isn't highlighted → "too many dimmed".

**Fix:** the precise contributing-edge set already exists (`highlight.edges`, keyed `parentId->childId`) but is discarded. Thread it through and use edge-key membership for descent connectors:

- `NarrativePedigreeView`: pass `highlightedEdgeKeys={highlight.edges}` to `PedigreeLayout` (alongside the existing `highlightedNodeIds={highlight.nodes}`).
- `PedigreeLayout`: forward the new prop to `PedigreeEdgeSvg`/`EdgeRenderer` (parallel to `highlightedNodeIds`).
- `EdgeRenderer`: for **parent-child (descent)** connectors — the sibling-bar + parentLink wrapper and each upline — compute brightness from edge keys: a segment is **bright iff `edgeKey(parent, child)` ∈ highlightedEdgeKeys** for the relevant parent(s)/child. Per-upline: test that upline's child against the parents; shared bar/parentLink: bright if **any** family parent→child is on-lineage. Reuse `edgeKey` from `highlight.ts` (same `` `${parentId}->${childId}` `` format).
- **Preserve the `undefined` short-circuit** (when `highlightedEdgeKeys`/`highlightedNodeIds` is undefined → never dim) so **FamilyPedigree is unaffected** (it passes no highlight). Treat "no derivable edge key / no id" as **bright** (don't dim id-less segments by default).
- **Couple/partner group bars** (`partnerIds`) are not lineage — keep them on node membership (a couple bar dims unless both partners are contributors; defensible).
- **Auxiliary edges:** donor IS genetic (will appear in `highlight.edges` when on-lineage) → may use the edge-key rule; social/adoptive/surrogate/unpartnered are non-genetic and never in `highlight.edges` → keep on node membership so they don't all default to dimmed.

**Steps:**

- [ ] Write failing unit tests: a focal selection where a contributing descent line has a non-transmitting co-parent → that descent segment is **bright** (regression test for the bug); a sibling branch off the lineage → **dimmed**; `highlightedEdgeKeys === undefined` → nothing dimmed (FamilyPedigree).
- [ ] Run; confirm fail.
- [ ] Thread `highlight.edges` → `highlightedEdgeKeys` through View → PedigreeLayout → EdgeRenderer; add the edge-key predicate for descent connectors; keep node-membership for partner/non-genetic-aux; keep the undefined short-circuit.
- [ ] Run tests; confirm pass. Format + lint --fix. Commit.

**Risk:** `PedigreeLayout`/`EdgeRenderer` are **shared with FamilyPedigree** — the undefined-prop path must remain a no-op. `uplineChildIds` entries can be `undefined` — keep filtering and default-bright.

---

### Task 22: Color-blend dimming (replace wrapper opacity)

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.tsx`
- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/StickerNode.tsx` + `Sticker.tsx`
- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/ClassicNotationNode.tsx`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/EdgeRenderer.tsx`

**Problem:** dimming is wrapper CSS `opacity: 0.3` on the focal-container div (`NarrativePedigreeView.tsx:337-343`) plus SVG `opacity` on edge strokes (`EdgeRenderer`). Semi-transparent overlapping elements composite incorrectly (the artifact).

**Fix:** make dimmed elements **fully opaque** by blending their colour toward the background. Define one helper, e.g. `const dimColor = (c: string) => `color-mix(in oklab, ${c} 30%, var(--background))``(30% original / 70% navy-taupe background; expose the ratio as a named constant so it's tweakable). Apply when`dimmed`:

- **Node body:** drive the underlying `Node` via `color="custom"` + `style={{ '--base': dimColor('var(--node-1)') }}` (StickerNode currently hardcodes `color='node-color-seq-1'`; add a custom path for the dimmed state). `--dark` auto-derives from `--base`.
- **Disease sticker colours** (`StickerNode`/`Sticker`), **classic notation colour** (`ClassicNotationNode`, body already transparent — blend the disease colour passed to its SVG overlay), **at-risk triangle fill**, **`+N` chip**, and the sticker chip surface as needed.
- **Edges (`EdgeRenderer`):** replace `opacity={dimmed?0.3:1}` (lines 203/233/243/337/362) with a blended **stroke** colour: `stroke={dimmed ? dimColor('var(--edge-1)') : color}` (edge base colour `var(--edge-1)` set in `PedigreeLayout.tsx:116`). Same ratio as nodes for consistency.
- **Remove** `style={{ opacity }}` and `transition-opacity` from the focal container, but **keep emitting `data-dimmed`** (and `data-edge-dimmed`) — tests/snapshots rely on them.

**Cleanest seam:** compute the displayed (possibly-blended) colour strings in `NarrativePedigreeView` (it owns `dimmed`) and pass them down, so `Sticker`/`StatusMarker`/`ClassicNotationNode` stay presentational. `color-mix(… var(--background))` must resolve inside the `data-theme-interview` region — stories must render within it.

**Steps:**

- [ ] Add the `dimColor` helper + ratio constant. Remove wrapper opacity; keep `data-dimmed`.
- [ ] Thread blended colours into node body (custom `--base`), stickers, classic colour, at-risk triangle, `+N` chip.
- [ ] Switch edge dimming from opacity to blended stroke.
- [ ] Verify dimmed markers don't pop (every coloured descendant blended). Targeted Vitest; format + lint --fix. Commit.

**Risks:** `NodeColorSequence` is a closed enum — blended colours MUST go via `color="custom"` + `--base`. Removing wrapper opacity un-dims every descendant at once → each coloured piece must be individually blended (easy to miss `+N` `bg-slate-600` and the chip surface). Keep affected/carrier glyphs legible at 30% on navy-taupe. Re-baseline `np-view-*.png` in Task 23.

---

### Task 23: Final — changesets, interface images, verification, review

**Files:** `.changeset/*`, regenerated interface images, ledger.

**Steps:**

- [ ] Add/extend a changeset for `@codaco/interview` (+ `@codaco/fresco-ui` only if its source changed — it should not here). No changeset for interviewer-v8.
- [ ] Regenerate interface images: `pnpm generate:interface-images` (manual, all-or-nothing) then restore drift for non-NarrativePedigree assets via `git show HEAD:<path> > <path>` (rule-compliant; do **not** `git checkout`). Commit the NarrativePedigree + StickerNode images.
- [ ] Run the full sweep once: `pnpm typecheck`, `pnpm lint:fix` (then verify clean), `pnpm knip`, `pnpm test`.
- [ ] Remove any now-dead exports/stories (knip).
- [ ] Dispatch the final whole-branch review (Opus) over the full PR-#713 diff; fix Critical/Important findings in one batched fix.
- [ ] Push to PR #713. (Do **not** merge — research-team genetics sign-off is still required for the focal-inheritance work.)
