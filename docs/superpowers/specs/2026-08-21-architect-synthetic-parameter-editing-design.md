# Architect synthetic parameter editing

**Status**: agreed 2026-08-21 (maintainer interview; decisions inline)
**Target**: a PR whose base branch is `claude/synthetic-interview-generation-7b1a23`
(PR #1426). This spec assumes everything that branch ships: schema-owned
synthetic descriptors, interface-implied rules, the pre-seed feasibility gate,
and the preview/Interviewer integrations.

## Purpose

Give researchers an Architect UI for authoring every synthetic-generation
parameter the protocol schema admits, such that **invalid parameters cannot be
created**. Today the schema refuses invalid authoring at parse, and Architect's
commit-validation listener surfaces those refusals at save; this feature moves
prevention forward into the editing surfaces themselves.

## Governing rules

These outrank any layout detail below.

1. **The schema stays the single source of truth.** The UI imports bounds,
   defaults, resolvers, and implied-rule computation from
   `@codaco/protocol-validation` (`DEFAULT_NODE_COUNT`, `DEFAULT_EDGE_TOPOLOGY`,
   `MAX_SYNTHETIC_POPULATION`, `MAX_SYNTHETIC_OPTION_WEIGHT`,
   `resolveVariableSynthetic`, `collectInterfaceImpliedRules`, the count and
   topology realisation resolvers) and the structured refusal shape
   (`ConstraintConflict`) from `@codaco/protocol-utilities`. No UI file
   restates a number, a bound, a default, or an implied rule. If a needed
   value or function is not yet exported, export it from the owning package in
   this PR — never copy it.
2. **Field-local invalidity is unrepresentable.** Every input is constrained to
   the schema's window for that field (numeric min/max, filtered distribution
   choices, probability inputs on 0–1, weights within the cap, count windows
   narrowed by the stage's own `behaviours.minNodes`/`maxNodes`). A value the
   schema would refuse must not be enterable.
3. **Cross-field invalidity is caught live.** Conflicts no single field can
   express — roster too small for a floor, unique value-space shortfall, count
   support vs `minNodes`, pair caps — are detected as the author edits, by
   running the engine's own pre-seed feasibility analysis (see “Live
   feasibility”), and rendered with the same wording generation itself would
   refuse with. The UI never paraphrases a refusal.
4. **Zero weight until customised.** A researcher who never touches synthetic
   generation sees one collapsed line per surface and nothing else. Expansion
   reveals controls; authoring marks the block; reset returns to the default
   and removes the authored keys. Serialisation follows presence: **authored =
   key present in the protocol; default = key absent** (for schemas with
   `.prefault({})`, "absent" means no explicit sub-keys beyond the prefault).
5. **Authored vs default is always visible.** Every collapsed summary shows the
   _resolved effective value_ and whether it is authored or the schema default
   (e.g. `count: normal(mean 8, sd 3) — default`). Every authored block has a
   "Reset to default" affordance.
6. **One term everywhere: “Synthetic data”.** Sections, the overview screen,
   and all copy use it. Reword the preview-settings toggle from "Start preview
   with example data" to "Start preview with synthetic data" (update the e2e
   pageobject locator and any tests that name it).
7. **Bundled protocols keep authoring nothing.** The sample and development
   protocol sources must not gain synthetic blocks from this work — they
   exercise the schema defaults by design (maintainer decision, 2026-08-21).
   Protocol-source authoring flows must not silently inject authored blocks.
8. **House development rules apply in full** (`developing-in-network-canvas`):
   fresco-ui components on Base UI primitives, design tokens only, keyboard
   operability and screen-reader announcements for every control, whole
   externalisable strings, no `any`, no barrel files, container queries for
   shared components.

## Decisions from the interview

