# Network Composer — Design

- **Date:** 2026-06-27
- **Packages / Apps:** `@codaco/protocol-validation` (schema 8), `apps/architect-web` (stage editor), `packages/interview` (runtime interface)
- **Status:** Approved design, ready for implementation planning

## Problem

A personal network is currently captured across a sequence of dedicated,
linear interfaces: name generation, interpretation (attribute creation), edge
creation, and edge attributes each happen on their own screen. This stepped
flow serves most researcher needs well, but some researchers want to work in a
more free-form way — to use Network Canvas as a network "notepad" where a whole
network can be created and modified visually from a **single screen**.

**Network Composer** is a new interview interface (a new stage type) that
collapses those four tasks into one promptless, free-form canvas. It is loosely
based on the Sociogram, but where the Sociogram only _lays out_ a network that
already exists, the Network Composer is where the network is _built_.

## Research grounding (Participant-Aided Sociogram)

The technique generalises the **Participant-Aided Sociogram (PAS)** — the
paper-based method named and systematised by Hogan, Carrasco & Wellman (2007)
and replicated in detail by Kuhns et al. (2015). The design deliberately keeps
what is methodologically load-bearing in PAS and drops what is merely an
artifact of the paper medium:

**Preserve (methodologically meaningful):**

- **Manual, operator-controlled placement.** Network Canvas deliberately omitted
  auto-layout/auto-resize in its participant interfaces because they "lessen the
  ability of the participant to understand what is displayed" and "undermine the
  participant's sense of control" (Birkett et al. 2021). Network Composer keeps
  placement manual by default.
- **Clique capture instead of pairwise census.** PAS's central burden-reducer is
  "circle a group → everyone in it is tied," avoiding the quadratic dyad census
  (a 20-alter network = 190 pairwise questions). Network Composer provides clique
  gestures (see Interaction model).
- **A persistent, visible overview** as a recall and validation aid.

**Drop / relax (paper-imposed sequencing):**

- **Strict place-then-connect ordering.** On one screen, placing, connecting,
  grouping and attributing interleave freely.
- **One-tie-type-at-a-time drawing.** Multiple edge types coexist on the canvas.
- **The photograph-and-transcribe step.** Structured node/edge/attribute/position
  data is captured natively.

**Methodological caveats** carried into this spec rather than designed away:

- **Spatial reactivity.** A live, clustering picture changes what respondents
  report — it suppresses isolates (McCarty & Govindaramanujam 2005). The
  visualisation is not measurement-neutral; researchers should prompt explicitly
  for unconnected alters. This is operator guidance, not a UI feature.
- **Position is soft data.** Raw x/y is not a validated closeness metric, and
  "closeness" is interpreted heterogeneously across respondents. If ring/zone
  membership ever matters analytically it should be captured as an explicit
  categorical, not inferred from coordinates. Out of scope here; noted for the
  future.
- **No in-elicitation feedback.** Showing respondents how their network compares
  degrades subsequent data validity (GENSI; Stark & Krosnick 2017). Network
  Composer shows no comparative metrics.

A fuller research report (graded findings + citations) informed this section; key
references are listed at the end.

## Operator & use context

Network Composer is a **power tool for researchers**, not a participant-facing
guided step. Two intended modes of use:

1. **Interviewer/researcher-assisted** — an interviewer or clinician drives the
   canvas live while talking with a participant.
2. **Solo researcher notepad** — a researcher uses it alone to sketch, pilot or
   model a network.

This justifies a denser, faster interface (tool palette, inspector, keyboard
affordances, undo) that leans less on hand-holding than a participant interface
would.

## Goals

- One single-screen, promptless, free-form interface that supports the full
  build-a-network loop: create nodes, edit node attributes, create edges (of
  several types), edit edge attributes, reposition, and delete.
- Maximal reuse of existing Sociogram/Canvas infrastructure (rendering, position
  store, force simulation, background) so the net-new surface is small and the
  hardened parts are inherited.
- A new schema-8 stage type that validates with the existing Zod + cross-reference
  machinery, additively (no migration).
