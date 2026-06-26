# Family Pedigree — configurable terminology framing, intro screen, and boundary rules

**Date:** 2026-06-26
**Packages:** `@codaco/protocol-validation`, `@codaco/shared-consts`, `@codaco/architect-web`, `@codaco/interview`
**Status:** Design approved, pending implementation plan

This is **Feature #1 of three** in the family-pedigree redesign. The other two —
(#2) interface fixes (add-sibling discoverability, first-cousin demonstration)
and (#3) the new read-only Narrative Pedigree interface — have their own specs.

## Problem

The Family Pedigree quick-start and add-relative wizards refer to a participant's
two biological parents as their **"egg parent"** and **"sperm parent"**. This
gamete-based framing is strongly preferred in some studies (e.g. trans youth),
where decoupling reproductive contribution from gender is the point. In other
contexts it is confusing and counterproductive — the motivating example was a
Black family-reunion study, where participants expect **"mother"** and
**"father"**.

Researchers therefore need to choose the framing. Sometimes they know their
population and want a single fixed framing (less cognitive load, faster
interview); sometimes they want to **let the participant choose**, as a matter of
respect for individual variation.

Three further authoring needs, currently unmet, travel with this:

1. An optional **introduction screen** (text + video) as the first screen of the
   interview interface, to explain the task and — when participant choice is
   enabled — introduce the framing decision.
2. The framing decision surfaced to the participant when configured.
3. Configurable, enforced **boundary rules** that require the pedigree to extend
   to certain relatives, so the captured genetic context is complete enough for
   the study.

Today none of this is configurable: the terminology is hardcoded literal strings
across the wizard components, there is no intro affordance, and the only enforced
structural rule is "ego must have at least two parents."

## Guiding principle

**Framing changes labels and copy only.** The wizard structure, the steps, the
order, and the underlying data model are identical across both framings. The
interview already records each biological parent's contribution as a neutral
`gameteRole: 'egg' | 'sperm'` primitive (`FamilyPedigree/store.ts`), distinct
from any display string. The "gendered" framing is simply a different label set
over the same primitive (`egg → Mother`, `sperm → Father`). Consequently:

- No data-model change. Exports and downstream analysis are framing-independent —
  a participant who chose "Gendered" still has `gameteRole` recorded identically.
- The whole feature is a label-layer indirection plus three new config inputs.

A deliberate constraint follows: the **Gendered** framing assumes one
egg-contributing "Mother" and one sperm-contributing "Father." Populations with
non-traditional structures (e.g. two mothers) are served by the **Gamete-based**
framing or by participant choice. We do **not** build same-sex labelling into the
Gendered framing; that division of labour is the point of offering both.

## Schema version note

No production protocol uses schema 8, so this design carries **no
backwards-compatibility burden and requires no migration**. New fields are
**mandatory and explicit** where that is the clearest model; `'off'` is a real
written value, not an absence. The interview never falls back to a default — the
config is always present.

## Design

### 1. Schema (`@codaco/protocol-validation`)

In `src/schemas/8/stages/family-pedigree.ts`, extend `familyPedigreeStage`:

```ts
// New, MANDATORY: how the two biological parents are framed.
framing: z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed'), value: z.enum(FRAMING_IDS) }), // 'gamete' | 'gendered'
  z.object({ mode: z.literal('participantChoice') }),
]),

// New, MANDATORY: structural completeness requirements, each tri-state.
boundaries: z.object({
  requireGrandparents:         z.enum(['required', 'recommended', 'off']),
  requireChildrenContributors: z.enum(['required', 'recommended', 'off']),
}),

// New, OPTIONAL: an intro screen shown before parent capture. Optional because
// it is optional content; a stage may legitimately have none.
introScreen: z
  .object({
    title: z.string().optional(),
    text: z.string(),                  // required when introScreen is present
    videoAssetId: z.string().optional(), // text-only intros allowed
  })
  .optional(),
```

- `FRAMING_IDS` is imported from `@codaco/shared-consts` (§2) — the schema and the
  interview must not drift on the framing id set, exactly as `RELATIONSHIP_TYPES`
  is shared today.
- **Video asset cross-reference.** Validate `introScreen.videoAssetId` resolves to
  an asset of type `video` in `assetManifest`, in the protocol-level `superRefine`
  in `src/schemas/8/schema.ts`, mirroring the existing Geospatial/Roster asset
  checks. The asset schema already models `type: 'video'`
  (`schemas/8/assets/assets.ts`).

### 2. Shared constants (`@codaco/shared-consts`)

New `src/family-pedigree-framing.ts` (sibling to the existing
`family-pedigree.ts`), exported from `src/index.ts`:

```ts
export const FRAMING_IDS = ['gamete', 'gendered'] as const;
export type FramingId = (typeof FRAMING_IDS)[number];

// Author-facing umbrella labels, shown only in Architect.
export const FRAMING_AUTHOR_LABELS: Record<FramingId, string> = {
  gamete: 'Gamete-based',
  gendered: 'Gendered',
};

// The participant-facing vocabulary each framing produces.
export type FramingTerms = {
  eggParent: string; // 'Egg Parent'        | 'Mother'
  spermParent: string; // 'Sperm Parent'      | 'Father'
  gestationalCarrier: string; // 'Gestational Carrier' (both)
  eggDonor: string; // 'Egg Donor'  (both)
  spermDonor: string; // 'Sperm Donor' (both)
};

export const FRAMING_TERMS: Record<FramingId, FramingTerms> = {
  gamete: {
    eggParent: 'Egg Parent',
    spermParent: 'Sperm Parent',
    gestationalCarrier: 'Gestational Carrier',
    eggDonor: 'Egg Donor',
    spermDonor: 'Sperm Donor',
  },
  gendered: {
    eggParent: 'Mother',
    spermParent: 'Father',
    gestationalCarrier: 'Gestational Carrier',
    eggDonor: 'Egg Donor',
    spermDonor: 'Sperm Donor',
  },
};
```

Carrier and donor stay gamete-based in both framings — they are clinical,
gender-neutral, and meaningful regardless of framing. The longer conceptual copy
(the bio-parents explainer paragraph, and the framing-chooser option blurbs) is
**interview-package content**, not shared constants, and lives with the steps
that render it (§4.2); it is templated from these nouns. Exact wording is
finalizable with the research team without schema impact.

### 3. Architect config UI (`@codaco/architect-web`)

The `FamilyPedigree` editor is composed of section components registered in
`src/components/StageEditor/Interfaces.tsx` (`INTERFACE_CONFIGS`). Add three new
sections under `src/components/sections/FamilyPedigree/`:

- **`IntroScreen.tsx`** — title (text), body (text/rich-text per existing prompt
  fields), and a **video asset picker** reusing the asset-selection control other
  stages use. Writes the optional `introScreen` object.
- **`FramingConfig.tsx`** — a radio between _Fixed framing_ and _Let the
  participant choose_; when _Fixed_, a select over `FRAMING_AUTHOR_LABELS`
  (Gamete-based / Gendered). Writes the `framing` discriminated union.
- **`BoundaryOptions.tsx`** — two tri-state selects (Required / Recommended /
  Off), one per boundary, following the toggle/select pattern in
  `sections/Narrative/NarrativeBehaviours.tsx`. Writes `boundaries`.

Config is read/written through the existing `"edit-stage"` redux-form and saved
via `stageActions`. Provide form-level defaults for new stages
(`framing: { mode: 'fixed', value: 'gamete' }`, both boundaries `'off'`,
`introScreen` absent) so the author starts from today's behaviour.

### 4. Interview (`@codaco/interview`)

#### 4.1 The label seam (core refactor)

Introduce a single source of framing-aware terms and route every hardcoded label
through it.

- **Store** (`FamilyPedigree/store.ts`): add `framing: FramingId | null` and
  `setFraming(framing)`. The `FamilyPedigreeProvider` initialises it from stage
  config: `mode: 'fixed'` → `framing.value`; `mode: 'participantChoice'` → `null`
  until the participant chooses (§4.2).
- **Hook** `useFramedTerms()` (`FamilyPedigree/hooks/useFramedTerms.ts`): reads
  `framing` from the store and returns `FRAMING_TERMS[framing]`. While `framing`
  is `null` (participant has not yet chosen) the only screens that render are the
  intro and chooser steps, which need no parent terms; the hook returns `null`
  and those screens do not call it for parent labels.
- **Call sites** that currently emit literals, all switched to the hook (or, for
  pure functions, a passed parameter):
  - `components/quickStartWizard/BioParentsIntroStep.tsx`
  - `components/quickStartWizard/EggParentStep.tsx` (title + copy)
  - `components/quickStartWizard/SpermParentStep.tsx`
  - `components/quickStartWizard/GestationalCarrierStep.tsx`
  - `components/wizards/steps/BioTriadStep.tsx` (the densest cluster: role/select/
    hint/donor labels for egg, sperm, carrier)
  - `components/wizards/EgoCellWizard.tsx` step **titles** (built at dialog-open
    time; read framing from the store there)
  - `pedigree-layout/utils/getDisplayLabel.ts` — `gameteParentLabel()` and its
    callers (`getDisplayLabel`, `computeAllDisplayLabels`, `getNodeLabel`) take a
    `framing: FramingId` parameter alongside the existing `variableConfig`.
    `PedigreeView.tsx` passes the store's framing when it computes display labels.
    The neutral relationship labels (Grandparent, Aunt/Uncle, Cousin, Sibling, …)
    are unchanged — only the two direct gamete-parent labels are framed.

Because step **content** reads framing reactively from the store, labels are
correct even when the participant chooses framing mid-wizard.

#### 4.2 Wizard flow — two new quick-start steps

Prepend two steps to the `EgoCellWizard` `steps` array (each with a `skip`
predicate so it is inert when unconfigured):

- **Step 0 — `IntroStep`** (`skip` when `introScreen` is absent): renders
  `introScreen.title`, `introScreen.text`, and, if present, the `videoAssetId`
  video via the interview's existing asset rendering. Purely informational; Next
  advances.
- **Step 1 — `FramingSelectionStep`** (`skip` unless
  `framing.mode === 'participantChoice'`): presents the two framings as choices,
  each shown with a concrete example ("We'll refer to your biological parents as
  your **egg parent** and **sperm parent**" vs "…as your **mother** and
  **father**"). On selection it calls `store.setFraming(choice)` so every
  subsequent step and the renderer use it, and **records the choice** (see §4.4).

When `framing.mode === 'fixed'`, Step 1 is skipped and the store framing is
already set from config.

#### 4.3 Boundary enforcement

Extend `utils/validatePedigree.ts`. Genetic relationships use **biological +
donor** edges (the genetic contributors); a new helper
`geneticParentIds(nodeId, edges, variableConfig)` returns edges _into_ the node
whose relationship type is `biological` or `donor`. "Unknown" relatives are
satisfied by **adding a placeholder person** (an unnamed node — already a
first-class concept; unnamed nodes render with relationship labels), so each
boundary is a pure structural predicate over nodes/edges.

- **`requireGrandparents`** — for **each** genetic parent `P` of ego,
  `geneticParentIds(P).length >= 2`. (Each of ego's biological/donor parents has
  two genetic parents recorded → ego's four grandparents.)
- **`requireChildrenContributors`** — both of:
  1. ego has ≥1 recorded child **or** the participant has explicitly confirmed
     "no children" (a confirmation captured at the children step / checklist; see
     Edge cases);
  2. for **each** genetic co-parent `C` of ego's children (i.e. for each child
     `N` of ego, each member of `geneticParentIds(N) \ {ego}`):
     `geneticParentIds(C).length >= 2` **and** every `P2 ∈ geneticParentIds(C)`
     has `geneticParentIds(P2).length >= 2`. (Each co-parent's parents and
     grandparents recorded — the children's genetic context from the non-ego
     side, symmetric with `requireGrandparents` on ego's side.)

**Severity** comes from config per boundary:

- `required` → contributes blocking issues to `validatePedigreeCompleteness`
  (joining the existing ≥2-parents rule) and shows as a **blocker** in
  `PedigreeChecklist`; the stage cannot be completed until satisfied.
- `recommended` → shows in `PedigreeChecklist` as a **nudge**; never blocks.
- `off` → not evaluated, not shown.

`PedigreeChecklist.tsx` already computes most structural facts; it gains items
driven by these predicates and their severities.

#### 4.4 Recording the participant's framing choice

Persist the chosen framing in the stage's metadata
(`FamilyPedigreeStageMetadata` in `@codaco/shared-consts/stage-metadata.ts` gains
`selectedFraming?: FramingId`), set on `finalizeNetwork()` / at selection time.
Stage metadata is the established home for stage-scoped pedigree facts
(`gameteRole` already lives there, not as a codebook variable), keeping the
codebook unchanged. If a study later needs the choice as analyzable network data,
it can additionally be bound to an ego variable — out of scope here.

## Edge cases

- **Participant choice, then back-navigation.** If the participant changes their
  framing selection, `setFraming` updates the store and all rendered labels
  follow reactively; no captured data changes (only `gameteRole` is stored).
- **"No children" declaration.** `requireChildrenContributors` part (1) needs a
  positive signal that ego has no children, distinct from "not yet recorded." The
  quick-start children step already asks about children; entering zero / a "no
  children" affirmation sets a stage-metadata flag the checklist reads. Without
  the affirmation and with zero children, a `required` boundary stays unmet.
- **Donor co-parent with unknown lineage.** `requireChildrenContributors` (2)
  applies to donor co-parents too; the participant satisfies it with placeholder
  grandparents, or the author sets the boundary to `recommended` for
  donor-heavy populations. This is an intentional authoring choice, not an
  automatic waiver.
- **Fixed framing protocols** never render Step 1 and never write
  `selectedFraming` (it is implied by config).
- **Text-only intro** (`introScreen` with no `videoAssetId`) renders without a
  video region.

## Testing

- **Schema (`protocol-validation`):** `framing` discriminated union accepts both
  modes and rejects `fixed` without `value`; `boundaries` requires both
  tri-state keys; `introScreen.videoAssetId` must resolve to a `video` asset
  (protocol-level). A FamilyPedigree stage with all three new fields validates.
- **shared-consts:** `FRAMING_TERMS` covers both framings; ids match
  `FRAMING_IDS`.
- **Interview unit:** `useFramedTerms` returns the right set per framing and
  `null` before choice; `getDisplayLabel`/`computeAllDisplayLabels` produce
  "Egg Parent"/"Sperm Parent" under gamete and "Mother"/"Father" under gendered,
  with unchanged neutral labels (Grandparent, Cousin…); `geneticParentIds` and
  both boundary predicates across satisfied / unsatisfied / placeholder /
  donor-branch / no-children cases.
- **Interview Storybook:** quick-start under Gamete vs Gendered (titles + copy);
  the participant-choice flow (intro → chooser → bio parents relabel live); a
  stage with each boundary set to `required` showing the completion block and the
  checklist blocker, and `recommended` showing a non-blocking nudge.

## Out of scope (this feature)

- Same-sex labelling within the Gendered framing (see Guiding principle).
- Binding the participant's framing choice to a codebook ego variable.
- Author-defined custom term sets / a third framing (the system is exactly two
  framings by decision).
- Anything in Features #2 (add-sibling, first-cousin story) and #3 (Narrative
  Pedigree).

## File-level change map

| Area          | File(s)                                                                                                                 | Change                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Schema        | `schemas/8/stages/family-pedigree.ts`                                                                                   | add `framing`, `boundaries`, `introScreen`                |
| Schema        | `schemas/8/schema.ts`                                                                                                   | `videoAssetId` → `video` asset cross-ref in `superRefine` |
| shared-consts | `family-pedigree-framing.ts` (new), `index.ts`                                                                          | `FRAMING_IDS`, author labels, `FRAMING_TERMS`             |
| shared-consts | `stage-metadata.ts`                                                                                                     | `FamilyPedigreeStageMetadata.selectedFraming?`            |
| Architect     | `StageEditor/Interfaces.tsx`                                                                                            | register 3 new sections                                   |
| Architect     | `sections/FamilyPedigree/IntroScreen.tsx`, `FramingConfig.tsx`, `BoundaryOptions.tsx` (new)                             | authoring UI                                              |
| Interview     | `FamilyPedigree/store.ts`                                                                                               | `framing`/`setFraming`                                    |
| Interview     | `FamilyPedigree/FamilyPedigreeProvider.tsx`                                                                             | init framing from config                                  |
| Interview     | `FamilyPedigree/hooks/useFramedTerms.ts` (new)                                                                          | term lookup                                               |
| Interview     | `quickStartWizard/IntroStep.tsx`, `FramingSelectionStep.tsx` (new)                                                      | steps 0–1                                                 |
| Interview     | `wizards/EgoCellWizard.tsx`                                                                                             | prepend steps; framed titles                              |
| Interview     | `quickStartWizard/{BioParentsIntro,EggParent,SpermParent,GestationalCarrier}Step.tsx`, `wizards/steps/BioTriadStep.tsx` | read `useFramedTerms()`                                   |
| Interview     | `pedigree-layout/utils/getDisplayLabel.ts`, `pedigree-layout/components/PedigreeView.tsx`                               | thread `framing` param                                    |
| Interview     | `utils/validatePedigree.ts`, `components/PedigreeChecklist.tsx`                                                         | `geneticParentIds`, two boundary predicates, severities   |

```

```