| Question                 | Decision                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage-level placement    | Both: a section in each stage editor **and** a protocol-wide overview screen                                                                                        |
| Visibility               | Collapsed by default, resolved default summarised; authored badge + reset                                                                                           |
| Variable-level placement | Codebook `TypeEditor` only (no inline synthetic controls in stage/form editors)                                                                                     |
| Feasibility              | Live engine-backed feedback + field-local constraint; inline in owning section + overview rollup; no timeline badges                                                |
| Distribution editing     | Type select + parameter fields + live visual of the distribution over its valid window                                                                              |
| Overview screen          | Read-only; effective values, authored/default badges, feasibility verdict; rows link to the owning editor                                                           |
| `responseBurden`         | Editable per-stage control in the synthetic section                                                                                                                 |
| Implied-rule conflicts   | Controls render disabled with a plain-language explanation naming the rule and its source stage                                                                     |
| Option weights           | Disclosure-driven: the variable's Synthetic section is the master switch; while expanded (or authored), the existing Options editor reveals an inline weight column |
| Panels                   | `nominationProbability` control in the NodePanel editor, same collapsed treatment                                                                                   |
| Realised draws           | The preview popup is the try-it path; editors show static distribution visuals only                                                                                 |
| Coverage                 | Every schema-supported stage type and every variable type, in this one PR                                                                                           |
| Verification             | Full bar: unit + Architect e2e round-trips + visual baselines via the CI workflow + standard gates                                                                  |

## Surfaces

### 1. Stage editor section: “Synthetic data”

A new section component (peer of `sections/NodeConfiguration` etc.) appended to
the stage editor of **every** stage type, driven by which synthetic factory the
stage's schema uses — derive the mapping from
`packages/protocol-validation/src/schemas/8/stages/*` rather than hardcoding
it. As of this branch:

| Factory                      | Stage types                                                   | Controls                                              |
| ---------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| `stageNodeSynthetic`         | NameGenerator, NameGeneratorQuickAdd, NameGeneratorRoster     | count distribution, responseBurden                    |
| `stageEdgeSynthetic`         | Sociogram, DyadCensus, OneToManyDyadCensus, TieStrengthCensus | edge topology, responseBurden                         |
| `stageNodeAndEdgeSynthetic`  | NetworkComposer                                               | count (optional), topology (optional), responseBurden |
| `stageValuesSynthetic`       | FamilyPedigree, Geospatial, EgoForm, AlterForm, bins, etc.    | responseBurden only                                   |
| base, `generatesData: false` | Information and other non-generating stages                   | responseBurden only                                   |

Behaviour:

- Collapsed row shows a one-line summary of every resolved parameter with its
  authored/default status. Expanded, each parameter renders its editor.
- **Count**: distribution select (`constant | uniform | poisson | normal`) with
  the schema's parameter fields for the chosen distribution. The numeric
  window shown and enforced is the schema's own resolution window — floors
  from `behaviours.minNodes`, ceilings from `behaviours.maxNodes` and
  `MAX_SYNTHETIC_POPULATION` — obtained from the exported count resolver, not
  recomputed.
- **Topology**: metric select (`density | meanDegree`) then the distribution
  select valid for that metric (density: constant/uniform/normal/beta;
  meanDegree: constant/uniform/normal) and its parameter fields. Density
  parameters are constrained to 0–1; meanDegree to ≥ 0.
- **responseBurden**: numeric field with the schema default summarised like
  every other parameter.
- **Sociogram nuance**: the topology applies only when the stage has an
  edge-creating prompt; when no prompt creates edges the topology controls are
  hidden and the summary says so.
- Any live feasibility conflicts whose owning stage is this stage render
  inline at the top of the section (see “Live feasibility”).

### 2. Codebook `TypeEditor` section: “Synthetic data” per variable

One shared sub-editor component rendered in the Codebook variable editor (and
`NewVariableWindow`), for every variable type, with controls per type:

