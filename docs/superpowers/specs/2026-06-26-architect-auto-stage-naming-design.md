# Automatic Stage Naming — Design

- **Date:** 2026-06-26
- **App:** `apps/architect-web`
- **Status:** Approved design, ready for implementation planning

## Problem

When creating a new stage in Architect, researchers frequently leave the stage
name blank. The name field (`label`) starts empty with a placeholder and a
`required` validation, so the researcher is forced to invent a name before they
can save — friction at exactly the wrong moment. We want a sensible name to be
present automatically, derived from what the researcher is configuring, while
remaining fully overridable.

## Goals

- Auto-populate a new stage's name from its configuration.
- Keep the name **live**: it refines itself as the researcher configures the
  stage, and stops the instant the researcher types their own name.
- Make names informative: stage type, subject (node/edge) type, and the
  configuration that distinguishes one stage of a type from another (panels,
  Information assets, Family Pedigree nominations).
- Disambiguate duplicates with a trailing ` #2`, ` #3`, …

## Non-goals

- No schema or validation changes. `label` stays a required string (≤ 50 chars).
- No retroactive renaming of existing stages, imported protocols, or duplicated
  stages. This applies **only** to creating a new stage.
- No new qualifier configuration UI. Qualifiers are derived from existing config.

## Behaviour

- **New stages only.** Auto-naming is active only while creating a stage (the
  stage editor has no `id`). Editing an existing stage never auto-renames it.
- **Live.** While auto-naming is active, the name field is kept in sync with the
  generated name as the researcher sets the subject type and configures the
  stage (e.g. `Form Name Generator` → `Person Form Name Generator` → `Person
Form Name Generator with Roster Panels`).
- **Override.** The moment the researcher types a non-empty value into the name
  field, auto-naming disengages and the field is theirs.
- **Re-engage on clear.** If the researcher clears the field back to empty,
  auto-naming re-engages and resumes generating.
- The existing `required` validation is unchanged; auto-naming simply keeps it
  satisfied (the field is non-empty whenever auto-naming is active).

Ownership is inferred by comparing the current label against the last value the
hook itself generated (`lastGenerated`): a non-empty live label that differs from
`lastGenerated` means the researcher typed it, so auto-naming locks; an empty
label re-engages. This avoids depending on redux-form's `change()` action
suppressing the input's DOM `onChange`, and keeps the ownership decision in one
pure, unit-tested function (`computeAutoNameUpdate`).

## Name composition

Format: `{Subject} {Type} {Qualifier} [ #n]`

Examples:

- `Person Form Name Generator with Roster Panels`
- `Person Quick Add Name Generator`
- `Friendship Per Alter Edge Form`
- `Information with Video`
- `Family Pedigree with Diabetes Nomination`
- `Ego Form`

### Subject

Data-driven: if the stage defines a `subject` that resolves to a codebook entry,
its `name` is prepended.

- Node-subject stages (`subject.entity === 'node'`) → node type `name`.
- Edge-subject stages (`subject.entity === 'edge'`) → edge type `name`
  (e.g. `AlterEdgeForm`).
- Stages with no subject yet (not chosen) → no prefix; it appears once chosen.
- Stages with no subject at all (`EgoForm`, `Information`, `Anonymisation`,
  `FamilyPedigree`) → no prefix. (Family Pedigree: no node-type prefix, by
  decision — the nomination qualifier carries the differentiation.)

### Type names

Concise per-type names (distinct from the longer editor/badge display names):

| Stage type            | Name                     |
| --------------------- | ------------------------ |
| NameGenerator         | Form Name Generator      |
| NameGeneratorQuickAdd | Quick Add Name Generator |
| NameGeneratorRoster   | Roster Name Generator    |
| FamilyPedigree        | Family Pedigree          |
| DyadCensus            | Dyad Census              |
| OneToManyDyadCensus   | One to Many Dyad Census  |
| TieStrengthCensus     | Tie-Strength Census      |
| Sociogram             | Sociogram                |
| Narrative             | Narrative                |
| OrdinalBin            | Ordinal Bin              |
| CategoricalBin        | Categorical Bin          |
| AlterForm             | Per Alter Form           |
| Geospatial            | Geospatial               |
| AlterEdgeForm         | Per Alter Edge Form      |
| EgoForm               | Ego Form                 |
| Information           | Information              |
| Anonymisation         | Anonymisation            |

The map is exhaustive over `StageType` (enforced by the type system), so adding a
new stage type to the schema forces an entry here.

### Qualifiers

A single `getStageQualifiers(stage, resolvers)` function returns the qualifier
string (or none) for a stage. It takes resolver callbacks for codebook/asset
lookups so the function itself stays pure and unit-testable.

**Name Generator panels** (`NameGenerator`, `NameGeneratorQuickAdd`) — inspect
`stage.panels[].dataSource` (`'existing'` = existing network, any other string =
a roster):

