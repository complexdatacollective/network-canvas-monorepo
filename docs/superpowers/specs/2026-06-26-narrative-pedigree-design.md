# Narrative Pedigree — read-only disease-visualisation interface

**Date:** 2026-06-26
**Packages:** `@codaco/protocol-validation`, `@codaco/shared-consts`, `@codaco/architect-web`, `@codaco/interview`
**Status:** Design approved, pending implementation plan

This is **Feature #3 of three** in the family-pedigree redesign, and the largest.
It adds a new read-only interface that renders a pedigree captured by a
FamilyPedigree stage and lets a participant explore disease prevalence and
inheritance, with a faithful Mendelian carrier/at-risk engine. Features #1
(configurable framing) and #2 (interface fixes) have their own specs.

## Problem

A captured family pedigree encodes who is affected by which conditions, but the
FamilyPedigree interface is a _capture_ tool — it cannot show inheritance. We need
a separate interface that:

1. **Renders an existing pedigree** captured by a FamilyPedigree stage, read-only.
2. Lets the researcher configure **presets** that define which diseases (presence
   - inheritance pathways) are shown, and **focal node(s)** defined by position
     (e.g. "the participant's children").
3. **Highlights** the focal node(s) and their genetically-related individuals who
   carry a shown disease — including the connecting pathway — and **dims** the
   rest.
4. Optionally lets the participant **change the focal node by clicking** a member.
5. Serves two purposes: (a) participant exploration of disease prevalence and
   inheritance; (b) **exporting a visual snapshot**.
6. Shows disease presence and computed genetic status using coloured **stickers**
   around the node edge (or, for a single selected disease, classic pedigree
   notation).

The disease model must respect the genetics literature: conditions follow
**Mendelian inheritance patterns**, and the interface computes each individual's
**carrier/at-risk status** per pattern.

## Prerequisite: FamilyPedigree data-model & capture (owned by Spec #1, §5)

This engine needs each person's biological sex and needs `gameteRole` readable
from the shared network. Those two FamilyPedigree changes — persisting `gameteRole`
as an `edgeConfig.gameteRoleVariable` network variable, and capturing biological
sex (`nodeConfig.biologicalSexVariable`) for non-parent people — are **owned by
Feature #1's spec (§5)** and must land before this engine can run; they are
always-on (no config flag). This spec consumes the result. Sex resolves as:
explicit `biologicalSexVariable` if `female`/`male`; else gameteRole-derived for
genetic parents (egg→female, sperm→male); else `unknown` — so every individual has
a resolvable biological sex (explicit for non-parents, gameteRole-derived for
genetic parents).

## Design

### 1. Schema — new `NarrativePedigree` stage type

New `schemas/8/stages/narrative-pedigree.ts`, registered in the discriminated
union in `schemas/8/stages/index.ts`:

```ts
narrativePedigreeStage = baseStageSchema.extend({
  type: z.literal('NarrativePedigree'),

  // The FamilyPedigree stage whose captured network this renders.
  sourceStageId: z.string(),

  // Diseases available to presets. `variable` is a boolean node attribute
  // (set during the source stage's nomination phase).
  diseases: z
    .array(
      z.strictObject({
        id: z.string(),
        label: z.string(),
        color: z.string(), // sticker / notation colour
        variable: entityAttributeReference({ subject: 'stageSubject' }),
        inheritancePattern: z.enum(INHERITANCE_PATTERNS),
      }),
    )
    .min(1),

  // Participant-switchable views.
  presets: z
    .array(
      z.strictObject({
        id: z.string(),
        label: z.string(),
        diseases: z.array(z.string()).min(1), // disease ids shown by this preset
        focal: z.enum(FOCAL_POSITIONS), // 'ego' | 'egoChildren' | ...
      }),
    )
    .min(1),

  behaviours: z.strictObject({
    allowFocalReselection: z.boolean(), // click a member to refocus
  }),
});
```

Protocol-level `superRefine` (`schemas/8/schema.ts`):