- Fast capture-first authoring (quick-add a name, enrich later) with
  designer-configured attribute forms for richer editing.

## Non-goals

- **Not participant-self-driven.** No assumption of an unassisted participant; no
  guided prompt stepping.
- **No prompts.** Configuration lives at the stage level, not per-prompt.
- **No multiple node types in one instance.** A single instance works with one
  node subject type and many edge types.
- **No highlighting behaviour** (the Sociogram's per-prompt attribute toggle is
  out of scope).
- **No node curation/filtering.** This is a construction surface, not a display of
  nodes drawn from other stages — there is no `filter`.
- **No ring/sector data binding.** Concentric circles are a visual scaffold only;
  position persists as raw x/y. No sectors.
- **No comparative/live network metrics** shown to the operator or participant.

## Interaction model (the `NetworkComposer` runtime)

Full-screen canvas with floating UI, reusing the shared `Canvas`,
`useCanvasStore`, `EdgeLayer`, force-simulation worker, and Background rendering
from the Sociogram.

### Tool palette (floating, sticky modes)

A tool stays active until the operator switches, so an action can be repeated.

- **Select / Move** _(default)_ — click a node or edge to select it (loads it
  into the inspector); drag a node to reposition. With auto-layout on, dragging
  pins the node.
- **Add Node** — tap empty canvas to drop a node there. An inline label field
  appears immediately and writes to the `quickAdd` text variable. The tool stays
  active so several nodes can be dropped in a row. Position persists to
  `layoutVariable`.
- **One tool per edge type** (from `edges[]`), each labelled and coloured using
  that edge type's codebook colour. Activate it, then tap source → tap target to
  create an edge of that type. Tapping an already-connected pair of that type
  **removes** it (toggle, consistent with the Sociogram). Tapping the same node
  twice cancels the pending source.
- **Auto-layout switch** (corner) — toggles the force simulation at runtime;
  **off by default**.
- **Undo / Redo** — buttons plus ⌘/Ctrl-Z and ⇧⌘Z.

### Inspector (docked side panel)

Hidden when nothing is selected. On selecting a node it shows the configured
`nodeForm`; on selecting an edge it shows the configured form for that edge type.
Edits write deferred attributes via `updateNode` / `updateEdge`. Includes a
**Delete** button. Clicking empty canvas (in Select mode) deselects.

### Multi-select and clique gestures

Multi-select is a first-class mechanic for fast tie capture, complementing the
single-select-for-inspector model:

- **Shift/⌘-click** several nodes to build a selection.
- **Freehand lasso** — draw around a group of nodes to select them (the literal
  paper "circle the clique" gesture).
- With a multi-selection, a **"connect all with `<edge type>`"** action creates
  every pairwise edge of the chosen type among the selected nodes.
- Multi-select also enables **batch delete** and **batch move**; undo covers both.

### Selection, deletion, and safety

- Delete key or the inspector button removes the selected node (cascading its
  edges) or edge.
- **No confirmation modal** — undo is the safety net.

### Undo / redo

A **stage-local command/inverse stack** (not global redux-undo). Each canvas
action pushes a forward+inverse pair; undo/redo dispatches the inverse against
the network reducer. Bounded length; scoped to this stage's session so it can
never rewrite another stage's data. Node drags coalesce into a single entry so
the stack is not flooded. Covers: add/delete node, add/delete edge (including
clique batches and cascades), attribute-form commits, and (coalesced)
repositioning.

## Schema (`@codaco/protocol-validation`, schema 8)

A new stage type, **additive** to the schema-8 discriminated union: existing
protocols do not use it and still validate untouched; only new protocols carry
it. **No version bump and no migration** (it changes no existing data).

New file `packages/protocol-validation/src/schemas/8/stages/network-composer.ts`,
extending `baseStageSchema` (which supplies `id`, `label`, `interviewScript`,
`skipLogic`):

