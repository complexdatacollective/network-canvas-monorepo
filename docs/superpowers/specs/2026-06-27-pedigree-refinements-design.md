# Pedigree Refinements — Design

**Status:** approved (design); awaiting spec review
**Branch:** `claude/kind-darwin-c34372` (folds into PR #713)
**Date:** 2026-06-27

## Goal

Refine two interfaces shipped in the Family Pedigree redesign (PR #713) in
response to review of the running Storybook: simplify the FamilyPedigree
intro/wizard, and rework the NarrativePedigree interaction model, focal
behaviour, and visuals. Schema 8 is unreleased, so schema changes need **no
migration**.

## Context / current state (verified)

- FamilyPedigree wizard steps are composed in
  `packages/interview/src/interfaces/FamilyPedigree/components/wizards/EgoCellWizard.tsx`
  (Intro → Choose language → **Your biological parents** → Egg parent → …).
- The language step is hand-rolled radio cards in
  `…/components/quickStartWizard/FramingSelectionStep.tsx`; it writes the
  `framing` store value (`'gamete' | 'gendered'`).
- The "your biological parents" step is
  `…/components/quickStartWizard/BioParentsIntroStep.tsx` (framing-aware copy +
  egg/sperm SVG glyphs).
- The Information step is `…/components/quickStartWizard/IntroStep.tsx`, sourced
  from the `introScreen` schema field (`{ title?, text, videoAssetId? }`),
  skipped when `introScreen` is absent.
- NarrativePedigree schema:
  `packages/protocol-validation/src/schemas/8/stages/narrative-pedigree.ts`
  has `diseases`, **`presets`** (`min(1)`, each `{ id, label, diseases[], focal }`),
  and **`behaviours: { allowFocalReselection }`**.
- NarrativePedigree runtime: `…/NarrativePedigree/components/NarrativePedigreeView.tsx`
  holds `activePresetIndex` + `PresetSwitcher`; renders all-diseases
  `StickerNode` when ≥2 shown diseases, single-disease `ClassicNotationNode`
  when 1. Focal via `focalOverride` + `computeHighlight` (`…/highlight.ts`),
  which currently highlights focal **and lineage in both directions**
  (parents+children) — so descendants stay lit.
- The genetic graph (`…/genetics/geneticGraph.ts`) exposes `parentsOf`,
  `childrenOf`, `ancestors`, `descendants`, `propagate`.
- Architect editors: `apps/architect-web/src/components/sections/NarrativePedigree/{Presets,PresetFields,Behaviours}.tsx`
  and `apps/architect-web/src/components/sections/FamilyPedigree/IntroScreen.tsx`
  (already has title / RichText / VideoInput fields). New-stage templates live in
  `apps/architect-web/src/components/StageEditor/Interfaces.tsx` `INTERFACE_CONFIGS`.
- `ActionButton` (`packages/interview/src/components/ActionButton.tsx`) is the
  round '+'-badged FAB; `iconName: InterviewerIconName`. fresco-ui has **no**
  camera icon (`packages/fresco-ui/src/icons/customIcons.ts`).
- `RichSelectGroupField` (`packages/fresco-ui/src/form/fields/RichSelectGroup.tsx`)
  is already used by `AddPersonForm`.

## Cluster A — FamilyPedigree intro/wizard

### A1 — Language selector uses RichSelectGroup, reworded copy

Replace the hand-rolled cards in `FramingSelectionStep.tsx` with
`RichSelectGroupField` (single-select, two options with `description`). Reword
to plain participant language (no "gamete"/"gendered" jargon):

- Prompt: _"How would you like us to refer to the people you're biologically
  related to?"_
- Option `gamete`: label _"Egg parent & sperm parent"_, description _"We'll talk
  about the person whose egg you came from and the person whose sperm you came
  from."_
- Option `gendered`: label _"Mother & father"_, description _"We'll talk about
  your biological mother and biological father."_

(Exact copy is for researcher/author taste — refine during review.) Keep
writing the same `framing` store value; preserve keyboard + a11y (RichSelectGroup
provides them).

### A2 — Information step replaces the biological-parents step

- **Delete** `BioParentsIntroStep.tsx` and its wizard step in `EgoCellWizard.tsx`.
- The Information step (`IntroStep` / `introScreen`) carries this content
  instead. In **architect**, a newly-created FamilyPedigree stage's
  `introScreen.text` is **pre-filled** with a plain-language biological-parents
  explanation (adapted from the current BioParentsIntroStep copy, framing-neutral
  because the Information step precedes framing selection). The researcher can
  **edit or remove** it and **attach a video** (`videoAssetId`) — all three
  `introScreen` editor fields already exist; only the template default is added
  (`INTERFACE_CONFIGS.FamilyPedigree.template.introScreen = { text: <default> }`).
- Runtime `IntroStep` already renders `introScreen.{title,text,video}`; no runtime
  change beyond removing the deleted step. The egg/sperm **glyph cards are
  dropped**; the egg/sperm terms are still introduced at the egg/sperm-parent
  steps.
- Keep `IntroStep`'s existing skip behaviour (absent `introScreen` ⇒ skipped):
  removing the intro text in architect (setting `introScreen` null) legitimately
  skips the step.

## Cluster B — NarrativePedigree

### B1 — Remove presets and allowFocalReselection

- Schema: drop `presets` and `behaviours` from `narrative-pedigree.ts`. Keep
  `diseases` (min 1). No migration (schema 8 unreleased).
- shared-consts: `FOCAL_POSITIONS` is now only used by the removed preset
  `focal`; remove it if unused after this change (run knip). `INHERITANCE_PATTERNS`
  stays.
- Architect: delete `sections/NarrativePedigree/{Presets,PresetFields,Behaviours}.tsx`,
  remove them from the NarrativePedigree `sections` array and the `presets: []` /
  `behaviours` template entries in `Interfaces.tsx`. Check ProtocolSummary
  (`Stage.tsx`) doesn't break (its `presets` extraction is generic/optional).
- Runtime: remove `activePresetIndex`, `PresetSwitcher`, and `behaviours`/preset
  reads from `NarrativePedigreeView.tsx`; delete `PresetSwitcher.tsx`.

### B2 — Interaction model: persistent disease legend

- **Default view:** all diseases as stickers, full pedigree, nothing dimmed.
- A **persistent disease legend** (the colour key, also the switcher) is shown
  where the preset switcher was: one chip per disease (colour swatch + label) plus
  an **"All diseases"** chip. The active selection is visually marked.
- Clicking a disease's legend chip **or any node's sticker for that disease**
  enters **single-disease mode** (`ClassicNotationNode`, disease colour). Clicking
  the active chip or "All diseases" returns to the sticker view.
- New view state replaces presets: `selectedDiseaseId: string | null`
  (`null` = all diseases). `shownDiseases` derives from it.
- Legend is keyboard operable (chips are buttons / a radio-style group) and
  changes are announced via an `aria-live` region ("Showing Huntington's
  Disease" / "Showing all diseases"). Reuse fresco-ui primitives (Button/Badge or
  a Base-UI toggle group) — no raw divs.

### B3 — Inheritance-aware focal (contributor highlight)

- A node is selectable as focal at any time (replaces `allowFocalReselection`;
  always on). `focalId: string | null`.
- **Semantics (from the researcher):** with focal F, highlight **F and only the
  members who contribute to F's inheritance of the shown disease(s)** — i.e. F's
  genetic ancestors along the allele-transmission path. Everyone who does not
  contribute (descendants, collaterals, non-transmitting ancestors, partner's
  family that doesn't contribute) is **dimmed**. In all-diseases mode the
  contributor set is the **union across shown diseases**.
- Replace `computeHighlight`: instead of bidirectional `propagate`
  (parents+children), walk **ancestors only**, keeping a parent only when that
  parent has a **non-`unknown` status** for a shown disease (a transmitting
  ancestor); F is always highlighted. Highlighted edges connect two highlighted
  nodes (unchanged rule). Provide a unit-tested `computeContributors(focalId,
graph, statusesByDisease)`.
- A **"Clear focus"** control (visible when a focal is set) returns to the full
  pedigree. The focal node itself is visually emphasised (Node `selected`/
  `highlighted`), not merely "un-dimmed".
- Announce focal changes via `aria-live` ("Focused on <label>. Showing who
  contributes to their inheritance." / "Focus cleared.").
- **Stories must include a disease entering via the partner's side** (partner's
  affected parent → child), so selecting that child as focal highlights the
  partner-side contributors and dims ego's side. This is the key new test case.

### B4 — Node label fix

- Symptom: NarrativePedigree renders `'You'` for multiple nodes (e.g. the whole
  top row) and generic relationship labels instead of the seeded names.
- Prime suspects: `labelFor` (`NarrativePedigreeView.tsx:261`) returns `'You'`
  whenever `egoVariable === true`; `computeNodeDisplayLabels`
  (`FamilyPedigree/pedigree-layout/components/PedigreeNode.tsx:77`) keys labels by
  `_uid`, **excludes ego**, and reads the stored name from
  `node.attributes[nodeLabelVariable]`; `labelFor` looks up `displayLabels.get(node.id)`
  (verify `node.id === _uid`); framing is hardcoded `'gamete'`.
- **TDD:** write a failing test that builds the story network and asserts each
  node renders its **correct distinct label** (the seeded names, with exactly one
  `'You'` = ego), then fix the root cause. The fix must not regress
  FamilyPedigree's own label rendering (shared `computeNodeDisplayLabels`).

### B5 — Sticker visuals

- In `StickerNode.tsx` / `stickerPositions.ts`: increase sticker size (from
  `STICKER_SIZE_PX = 16`), seat stickers correctly **on the node-shape
  perimeter** (the current normalized `[0,1]²` positions map to the node's
  bounding box, which for circle/diamond does not lie on the visible edge —
  fix the geometry so markers sit on the rendered shape outline), and give each
  sticker a **solid background colour** behind the status marker (so the symbol
  reads against the node). Exact sizes tuned in Storybook.
- Colours: disease colours come from author config (`disease.color`, arbitrary
  hex) and are legitimate data, not theme chrome. The sticker **background** and
  any chrome use design tokens.

### B6 — Custom node: disease colour, smaller, shared marker component

- `ClassicNotationNode` currently renders `Node color="node-color-seq-1"` (pale
  blue) with the disease colour only in the overlay. Change the node body to the
  **disease colour** so single-disease mode matches that disease's sticker, and
  reduce its size.
- **Extract a shared marker/sticker component** rendering the status symbology
  (solid / double-ring / ring-dot / half / dot / unknown + atRiskHomozygous
  triangle) once, consumed by both `StickerNode` and `ClassicNotationNode`, so the
  two never drift. (Reuse ladder: compose a single primitive rather than two
  parallel SVG sets.)

### B7 — Save snapshot → ActionButton with camera icon

- Add a **camera** custom icon to fresco-ui (`icons/camera.svg.react.tsx` +
  `customIcons.ts` entry → `InterviewerIconName` gains `'camera'`).
- Replace the text `Button` in `NarrativePedigreeView` with `ActionButton`
  (`iconName="camera"`, the '+' badge per the researcher's choice). Icon-only ⇒
  `aria-label="Save snapshot"`. Keep the existing `exportSnapshot` handler.

## Cross-cutting (developing-in-network-canvas)

- Reuse fresco-ui (`RichSelectGroup`, `Button`/`Badge`/Base-UI toggle,
  `ActionButton`, `Node`); no raw-div widgets.
- A11y: legend, focal selection, clear-focus, snapshot all keyboard operable
  with visible focus and `aria-live` announcements for view/focal changes.
- Tone/i18n: participant copy is plain, whole, externalisable strings; no leaked
  internal vocabulary; dark interview theme; tokens for chrome.

## Packages touched / changesets

- `@codaco/fresco-ui` (camera icon) — changeset (minor).
- `@codaco/protocol-validation` (drop presets/behaviours) — changeset (minor).
- `@codaco/interview` (both interfaces + stories) — changeset (minor).
- `@codaco/shared-consts` (remove `FOCAL_POSITIONS` if unused) — changeset if exports change.
- `apps/architect-web` (editors + templates) — app, **no changeset**.

## Genetics gate

The contributor-highlight (B3) encodes inheritance-domain reasoning derived from
the existing status engine (it does not change `computeStatuses`). It is
validated with targeted tests + the adversarial builder→skeptic approach and
**folds into the existing PR #713 genetics research-team sign-off gate**. PR #713
does not merge without that sign-off.

## Testing

- Vitest units: `computeContributors` (ancestors-only, transmitting-path, union,
  partner-side case), the label fix, the shared marker component.
- Storybook interaction tests rewritten for the new model: all-diseases sticker
  default; click sticker/legend → single-disease; focal select → contributor
  dim + clear-focus; partner-side focal; snapshot button. Remove preset-switcher
  assertions.
- `pnpm typecheck`, `pnpm knip`, lint as the final gate.

## Out of scope

- No change to the genetics status engine (`computeStatuses` /
  `computeAtRiskHomozygous`) lattice.
- No new disease inheritance patterns.
- The atRiskHomozygous flag behaviour (PR #713) is unchanged except for sharing
  the marker component.