| Variable type        | Controls                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| number, scalar       | value distribution (schema's set for the type) with parameters; window clamped to the variable's own validation range where one exists      |
| boolean              | probability-true (0–1)                                                                                                                      |
| ordinal, categorical | option weights (via the Options-editor column, below); for multi-select categorical, the selection-count probability table                  |
| text                 | generator select (the schema's generator set, with the inferred default — e.g. person names for `/name/i` variables — shown as the default) |
| datetime             | session-relative window parameters as the schema defines them                                                                               |
| all applicable       | missing-probability (0–1)                                                                                                                   |

**Implied rules** (rule 3 of the schema, rule 8 here): before rendering,
compute the variable's interface-implied rules via
`collectInterfaceImpliedRules` for the current protocol. Controls made
meaningless by an implied rule render **disabled with an explanation naming
the rule and its source stage** — e.g. missing-probability on a variable
written by a quick-add or bin: “Always answered — every node created by
‘Quick Add Name Generator’ receives this value.” A selection-count table on a
bin-written categorical is likewise disabled: “Single choice — assigned by the
categorical bin ‘Contact Types’.” The explanation strings are whole,
externalisable sentences.

**Option weights reveal**: the variable's Synthetic section is the master
disclosure. While it is expanded, or the variable has authored synthetic
content, the existing Options editor for that variable shows an inline
“Weight” column per option (bounded by `MAX_SYNTHETIC_OPTION_WEIGHT`, neutral
placeholder when unauthored). Collapsed and unauthored, the Options editor is
pixel-identical to today. Weights serialise into the variable's `synthetic`
block, not into the option objects, exactly as the schema defines.

### 3. NodePanel editor: panel nomination probability

Each panel in the NodePanels section gains the same collapsed synthetic
treatment for its `nominationProbability` (0–1, schema default shown,
authored badge + reset).

### 4. Overview screen: “Synthetic data”

A new route `/protocol/synthetic` with a ProjectNav entry labelled “Synthetic
data” (icon in keeping with the set in `ProjectNav.tsx`). Read-only:

- **Protocol verdict** at the top: the current live-feasibility result — either
  “Generation is possible” or the list of `ConstraintConflict`s, rendered with
  the engine's own wording.
- **Stage table**: one row per stage in timeline order — stage label, type,
  each resolved parameter with authored/default badge, any conflicts owned by
  the stage; the row links to that stage's editor (its Synthetic section).
- **Variable table**: one row per codebook variable carrying (or eligible for)
  synthetic content — entity/type, variable name, resolved value behaviour,
  implied-rule notes, authored/default badge; links to the Codebook editor.
- **Panels** appear under their owning stage's row.
- No editing on this screen.

### 5. Live feasibility

- Export the pre-seed feasibility analysis from `@codaco/protocol-utilities`
  (it exists inside the generation entry path; give it a public export in this
  PR) so Architect can run exactly the gate generation runs — same inputs,
  same `ConstraintConflict` output.
- Architect runs it against the **current draft protocol** (the stage editor's
  working copy merged over the saved protocol), debounced on edit, with roster
  pools resolved through Architect's own asset store — the same host-resolution
  contract the preview uses. Absent/unresolvable pools follow the engine's
  three-way contract; the UI never fabricates a pool.
- Results render (a) inline in the owning stage section, (b) as the overview
  verdict. Conflict text is the engine's, verbatim.
- Announce verdict _changes_ to screen readers via an `aria-live` region
  (polite), throttled — never per keystroke.
- Feasibility runs must not block typing: run in a debounced async effect; a
  stale result is discarded when a newer edit supersedes it.

### 6. Distribution visual

A small shared visualisation component (new, in fresco-ui if genuinely
reusable, else Architect-local) that renders the selected distribution's shape
over its valid window: curve for continuous (normal, beta, uniform), bars for
discrete (poisson, constant), with the window endpoints labelled. It reads the
same schema windows the fields enforce (validation range for variable values,
0–1 for densities and probabilities, ≥ 0 for meanDegree and counts). Pure
SVG, tokens only, `aria-hidden` with the numeric fields as the accessible
representation, respects reduced motion (no animation required).

## Component and state notes

- Reuse the stage-editor section pattern (`sections/*`) including its form
  bridge; synthetic values participate in the stage editor's existing
  draft/commit lifecycle — committing a stage with authored synthetic content
  saves it; Cancel discards it; the commit-validation listener remains the
  final backstop.
- The TypeEditor sub-editor participates in the Codebook editor's existing
  save flow the same way.
- Collapsed summaries derive from the _parse of the current draft_ (the
  schema's prefaults and defaults produce resolved values), so the summary can
  never disagree with what generation would do.
- Number inputs, selects, toggles, disclosure, badges, alerts: fresco-ui
  (`form/fields/*`, `Alert`, `Badge`, `Surface`, disclosure primitives). Any
  net-new shared component follows the fresco-ui export/story conventions
  (subpath export, `sync-exports`, bare-rendered autodocs story with edge
  cases).

## Out of scope

- No runtime placement gate for bins (issue #1428) and no generation changes
  beyond exporting the feasibility analysis.
- No Interviewer or Fresco UI changes.
- No synthetic blocks added to bundled protocol sources (rule 7).
- `respectSkipLogic`, seeds, and session counts remain run-time options of the
  consuming surfaces (preview settings, Interviewer panel), not protocol
  content, and get no Architect authoring UI.

## Verification bar (all required before the PR is ready)

1. **Unit**: every section/control (rendering of defaults, authored state,
   reset semantics, constraint windows), the implied-rule disabling (each rule
   class), the weights-column reveal, and the live-feasibility wiring
   (debounce, stale-result discard, verbatim conflict rendering) — with the
   real schema, not mocks of it. Every oracle must be able to fail
   (`writing-an-oracle-that-can-fail`).
2. **Architect e2e**: extend the existing `synthetic-round-trip.spec.ts` (or
   add peers) to author parameters **through the UI** — a count, a topology, a
   burden, a variable distribution, an option weight, a panel probability —
   and assert the saved protocol carries exactly the authored blocks and
   nothing else; a fixture with a too-small roster shows the live refusal
   inline and on the overview; the overview lists and links correctly; the
   renamed preview toggle still round-trips.
3. **Visual baselines**: new sections and the overview screen change Architect
   pixels — regenerate via the `Regenerate E2E Visual Snapshots` workflow and
   inspect every image (`regenerating-e2e-visual-snapshots` skill). Never
   write PNG baselines locally.
4. **Gates**: `pnpm typecheck`, `pnpm lint`, `pnpm knip`, affected package
   builds, and the full test suites of every touched package.
5. **Changeset**: extend the existing `synthetic-interview-generation`
   changeset's Architect entry to describe the editing UI (the PR merges into
   the feature branch, so it ships in the same release; do not add a second
   normal-lane changeset for the same release).

## Working agreements for the implementing agent

- Resolve every discovered prerequisite inside this PR; no deferrals.
- Before writing code, invoke `developing-in-network-canvas`; before opening
  the PR, `creating-a-changeset` and `shipping-a-pull-request`.
- When a decision in this spec seems to conflict with the schema, the schema
  wins — and say so in the PR description rather than silently diverging.

## Revision 2 (2026-08-22, maintainer review of the built UI)

These decisions amend the sections above where they conflict.

1. **Explanatory copy.** Every stage-editor Synthetic data section opens with
   researcher-facing prose explaining what synthetic data is for (previewing
   stages with realistic example data, validating export pipelines) and what
   this stage's parameters govern, in the section-intro style the other
   sections use. Parameter labels get one-line descriptions where the name
   alone is not self-explanatory.
2. **Distribution preview uses TanStack Charts.** `DistributionVisual` renders
   through `@tanstack/charts` (alpha; app-local dependency of Architect) —
   area/line marks over the valid window, auto-scaling to its container.
   Token-driven colors, `aria-hidden` unchanged.
3. **No authored/default badges.** Remove the Authored/Default indicators from
   editor surfaces (rule 5's badge clause is rescinded; the "Reset to default"
   affordance stays, shown whenever the block is authored, and collapsed
   summaries keep showing the resolved effective values).
4. **In-situ variable editing (amends the "Codebook TypeEditor only"
   decision).** The shared variable sub-editor is ALSO embedded in each stage
   editor's Synthetic section for the variables that stage writes — a bin
   stage edits its variable's option weights there; quick-add its name
   generator; panels' nominationProbability is surfaced prominently in the
   section rather than only inside the NodePanel editor. One shared component,
   two homes; codebook editing remains.
5. **Roster stages gain no odds parameter** — "nomination odds" meant the
   panel control; the fix is discoverability, not schema.
6. **The Synthetic data screen is removed.** Delete `/protocol/synthetic` and
   its nav entry. The Codebook screen absorbs it: the protocol feasibility
   verdict renders at the top of the Codebook, and each entity's variable
   table gains synthetic summary columns with in-table editing (the shared
   sub-editor, expandable per row). Stage-level parameters live only in their
   stage editors. The codebook deep link (`?entity=…&variable=…`) and the
   stage `?section=synthetic` deep link remain.
7. **Architect generates synthetic interview data.** A "Generate synthetic
   data…" action in the protocol workspace opens a dialog mirroring
   Interviewer's panel (session count, optional seed, drop-out and
   skip-logic toggles), runs `generateInterviews` in Architect with
   host-resolved assets, and saves a real export archive (CSV/GraphML through
   `@codaco/network-exporters`, following Interviewer's browser-side
   `exportSessions` pattern and the shared save ladder). Refusals render the
   engine's conflicts verbatim in the dialog.
8. **Bug fixes.** (a) The +/- steppers on synthetic numeric fields are
   disabled for open-window parameters (mean, sd) — stepping must work
   wherever typing works. (b) The stage editors' assign-additional-attributes
   picker requires two clicks, the first triggering background validation
   errors — single click must work; diagnose the provenance and fix at the
   cause.