- all `existing` → `with Network Panels`
- all roster → `with Roster Panels`
- a mix of both → `with Panels`
- no panels → no qualifier

(`NameGeneratorRoster` has no panels; the whole stage being roster-based is
already conveyed by its type name.)

**Information assets** — collect the distinct media types of `asset` items,
resolving `item.content` → asset manifest `type` (`image`/`video`/`audio`):

- titled and listed per the multi-value rule below (`with Video`,
  `with Image & Video`, …)
- text-only or no assets → no qualifier

**Family Pedigree nominations** — collect the distinct nominated variable names,
resolving `nominationPrompts[].variable` → codebook variable `name`:

- listed per the multi-value rule, with the noun `Nomination`/`Nominations`
  (`with Diabetes Nomination`, `with Diabetes & Asthma Nominations`)
- no nominations → no qualifier

**Multi-value rule** (shared): up to 3 values are listed and joined with commas
and a final `&` (`A`, `A & B`, `A, B & C`); 4+ values summarize to the generic
noun (`with Nominations`; `with Media` for Information). Media types max out at
three, so Information effectively always lists.

## De-duplication

Compared against the labels of all other stages in the protocol,
**case-insensitively** (so an auto name won't sit beside a near-identical manual
one). The generated casing is preserved.

- If the base name is free → no suffix.
- Otherwise append the lowest free ` #2`, ` #3`, … (gaps are filled, so deleting
  ` #2` lets the next stage reclaim it).

The current stage isn't yet in `protocol.stages` during creation, so there's no
self to exclude.

## Length handling (≤ 50 chars)

The label cap is 50. A generated name (including any dedup suffix) that exceeds
50 degrades gracefully, in order:

1. If a multi-value qualifier was listed, fall back to its summarized form
   (`with Nominations` / `with Media`) and rebuild.
2. If still too long, drop the subject prefix.
3. If still too long, hard-truncate to fit, trimming any trailing partial word.

## Architecture

Two small, isolated units. No schema, validation, or stage-creation-flow changes.

### `generateStageName.ts` (new, pure)

Located with the stage editor (e.g.
`apps/architect-web/src/components/StageEditor/generateStageName.ts`). No React
or store dependencies. Exports:

- `STAGE_TYPE_NAMES: Record<StageType, string>` — the concise type-name map.
- `getStageQualifiers(stage, resolvers)` — the per-type qualifier string.
- `composeStageName({ subjectName?, typeName, qualifier? })` — assembles the base
  name.
- `dedupeStageLabel(base, existingLabels)` — applies the ` #n` suffix.
- `fitStageLabel(parts, existingLabels)` (or equivalent) — orchestrates
  composition + dedup + the length-degradation steps, returning the final label.

Resolvers (`resolveNodeOrEdgeName`, `resolveVariableName`, `resolveAssetType`)
are passed in so the pure module never imports selectors.

### Live wiring in `StageHeading.tsx`

`StageHeading` owns the `label` field. A small hook (or inline effect) there:

- reads form values (`type`, `subject`, `panels`, `items`, `nominationPrompts`),
  the codebook (node/edge/variable names via existing selectors), the asset
  manifest, and the sibling stage labels;
- while auto-naming is active (new stage, researcher hasn't taken ownership),
  computes the name and dispatches redux-form `change(formName, 'label', name)`;
- infers ownership by comparing the live label to the last generated value
  (held in a ref) — a non-empty label that differs from it disengages
  auto-naming; clearing to empty re-engages it.

The effect tracks the last generated value and the ownership flag in refs and
re-runs on the resolved inputs (generated name, live label); after each
programmatic `change`, the next run sees the label it just set and no-ops, so it
can't loop.

## Edge cases

- **Subject not yet chosen** → name is type-only (`Form Name Generator`) until a
  subject is selected, then it gains the prefix live.
- **Codebook rename** while auto-naming is active → the live name follows the new
  name. Once saved (or once the researcher types), it's a fixed string.
- **Researcher clears the field** → auto-naming re-engages (treated as
  not-yet-owned), avoiding a `required` error and regenerating.
- **Reopening a saved stage** → existing stage, no `id`-less creation, so no
  auto-update; the saved label stands.

## Testing

- **Unit (pure module):** subject present/absent; each qualifier rule (panel
  source combinations incl. mixed; Information media single/multi; nomination
  single/2-3/4+ summarize); the multi-value list formatting; dedup with no
  collision / one collision / gapped numbers / case-insensitive match; the
  three length-degradation steps; exhaustiveness of `STAGE_TYPE_NAMES`.
- **Component:** a focused render test of `StageHeading` — name updates as
  subject and panels change; stops on user keystroke; re-engages when cleared;
  no auto-update when editing an existing stage.