```text
type:        literal 'NetworkComposer'
subject:     NodeStageSubjectSchema                          // the single node type being built

behaviours?: { automaticLayout?: { enabled: boolean } }      // live force-sim toggle, defaults OFF
background?: { image?, concentricCircles?, skewedTowardCenter? }   // reuse Sociogram Background

quickAdd:        EntityAttributeReference(subject: stageSubject)    // inline-name (text) var
layoutVariable:  EntityAttributeReference(subject: stageSubject)    // x/y store (layout var)
nodeForm?:       TitlelessFormSchema                          // configured inspector form for nodes

edges:           Array<{ subject: EdgeStageSubjectSchema, form?: TitlelessFormSchema }>   // min 1; each entry = a drawable edge type
```

Registration: import and add to the `stageSchemas` array and re-export in
`packages/protocol-validation/src/schemas/8/stages/index.ts`. Reuse
`common/forms.ts`, `common/subjects.ts`, and `entity-attribute-reference.ts`. No
new prompt schema is needed (the interface is promptless).

### Cross-reference validation

Handled by the existing `EntityAttributeReference` + filter machinery once wired:

- `quickAdd` and `layoutVariable` → must reference variables that exist on the
  subject node type (existence-checked; variable type not constrained, matching
  Narrative's `layoutVariable` and QuickAdd's `quickAdd`).
- `nodeForm` fields → node variables of the subject type. `edges[].form` fields →
  variables of that edge type: each edge entry's `subject` carrier makes the
  reference extractor (`stageSubjectOf`) resolve the form's references against the
  edge, not the node — correct with no extractor changes.
- Edge-type existence is not schema-enforced (consistent with the Sociogram, whose
  edge types are plain strings); an edge form still fails if that edge type lacks
  the referenced variable.

### `superRefine` checks

- `edges` has at least one entry (a Composer with no edge types would be a name
  generator).
- No duplicate edge subject type across `edges[]`.

### Shared-graph note

The interview network is global. With no `filter`, the canvas shows all nodes of
the subject type; in a construction-focused protocol where Network Composer is
the only stage creating that type, that set is exactly the nodes created here. If
hard provenance scoping is ever required ("show only nodes born on this canvas"),
that is a separate future addition.

## Architect editor (`apps/architect-web`)

Register `NetworkComposer` in `Screens/NewStageScreen/interfaceOptions.ts`
(picker metadata: title "Network Composer", description, keywords such as
network/build/construct/free-form/notepad/sociogram, category **Sociograms**,
tags for create-nodes + create-edges + node/edge attributes) and in `StageEditor/Interfaces.tsx`
(sections + documentation URL + template defaults).

Sections — mostly reuse, one genuinely new:

| Section                | Reuse / new                                        | Purpose                                                                        |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Node type (subject)    | adapt `NodeType` (no filter UI)                    | pick the single node type                                                      |
| Quick-add variable     | mirror `NameGeneratorQuickAdd` editor              | choose the `text` var the inline name fills                                    |
| Layout variable        | adapt Sociogram's layout-var picker to stage level | choose/create the `layout` var                                                 |
| Node form              | reuse `Form` section                               | configure `nodeForm`                                                           |
| **Edge types + forms** | **new** (`ComposerEdges`)                          | EditableList: add edge types; per type, optionally configure an attribute form |
| Background             | reuse `Background`                                 | concentric circles + image                                                     |
| Automatic layout       | reuse `AutomaticLayout`                            | toggle + params, default off                                                   |
| Skip logic             | reuse `SkipLogic`                                  | standard                                                                       |
| Interview script       | reuse `InterviewScript`                            | standard                                                                       |

The only substantial new editor work is the `ComposerEdges` section
(`apps/architect-web/src/components/sections/ComposerEdges/`): an `EditableList`
of edge types where each entry selects an edge type and optionally configures its
attribute form via the existing form builder. Build sections with the standard
redux-form `ValidatedField` pattern; the editor form name is `edit-stage`.

## Data flow / shared-graph integration

No bespoke persistence — everything lands in the shared Redux network and is
visible to later stages and export:

- **Node creation** reuses the existing name-generator node-create action (writes
  subject type + `quickAdd` value + initial position).