- `sourceStageId` references an existing stage of type `FamilyPedigree`.
- each `diseases[].variable` resolves on the source stage's node type.
- each `presets[].diseases` id exists in `diseases`.
- duplicate `diseases`/`presets` ids rejected (`findDuplicateId`).

The stage reads the captured pedigree from the **shared interview network**,
filtered to the source stage's node/edge types (resolved from `sourceStageId`'s
`nodeConfig`/`edgeConfig`). It is read-only and never mutates the network.

### 2. Shared constants (`@codaco/shared-consts`)

New `src/narrative-pedigree.ts`, exported from `src/index.ts`:

```ts
export const INHERITANCE_PATTERNS = [
  'autosomalDominant',
  'autosomalRecessive',
  'xLinkedDominant',
  'xLinkedRecessive',
  'yLinked',
  'mitochondrial',
  'multifactorial',
  'unknown',
] as const;

export const FOCAL_POSITIONS = [
  'ego',
  'egoChildren',
  'egoParents',
  'egoSiblings',
  'everyone',
] as const;

// BIOLOGICAL_SEX_VALUES lives with the capture variable in
// `src/family-pedigree.ts` (Feature #1, §5); the engine imports it from there.
```

`INHERITANCE_PATTERNS` and `FOCAL_POSITIONS` are shared so schema (config) and
interview (engine/resolver) cannot drift. `BIOLOGICAL_SEX_VALUES` (defined with the
capture variable in Feature #1) is likewise imported by the engine.

### 3. Genetics engine (`@codaco/interview`)

`interfaces/NarrativePedigree/genetics/` — the highest-value, most-tested module.

> This section was substantially revised after an adversarial medical-genetics
> review (see `## Adversarial review outcomes` below). The corrected model follows.

For each shown disease it computes, per person, one **status**:

```
affected · obligateAffected · obligateCarrier · atRiskAffected · atRiskCarrier · unknown
```

**Affected status is captured only as a boolean, so un-nomination means
`unknown`, never `unaffected`.** The tool cannot record "explicitly assessed and
clear," so the engine treats every un-nominated person as `unknown` affected
status — it must not broadcast false reassurance. There is deliberately **no
`unaffected` status**; `unknown` is the default, and the UI never presents it as
reassurance.

**Inputs and graph.** The engine builds an annotated genetic graph from
`biological` + `donor` edges where each parent→child edge is tagged with the
parent's **resolved sex** (maternal vs paternal line). This is required to
partition **full vs half siblings** (by which parent is shared) and to traverse
maternal/paternal lines — the flat `computeBioRelatives` set is insufficient.
Status propagates **recursively over the lineage with a visited-set** (so
consanguinity loops terminate and rules aren't double-applied). Sex resolution:
`biologicalSexVariable(p)` if `female`/`male`; else gameteRole-derived
(`egg`→female, `sperm`→male) for genetic parents; else `unknown`. A sex-dependent
step with `unknown` sex yields `unknown`, surfaced as **sex-blocked** (distinct
from computed-but-uncertain) — important because leaf nodes have no gameteRole.

Per-pattern rules (corrected; implemented to standard references — GeneReviews/
OMIM/Bennett pedigree nomenclature — and unit-tested against canonical pedigrees,
reviewed by the research team):

- **Autosomal dominant:** an unaffected person who is **both** a child of an
  affected/obligate individual **and** a parent of one → `obligateCarrier`
  (unaffected-but-transmitting; reduced penetrance / skipped generation).
  Descendants of an affected/obligate individual → `atRiskAffected`, propagated
  recursively (truncate past a clinically-unaffected node only under a
  full-penetrance assumption). Parents of an affected person with no affected
  ancestor → `atRiskAffected`/`unknown` (de novo vs non-penetrant — **never**
  `obligateCarrier`).
- **Autosomal recessive:** both biological parents and every child of an affected
  person → `obligateCarrier`; an unaffected person **both** of whose parents are
  affected/obligate/at-risk-carrier (i.e. a **full** sibling of an affected) →
  `atRiskAffected` (25%); a person with **exactly one** carrier parent (half-sibs,
  child of a single carrier, sibs/parents of an obligate carrier, and the
  grandparents/aunts/uncles each carrying 50% prior) → `atRiskCarrier`. Requires
  full-vs-half partitioning; absent it, **downgrade** to `atRiskCarrier`.
- **X-linked recessive** (needs sex): every **daughter of an affected male** →
  `obligateCarrier` (truly obligate); a female with ≥2 affected sons, or an
  affected son **plus** another affected maternal-line male → `obligateCarrier`;
  the **mother of a single affected male with no other affected male relative** →
  `atRiskCarrier` (de novo not excluded — **not** obligate). Sons of a carrier
  female and maternal uncles of an affected male → `atRiskAffected`; daughters of a
  carrier female, the maternal grandmother and maternal aunts → `atRiskCarrier`.
  Recurse up the maternal line and down every maternal branch; **no male-to-male
  transmission**.
- **X-linked dominant** (needs sex): every **daughter of an affected male** →
  `obligateAffected` (he transmits his X to all daughters); his sons receive no
  risk via him (do not mark them `unknown`-clear outright — leave to other rules).
  Each child of an affected **female** → `atRiskAffected`. Recurse through affected
  descendants.
- **Y-linked** (needs sex): every male in unbroken male-line descent from — and
  the male-line ancestors of — an affected male → `obligateAffected` (transmission
  is obligate and ~fully penetrant; **not** `atRisk`). Females: no risk, no
  transmission.
- **Mitochondrial** (needs sex): every child of an affected/transmitting female →
  `atRiskAffected` (heteroplasmy → variable penetrance — keep `atRisk`, do **not**
  upgrade to affected). Recurse **down daughters only** (continuing through
  clinically-unaffected daughters), stopping at every male; recurse up the maternal
  line.
- **Multifactorial / unknown:** affected only; **no** carrier/at-risk inference.

Precedence when several rules touch a person:
`affected > obligateAffected > obligateCarrier > atRiskAffected > atRiskCarrier >
unknown`.

**Standing caveat (ship with the tool):** every status is a _pedigree-pattern
deduction under an assumed inheritance model with a boolean affected field_, not a
genetic-test result. `obligate*` statuses are "consistent-with" inferences;
`unknown` is never reassurance.

## Adversarial review outcomes

This design's genetics engine was revised after an adversarial medical-genetics
review. The corrections folded into §3 above: un-nomination → `unknown` (not
`unaffected`); recursive multi-generation propagation with a consanguinity-safe
visited-set (not first-degree-only); an AD unaffected-but-transmitting
`obligateCarrier`; XLR de-novo downgrade (mother of a single affected male is
`atRiskCarrier`, not obligate); the split status enum (`atRiskAffected` vs
`atRiskCarrier`, plus `obligateAffected` for the deterministic Y-line / XLD-
daughter cases); maternal/paternal-line + full-vs-half-sibling partitioning from
parent-sex-annotated edges; and sex-blocked surfacing for the leaf generation.
Accepted simplifications (documented, not fixed): manifesting XLR carrier females
nominated as `affected` lose carrier detail; male-lethal XLD is not modelled; no
numeric probabilities; multifactorial gets no inference.

### 4. Focal resolution & highlighting

- **Focal resolver** maps a preset's `focal` position to node id(s) at render time:
  `ego` (the ego node), `egoChildren`/`egoParents`/`egoSiblings` (via the existing
  BFS path classification), `everyone` (all nodes). With `allowFocalReselection`,
  a participant click overrides the resolved focal until the preset changes.
- **Highlight set** = the focal node(s) ∪ their genetic-lineage relatives
  (the genetic-lineage relatives from each focal node) whose status for a shown
  disease is anything other than `unknown` (`affected`/`obligateAffected`/
  `obligateCarrier`/`atRiskAffected`/`atRiskCarrier`) ∪ the edges connecting them
  (the inheritance **pathway**). Everything outside the highlight set is **dimmed**
  (reduced opacity). Pathways = the highlighted connectors.

### 5. Rendering — two node modes

The interface renders through reused `PedigreeLayout`/`EdgeRenderer` with a custom
`renderNode`, choosing the mode by the active preset's shown-disease count:

- **Sticker mode** (≥ 2 diseases shown): the existing `Node` plus a **sticker
  overlay** — one coloured marker per disease the person has, placed around the
  node perimeter **starting top-left, clockwise**, distributed to the shape
  (square / circle / diamond). Sticker **colour = disease**; sticker **style =
  status** (solid = affected; double-ring = obligate-affected; ring + centre dot =
  obligate carrier; half-filled = at-risk-affected; centre dot = at-risk-carrier;
  `?` = unknown). Because un-nomination resolves to `unknown`, the default sticker
  for a shown disease is the `?` style, **not** absence. Overflow (more diseases
  than fit) is **capped with a `+N` marker**; tapping the node reveals the full
  list.
- **Classic-notation mode** (exactly 1 disease shown): a custom pedigree-notation
  node component where **the symbol itself is the status indicator** (traditional
  notation — filled = affected, central dot = carrier, etc.) with the label
  rendered underneath. No stickers.

Highlight/dim applies in both modes (focal + pathway bright, rest dimmed).

### 6. Presets & behaviours

A **PresetSwitcher** (mirroring the existing `Narrative` interface's switcher)
lets the participant flip between presets; switching recomputes shown
diseases/stickers, focal, statuses, and highlight. `allowFocalReselection` enables
click-to-refocus.

### 7. Snapshot export

A "Save snapshot" control captures the current rendered view (whatever its
preset/focal/highlight state) and triggers a **PNG download**. Implemented with a
DOM-to-image dependency (e.g. `html-to-image`) — the first such capability in the
monorepo; the dependency choice is part of implementation. No data is written back
to the interview network (download only).

### 8. Architect config UI (`@codaco/architect-web`)

Register `NarrativePedigree` in `StageEditor/Interfaces.tsx` (`INTERFACE_CONFIGS`)
and `Screens/NewStageScreen/interfaceOptions.ts`. New `sections/NarrativePedigree/`:

- **`SourceStage.tsx`** — select a FamilyPedigree stage in the protocol.
- **`Diseases.tsx`** — rows of `{ variable (boolean node var), label, colour,
inheritancePattern }`.
- **`Presets.tsx`** — rows of `{ label, diseases (multi-select of declared
diseases), focal (position select) }`.
- **`Behaviours.tsx`** — `allowFocalReselection` toggle (pattern from
  `Narrative/NarrativeBehaviours.tsx`).

Plus the FamilyPedigree prerequisite UI (Feature #1's editor): `gameteRoleVariable`
and `biologicalSexVariable` are wired into the existing
`sections/FamilyPedigree/NodeConfiguration.tsx`/`EdgeConfiguration.tsx` variable
bindings.

### 9. Interview registration

Register `NarrativePedigree` in `interfaces/index.tsx`. New
`interfaces/NarrativePedigree/`: the main interface component, a read-only view
(reusing `PedigreeLayout`), the `genetics/` engine, the focal resolver, the
highlight computer, the sticker overlay + classic-notation node components, the
PresetSwitcher, and the snapshot/export control.

## Edge cases

- **Unknown sex** (a leaf without a captured sex, or an `intersex`/`unknown`
  value) → `unknown` status for sex-linked/Y/mitochondrial diseases; autosomal
  diseases are unaffected by this.
- **No ego** in the source network → focal positions relative to ego resolve to
  empty; the view renders without highlight (all neutral).
- **A disease variable absent from a node** → treated as unaffected for that
  disease.
- **Preset shows a disease whose source stage never nominated it** → all
  unaffected; valid but empty (no stickers for it).
- **Donor co-parents / consanguinity** affect carrier propagation; the engine
  treats donor edges as genetic (consistent with `computeBioRelatives`).
- **Click-to-refocus disabled** → focal is fixed to the preset definition.

## Testing

- **Genetics engine (primary):** unit tests per inheritance pattern against
  canonical pedigrees, covering the adversarial-review cases — un-nomination →
  `unknown` (never `unaffected`); AD skipped-generation `obligateCarrier` and
  de-novo parents → `atRiskAffected`/`unknown` (not obligate); AR obligate carriers
  - full-sib `atRiskAffected` vs half-sib/collateral `atRiskCarrier`; XLR
    daughter-of-affected-male obligate, single-affected-son mother `atRiskCarrier`,
    maternal uncles `atRiskAffected`, no male-to-male transmission; XLD daughters
    `obligateAffected`; Y-line `obligateAffected`; mitochondrial recursion through
    unaffected daughters and stopping at males; multi-generation propagation;
    consanguinity-loop termination; sex-blocked → `unknown`. The research team
    reviews expected outputs.
- **Sex resolution:** gameteRole-derived vs explicit variable vs unknown.
- **Focal resolver:** each `FOCAL_POSITIONS` value resolves correctly; click
  override.
- **Highlight computer:** focal + affected-lineage + connectors highlighted; rest
  dimmed.
- **Rendering:** sticker placement around each shape + `+N` overflow; sticker
  style per status; classic-notation single-disease mode.
- **Storybook:** a captured pedigree rendered under several presets (multi-disease
  sticker view and single-disease classic view), focal reselection, and a PNG
  export smoke test.
- **Schema:** the new stage validates; `sourceStageId`/disease-variable/preset-id
  cross-references enforced; FamilyPedigree `gameteRoleVariable`/
  `biologicalSexVariable` bindings validate.

## Out of scope

- Numeric carrier/affected **risk probabilities** (categorical statuses only).
- Writing snapshots **back into interview data** (download only).
- Editing the pedigree from this interface (strictly read-only).
- Inheritance patterns beyond the standard set; participant-defined presets.

## File-level change map

| Area                   | File(s)                                                                                                                    | Change                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Schema                 | `schemas/8/stages/narrative-pedigree.ts` (new), `stages/index.ts`                                                          | new stage type + registration                                                                              |
| Schema                 | `schemas/8/schema.ts`                                                                                                      | cross-ref refinements (sourceStage, disease vars, preset ids)                                              |
| Schema (prereq)        | `schemas/8/stages/family-pedigree.ts`                                                                                      | `edgeConfig.gameteRoleVariable`, `nodeConfig.biologicalSexVariable`                                        |
| shared-consts          | `narrative-pedigree.ts` (new), `index.ts`                                                                                  | `INHERITANCE_PATTERNS`, `FOCAL_POSITIONS` (sex values in Feature #1)                                       |
| shared-consts (prereq) | `stage-metadata.ts`                                                                                                        | remove now-redundant metadata `gameteRole`                                                                 |
| Architect              | `StageEditor/Interfaces.tsx`, `Screens/NewStageScreen/interfaceOptions.ts`                                                 | register NarrativePedigree                                                                                 |
| Architect              | `sections/NarrativePedigree/{SourceStage,Diseases,Presets,Behaviours}.tsx` (new)                                           | config UI                                                                                                  |
| Architect (prereq)     | `sections/FamilyPedigree/{NodeConfiguration,EdgeConfiguration}.tsx`                                                        | bind new variables                                                                                         |
| Interview              | `interfaces/index.tsx`                                                                                                     | register NarrativePedigree                                                                                 |
| Interview              | `interfaces/NarrativePedigree/**` (new)                                                                                    | view, genetics engine, focal resolver, highlight, sticker + classic-notation nodes, PresetSwitcher, export |
| Interview (prereq)     | `FamilyPedigree/store.ts`, `transforms/*`, `quickStartWizard/PersonFields.tsx`, `pedigree-layout/utils/getDisplayLabel.ts` | gameteRole → network variable; biological-sex capture                                                      |
