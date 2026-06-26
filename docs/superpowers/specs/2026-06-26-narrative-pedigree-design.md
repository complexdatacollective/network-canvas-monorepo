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

## Prerequisite: FamilyPedigree data-model & capture changes

The genetics engine needs each person's biological sex, and needs `gameteRole`
readable from the shared network. These two changes modify the **FamilyPedigree
stage** (Feature #1's surface, already specced separately) and are prerequisites
for this feature. They are **always-on** (no config flag).

1. **Persist `gameteRole` on the network.** Add `gameteRoleVariable` to
   `EdgeConfigSchema` (`schemas/8/stages/family-pedigree.ts`) — a codebook edge
   variable storing `'egg'`/`'sperm'`, written during capture/finalization exactly
   like `isGestationalCarrierVariable`. The pedigree transforms and
   `finalizeNetwork` write the role into this edge attribute; `getDisplayLabel`
   and `nominatedGameteRoles` read it from the network variable instead of the
   in-store `FamilyEdge.gameteRole`/stage metadata. The stage-metadata `gameteRole`
   becomes redundant and is removed.
2. **Capture biological sex for non-parent people.** Add `biologicalSexVariable`
   to `NodeConfigSchema` (a node categorical, values from `BIOLOGICAL_SEX_VALUES`,
   see §2). `PersonFields` (and the wizards that create people) ask a
   biological-sex question for any person **not** created as an egg/sperm parent
   (ego, children, siblings, social parents). Egg/sperm parents derive sex from
   `gameteRole`. A leaf who later becomes a parent keeps their captured sex (and
   the later gamete assignment should agree: female→egg, male→sperm).

Net effect: every individual has a resolvable biological sex — explicit for
non-parents, gameteRole-derived for genetic parents — which the engine consumes.

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

// Canonical biological-sex option values for the capture variable + engine.
export const BIOLOGICAL_SEX_VALUES = [
  'female',
  'male',
  'intersex',
  'unknown',
] as const;
```

`INHERITANCE_PATTERNS` and `FOCAL_POSITIONS` are shared so schema (config) and
interview (engine/resolver) cannot drift. `BIOLOGICAL_SEX_VALUES` is shared so the
FamilyPedigree capture variable and the engine agree on values.

### 3. Genetics engine (`@codaco/interview`)

`interfaces/NarrativePedigree/genetics/` — the highest-value, most-tested module.
For each shown disease it computes, per person, one **status**:

```
unaffected · affected · carrier · obligateCarrier · atRisk · unknown
```

Inputs: the genetic graph (biological + donor edges, via the existing
`computeBioRelatives` primitives), the affected set (`variable === true`; absent →
unaffected), and each person's **resolved sex**:

> `sex(p)` = `biologicalSexVariable(p)` if `'female'`/`'male'`; else gameteRole-
> derived (`egg`→female, `sperm`→male) if `p` is a genetic parent; else `unknown`.

Per-pattern rules (applied over the genetic lineage; implemented to standard
medical-genetics references and unit-tested against canonical pedigrees — the
research team reviews these):

- **Autosomal dominant:** affected = boolean; each unaffected child of an affected
  individual → `atRisk`. (No carrier state — heterozygotes are affected.)
- **Autosomal recessive:** affected = boolean; both biological parents of an
  affected individual and every child of an affected individual → `obligateCarrier`;
  unaffected full siblings of an affected individual and children of an obligate
  carrier → `atRisk`.
- **X-linked recessive** (needs sex): affected = boolean; the mother of an affected
  male and every daughter of an affected male → `obligateCarrier`; sons of a
  carrier female → `atRisk` (affected risk), daughters of a carrier female →
  `atRisk` (carrier); no male-to-male transmission.
- **X-linked dominant** (needs sex): affected = boolean; affected male → all
  daughters `atRisk`/affected, sons unaffected from him; affected female → each
  child `atRisk`.
- **Y-linked** (needs sex): affected = boolean (males); affected male → all sons
  `atRisk`; females unaffected.
- **Mitochondrial** (needs sex): affected = boolean; affected female → all her
  children `atRisk`; males do not transmit.
- **Multifactorial / unknown:** affected = boolean only; no carrier/at-risk
  inference (risk is empirical; avoid overclaiming).

Precedence when several rules touch a person: `affected > obligateCarrier >
carrier > atRisk > unaffected`. A sex-linked status with `unknown` sex → `unknown`.

### 4. Focal resolution & highlighting

- **Focal resolver** maps a preset's `focal` position to node id(s) at render time:
  `ego` (the ego node), `egoChildren`/`egoParents`/`egoSiblings` (via the existing
  BFS path classification), `everyone` (all nodes). With `allowFocalReselection`,
  a participant click overrides the resolved focal until the preset changes.
- **Highlight set** = the focal node(s) ∪ their genetic-lineage relatives
  (`computeBioRelatives` from each focal node) whose status for a shown disease is
  `affected`/`obligateCarrier`/`carrier`/`atRisk` ∪ the edges connecting them (the
  inheritance **pathway**). Everything outside the highlight set is **dimmed**
  (reduced opacity). Pathways = the highlighted connectors.

### 5. Rendering — two node modes

The interface renders through reused `PedigreeLayout`/`EdgeRenderer` with a custom
`renderNode`, choosing the mode by the active preset's shown-disease count:

- **Sticker mode** (≥ 2 diseases shown): the existing `Node` plus a **sticker
  overlay** — one coloured marker per disease the person has, placed around the
  node perimeter **starting top-left, clockwise**, distributed to the shape
  (square / circle / diamond). Sticker **colour = disease**; sticker **style =
  status** (solid = affected; ring + centre dot = obligate carrier; centre dot =
  carrier; dashed outline = at-risk; `?` = unknown; absent = unaffected). Overflow
  (more diseases than fit) is **capped with a `+N` marker**; tapping the node
  reveals the full list.
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
  canonical pedigrees — AR obligate carriers + 2/3-risk sibs; XLR carrier daughters
  and no male-to-male transmission; mitochondrial maternal-only transmission;
  AD vertical at-risk; sex-unknown → `unknown`. The research team reviews expected
  outputs.
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
| shared-consts          | `narrative-pedigree.ts` (new), `index.ts`                                                                                  | `INHERITANCE_PATTERNS`, `FOCAL_POSITIONS`, `BIOLOGICAL_SEX_VALUES`                                         |
| shared-consts (prereq) | `stage-metadata.ts`                                                                                                        | remove now-redundant metadata `gameteRole`                                                                 |
| Architect              | `StageEditor/Interfaces.tsx`, `Screens/NewStageScreen/interfaceOptions.ts`                                                 | register NarrativePedigree                                                                                 |
| Architect              | `sections/NarrativePedigree/{SourceStage,Diseases,Presets,Behaviours}.tsx` (new)                                           | config UI                                                                                                  |
| Architect (prereq)     | `sections/FamilyPedigree/{NodeConfiguration,EdgeConfiguration}.tsx`                                                        | bind new variables                                                                                         |
| Interview              | `interfaces/index.tsx`                                                                                                     | register NarrativePedigree                                                                                 |
| Interview              | `interfaces/NarrativePedigree/**` (new)                                                                                    | view, genetics engine, focal resolver, highlight, sticker + classic-notation nodes, PresetSwitcher, export |
| Interview (prereq)     | `FamilyPedigree/store.ts`, `transforms/*`, `quickStartWizard/PersonFields.tsx`, `pedigree-layout/utils/getDisplayLabel.ts` | gameteRole → network variable; biological-sex capture                                                      |