- **Edges** via `toggleEdge` (single and clique-batch).
- **Node attributes** via `updateNode`; **edge attributes** via `updateEdge`.
- **Positions** via `updateNode`, writing `{ x, y }` (normalised 0–1, clamped to
  canvas bounds) to `layoutVariable`. Real-time drag/simulation state lives in the
  Zustand `useCanvasStore`, synced to Redux on drag end / drop, exactly as the
  Sociogram does.

## Component layout (interview package)

New `packages/interview/src/interfaces/NetworkComposer/`:

- `NetworkComposer.tsx` — interface root; wires canvas + palette + inspector.
- `ToolPalette.tsx` — sticky-mode tool palette (select/move, add-node, per-edge
  tools, auto-layout switch, undo/redo).
- `Inspector.tsx` — docked panel rendering the node/edge form on selection.
- `useComposerTools.ts` — the mode state machine (active tool, pending edge
  source, selection set, lasso state).
- `useUndoHistory.ts` — the stage-local command/inverse stack.
- Reuse `canvas/Canvas.tsx`, `canvas/useCanvasStore.ts`, `canvas/EdgeLayer.tsx`,
  and the force-simulation worker; reuse the Sociogram's background rendering.

## Testing strategy

- **protocol-validation** — Zod unit tests for valid/invalid `NetworkComposer`
  stages, cross-reference validation of `quickAdd` / `layoutVariable` / edge
  types / forms, and the `superRefine` checks (≥1 edge, no duplicate edge types).
  Add a fixture protocol containing a Network Composer stage.
- **interview** — Vitest (`--project units`) for the mode state machine,
  quick-add, edge tap/toggle, multi-select + connect-all, lasso clique,
  inspector edits, delete-cascade, undo/redo, and the auto-layout toggle.
  Storybook interaction tests (CI) for the assembled canvas. Use
  `@codaco/protocol-utilities` (`generateNetwork` / `SyntheticInterview`) for
  deterministic fixtures.
- **architect-web** — editor section rendering and redux-form wiring, focused on
  the new `ComposerEdges` section.

## Definition of done

- Schema + cross-reference validation pass; fixture protocol validates.
- Architect editor produces a valid `NetworkComposer` protocol.
- Runtime supports the full build-a-network loop (create/attribute/connect/
  reposition/delete) with working undo/redo and the clique gestures.
- `pnpm typecheck`, `pnpm lint:fix`, `pnpm knip`, and tests are green.

## Open questions / future considerations

- **Provenance scoping** — whether to ever restrict the canvas to nodes created
  on it (not currently planned).
- **Ring/zone capture** — if closeness rings should one day be captured as an
  explicit categorical (per the position-is-soft-data caveat).
- **Isolate prompting** — operator-facing guidance to counter spatial reactivity;
  documentation rather than code.
- **Scale beyond ~20 alters** — search / pan / zoom affordances if large networks
  become common (the canvas already pans/zooms via the shared component;
  revisit if needed).

## References

- Hogan, B., Carrasco, J. A., & Wellman, B. (2007). Visualizing personal
  networks: Working with participant-aided sociograms. _Field Methods_, 19(2),
  116–144.
- Kuhns, L. M., Birkett, M., Muth, S. Q., et al. (2015). Methods for collection of
  participant-aided sociograms. _Connections_, 35(1).
- Antonucci, T. C. (1986). Hierarchical mapping technique. _Generations_, 10(4),
  10–12.
- McCarty, C., & Govindaramanujam, S. (2005). A modified elicitation of personal
  networks using dynamic visualization. _Connections_, 26(2), 9–17.
- Stark, T. H., & Krosnick, J. A. (2017). GENSI: A new graphical tool to collect
  ego-centered network data. _Social Networks_, 48, 36–45.
- Birkett, M., Melville, J., Janulis, P., et al. (2021). Network Canvas: Key
  decisions in the design of an interviewer-assisted network data collection
  software suite. _Social Networks_, 66, 114–124.
- Janulis, P., Phillips, G. L. II, Melville, J., Hogan, B., et al. (2023). Network
  Canvas: an open-source tool for capturing social and contact network data.
  _International Journal of Epidemiology_, 52(4), 1286–1291.
