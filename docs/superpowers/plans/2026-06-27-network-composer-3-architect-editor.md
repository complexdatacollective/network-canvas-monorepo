# Network Composer — Architect Editor Implementation Plan (3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on section tasks:** registration and picker tasks carry exact code. The three new section components carry concrete reference implementations grounded in the existing `Form`, `NarrativePresets`, and `PromptFieldsLayout` sections; their TDD tests are the contract. Read the named existing section before writing each new one and follow its redux-form patterns precisely.

**Goal:** Add the Architect stage editor for `NetworkComposer` — picker metadata, the editor section registry entry, and three new sections (stage-level layout-variable picker, node attribute form, and the edge-types-with-forms list), reusing existing sections for everything else.

**Architecture:** Register `NetworkComposer` in the stage-type picker (`interfaceOptions.ts`) and the editor registry (`Interfaces.tsx`). Reuse `NodeType`, `QuickAdd`, `Background`, `AutomaticLayout`, `SkipLogic`, `InterviewScript`. Add three new sections under `src/components/sections/`: `ComposerLayoutVariable`, `ComposerNodeForm`, and `ComposerEdges`. All sections are redux-form-driven and receive `StageEditorSectionProps` (`{ form, stagePath, interfaceType }`).

**Tech Stack:** React, redux-form, `react-recompose` enhancers, the app's `~/components/Form/Fields/*` + `ValidatedField` + `EditableList` building blocks, Vitest + Testing Library. The `~` alias maps to `apps/architect-web/src`.

## Global Constraints

- **Depends on plan 1** (`NetworkComposer` added to `StageType`). **Critical coupling:** `INTERFACE_CONFIGS` in `Interfaces.tsx` is typed `{ readonly [K in StageType]: InterfaceConfig }` — an **exhaustive mapped type**. The moment plan 1 adds `'NetworkComposer'` to `StageType`, `apps/architect-web` fails to typecheck until this plan adds the `NetworkComposer` entry. **Land Task 1 of this plan together with (or immediately after) plan 1** to keep the monorepo green. (Turbo can cache a stale per-package typecheck — see the repo's known gotcha — so verify with a forced typecheck.)
- **No `any` types.** Match existing section conventions: `ValidatedField` + field components from `~/components/Form/Fields`, `EditableList` for repeated items, `Section`/`Subsection`/`Row` from `~/components/EditorLayout`, and the `withSubject`/`withLayoutOptions` enhancers.
- **Edges store a `subject` carrier:** each `edges[i]` is `{ subject: { entity: 'edge', type }, form? }` (per plan 1). The edge-type picker writes `edges[i].subject`; the per-edge form writes `edges[i].form.fields`.
- **Node/edge forms are title-less** (`TitlelessFormSchema`) — the form editors must hide the form-title field (use the `disableFormTitle` pattern the `Form` section already supports).
- **Picker category:** `SOCIOGRAMS` (it is a sociogram-family canvas), tags `CREATE_NODES`, `CREATE_EDGES`, `NODE_ATTRIBUTES`, `EDGE_ATTRIBUTES`. (This refines the spec's note of "Generators" — the picker has a dedicated Sociograms group that fits better; the spec has been updated to match.)
- Add new section exports to the **existing** `src/components/sections/index.tsx` barrel (modifying it, consistent with the codebase) — do not create a new barrel.
- Pre-commit hooks run `oxfmt` + `oxlint`. Defer `pnpm typecheck`, full tests, and `knip` to the final verification task.

---

## File Structure

- **Modify:** `apps/architect-web/src/components/Screens/NewStageScreen/interfaceOptions.ts` — add `NetworkComposer` to `INTERFACE_TYPE_NAMES` and an entry in `INTERFACE_TYPES`.
- **Modify:** `apps/architect-web/src/components/StageEditor/Interfaces.tsx` — add the `NetworkComposer` entry to `INTERFACE_CONFIGS`.
- **Create:** `apps/architect-web/src/components/sections/ComposerLayoutVariable/ComposerLayoutVariable.tsx` — stage-level layout-variable picker.
- **Create:** `apps/architect-web/src/components/sections/ComposerNodeForm/ComposerNodeForm.tsx` — node attribute form editor (title-less) at `nodeForm`.
- **Create:** `apps/architect-web/src/components/sections/ComposerEdges/ComposerEdges.tsx` (+ `EdgePreview.tsx`, `EdgeFields.tsx`) — edge-types-with-forms list at `edges`.
- **Modify:** `apps/architect-web/src/components/sections/index.tsx` — export the three new sections.
- **Create (tests):** co-located `__tests__/*.test.tsx` per task (paths given per task).

---

## Milestone M1 — Picker + registry (unblocks the monorepo typecheck)

### Task 1: Register `NetworkComposer` in the picker and editor registry (reused sections only)

**Files:**

- Modify: `apps/architect-web/src/components/Screens/NewStageScreen/interfaceOptions.ts`
- Modify: `apps/architect-web/src/components/StageEditor/Interfaces.tsx`
- Test: `apps/architect-web/src/components/StageEditor/__tests__/networkComposer.registry.test.ts`

**Interfaces:**

- Produces: `INTERFACE_CONFIGS.NetworkComposer` (satisfying the exhaustive mapped type) and an `INTERFACE_TYPES` picker entry.

- [ ] **Step 1: Write the failing test**

Create `apps/architect-web/src/components/StageEditor/__tests__/networkComposer.registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { INTERFACE_TYPES } from '../../Screens/NewStageScreen/interfaceOptions';
import { getInterface } from '../Interfaces';

describe('NetworkComposer registry', () => {
  it('has an editor config with sections', () => {
    const config = getInterface('NetworkComposer');
    expect(config.sections.length).toBeGreaterThan(0);
    expect(config.documentation).toContain('http');
  });

  it('appears in the stage-type picker as a Sociograms entry', () => {
    const entry = INTERFACE_TYPES.find((i) => i.type === 'NetworkComposer');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Sociograms');
  });
});
```

(If `getInterface` is not already exported from `Interfaces.tsx`, this test will reveal it — Architect exposes the config via a `getInterface(type)` accessor; read `Interfaces.tsx` for the exact exported accessor name and use it. If the accessor is a default export or differently named, adjust the import accordingly.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/StageEditor/__tests__/networkComposer.registry.test.ts`
Expected: FAIL — no `NetworkComposer` entry.

- [ ] **Step 3: Add picker metadata**

In `interfaceOptions.ts`, add `'NetworkComposer'` to the `INTERFACE_TYPE_NAMES` array (next to `'Sociogram'`), then add this entry to `INTERFACE_TYPES`:

```ts
  {
    category: CATEGORIES.SOCIOGRAMS,
    tags: [
      TAGS.CREATE_NODES,
      TAGS.CREATE_EDGES,
      TAGS.NODE_ATTRIBUTES,
      TAGS.EDGE_ATTRIBUTES,
    ],
    keywords:
      'network composer sociogram free form notepad build construct nodes edges attributes single screen',
    type: 'NetworkComposer',
    title: 'Network Composer',
    description:
      'A free-form, single-screen canvas for building a whole network — create nodes, draw multiple edge types, and capture node and edge attributes in one place.',
  },
```

- [ ] **Step 4: Add the editor registry entry (reused sections)**

In `Interfaces.tsx`, add to `INTERFACE_CONFIGS` (after the `Sociogram` entry). Use only reused sections for now; the three new sections are inserted in later tasks:

```ts
  NetworkComposer: {
    sections: [
      NodeType,
      QuickAdd,
      Background,
      AutomaticLayout,
      SkipLogic,
      InterviewScript,
    ],
    documentation:
      'https://documentation.networkcanvas.com/interface-documentation/network-composer/',
    template: {
      behaviours: {
        automaticLayout: { enabled: false },
      },
    },
  },
```

`NodeType`, `QuickAdd`, `Background`, `AutomaticLayout`, `SkipLogic`, `InterviewScript` are already imported at the top of `Interfaces.tsx` (verify the `QuickAdd` and `NodeType` imports are present — they are used by `NameGeneratorQuickAdd`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/StageEditor/__tests__/networkComposer.registry.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck (cross-package coupling) and commit**

Run: `pnpm --filter @codaco/architect-web typecheck`
Expected: clean — the exhaustive `INTERFACE_CONFIGS` now covers `NetworkComposer`.

```bash
git add apps/architect-web/src/components/Screens/NewStageScreen/interfaceOptions.ts \
        apps/architect-web/src/components/StageEditor/Interfaces.tsx \
        apps/architect-web/src/components/StageEditor/__tests__/networkComposer.registry.test.ts
git commit -m "feat(architect): register NetworkComposer stage editor and picker entry"
```

---

## Milestone M2 — Stage-level layout-variable picker

### Task 2: `ComposerLayoutVariable` section

**Files:**

- Create: `apps/architect-web/src/components/sections/ComposerLayoutVariable/ComposerLayoutVariable.tsx`
- Modify: `apps/architect-web/src/components/sections/index.tsx`
- Modify: `apps/architect-web/src/components/StageEditor/Interfaces.tsx` (insert the section)
- Test: `apps/architect-web/src/components/sections/ComposerLayoutVariable/__tests__/ComposerLayoutVariable.test.tsx`

**Interfaces:**

- Consumes: `withSubject` (to know the node subject), `withLayoutOptions`/`getLayoutVariablesForSubject` (read `src/components/sections/SociogramPrompts/withLayoutOptions.tsx` and `PromptFieldsLayout.tsx` — reuse the same options + create-variable handler, but bound to the stage-level field `layoutVariable` instead of `layout.layoutVariable`).
- Produces: a `Section` containing a single variable picker writing `layoutVariable`, offering existing `layout`-type variables for the subject and a "create new layout variable" affordance.

- [ ] **Step 1: Write the failing test**

Create `.../ComposerLayoutVariable/__tests__/ComposerLayoutVariable.test.tsx`. Use the Architect section test harness (a redux-form `Provider` + `reduxForm` wrapper — read an existing section test under `src/components/sections/**/__tests__/` for the exact `renderWithStore`/form-mount helper). Assert the section renders a layout-variable picker bound to the `layoutVariable` field and lists the subject's `layout` variables.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/ComposerLayoutVariable/__tests__/ComposerLayoutVariable.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the section**

Create `ComposerLayoutVariable.tsx` modelled on `PromptFieldsLayout.tsx` (lines around 78–99: the variable picker with `options: layoutVariablesForSubject`, the `handleCreateVariable(value, 'layout', <fieldName>)` create handler, and the `variable` value), but with `fieldName="layoutVariable"` and `name="layoutVariable"`. Compose with `withSubject` + `withLayoutOptions` as `PromptFieldsLayout` does. Wrap in a `Section` titled "Node positions" with a short summary explaining positions are stored in this variable.

- [ ] **Step 4: Export and register**

In `src/components/sections/index.tsx`, add the export (follow the existing export style):

```ts
export { default as ComposerLayoutVariable } from './ComposerLayoutVariable/ComposerLayoutVariable';
```

In `Interfaces.tsx`, import `ComposerLayoutVariable` from `~/components/sections` and insert it into `NetworkComposer.sections` after `QuickAdd`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/ComposerLayoutVariable/__tests__/ComposerLayoutVariable.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-web/src/components/sections/ComposerLayoutVariable/ \
        apps/architect-web/src/components/sections/index.tsx \
        apps/architect-web/src/components/StageEditor/Interfaces.tsx
git commit -m "feat(architect): NetworkComposer layout-variable section"
```

---

## Milestone M3 — Node attribute form editor

### Task 3: `ComposerNodeForm` section (title-less form at `nodeForm`)

**Files:**

- Create: `apps/architect-web/src/components/sections/ComposerNodeForm/ComposerNodeForm.tsx`
- Modify: `apps/architect-web/src/components/sections/index.tsx`
- Modify: `apps/architect-web/src/components/StageEditor/Interfaces.tsx`
- Test: `apps/architect-web/src/components/sections/ComposerNodeForm/__tests__/ComposerNodeForm.test.tsx`

**Interfaces:**

- Consumes: the `Form` section's building blocks — read `src/components/sections/Form/Form.tsx`, `FieldFields.tsx`, `FieldPreview.tsx`, `helpers.ts`, `withFormHandlers.tsx`. Reuse `EditableList` + `FieldFields`/`FieldPreview` bound to `nodeForm.fields` (not `form.fields`), with the form title disabled (title-less schema).
- Produces: a `Section` "Node attributes" containing an `EditableList` of form fields writing `nodeForm.fields`, each field selecting a node variable + prompt text.

- [ ] **Step 1: Write the failing test**

Create `.../ComposerNodeForm/__tests__/ComposerNodeForm.test.tsx`: render the section in the form harness; assert it shows the field-list editor bound to `nodeForm.fields` and does NOT render a form-title input.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/ComposerNodeForm/__tests__/ComposerNodeForm.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the section**

Create `ComposerNodeForm.tsx`. The cleanest path is to reuse the existing `Form` field-list editor at a configurable base path. Two acceptable implementations — pick based on what the `Form` building blocks expose when you read them:

- **(a)** If `Form/FieldFields` + `Form/withFormHandlers` accept a configurable field path, render the `EditableList` with `fieldName="nodeForm.fields"`, `editComponent={FieldFields}`, `previewComponent={FieldPreview}`, composed with `withSubject` + the form-handlers enhancer, inside a `Section` titled "Node attributes". Pass `disableFormTitle` semantics (no title field).
- **(b)** If `Form` hardcodes `form.fields`, generalise `withFormHandlers`/`Form` to take an optional `fieldName` base (default `'form'`) and have `ComposerNodeForm` pass `'nodeForm'`. Update the existing `Form` callers to the defaulted signature (no behaviour change). Then implement (a).

Whichever path, the field list must write to `nodeForm.fields` and reuse the existing variable-field editor so node-variable creation/selection behaves exactly like `AlterForm`.

- [ ] **Step 4: Export and register**

Add the export to `sections/index.tsx`; import into `Interfaces.tsx`; insert `ComposerNodeForm` into `NetworkComposer.sections` after `ComposerLayoutVariable`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/ComposerNodeForm/__tests__/ComposerNodeForm.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-web/src/components/sections/ComposerNodeForm/ \
        apps/architect-web/src/components/sections/index.tsx \
        apps/architect-web/src/components/StageEditor/Interfaces.tsx \
        apps/architect-web/src/components/sections/Form/
git commit -m "feat(architect): NetworkComposer node attribute form section"
```

---

## Milestone M4 — Edge types + per-edge attribute forms

### Task 4: `ComposerEdges` section (list of edge types, each with an optional form)

**Files:**

- Create: `apps/architect-web/src/components/sections/ComposerEdges/ComposerEdges.tsx`
- Create: `apps/architect-web/src/components/sections/ComposerEdges/EdgePreview.tsx`
- Create: `apps/architect-web/src/components/sections/ComposerEdges/EdgeFields.tsx`
- Modify: `apps/architect-web/src/components/sections/index.tsx`
- Modify: `apps/architect-web/src/components/StageEditor/Interfaces.tsx`
- Test: `apps/architect-web/src/components/sections/ComposerEdges/__tests__/ComposerEdges.test.tsx`

**Interfaces:**

- Consumes: `EditableList` (model the list on `src/components/sections/NarrativePresets/` — read it for the `EditableList` props, preview/edit components, and `template` for new items); the edge-type picker pattern (read `FilteredEdgeType.tsx` for how edge types are selected/created from the codebook); the `Form` field-list building blocks (as in Task 3) for the per-edge attribute form.
- Produces: a `Section` "Edges" with an `EditableList` at `fieldName="edges"`. Each item's edit form (`EdgeFields`) has: (1) an edge-type select that writes `subject` as `{ entity: 'edge', type }` (offer existing edge types + create-new), and (2) a title-less attribute-form field list writing `form.fields` (relative to the item, i.e. `edges[i].form.fields`). `EdgePreview` shows the edge type label + field count. New-item `template` returns `{ id: <uuid> }` (match how `NarrativePresets` seeds new items).

- [ ] **Step 1: Write the failing test**

Create `.../ComposerEdges/__tests__/ComposerEdges.test.tsx`: render the section in the form harness with a codebook having ≥1 edge type; assert the "Edges" section renders an empty editable list with an "add" affordance; add an edge item and assert the edit form exposes an edge-type select and a (title-less) attribute-field editor.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/ComposerEdges/__tests__/ComposerEdges.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ComposerEdges`, `EdgeFields`, `EdgePreview`**

Build `ComposerEdges.tsx` as a `Section` wrapping an `EditableList` (`fieldName="edges"`, `editComponent={EdgeFields}`, `previewComponent={EdgePreview}`, `template={() => ({ id: uuid() })}`), modelled on `NarrativePresets`. `EdgeFields.tsx`: an edge-type `ValidatedField` (required) writing `subject` (set `subject.entity` to the literal `'edge'` and `subject.type` to the selection — mirror how `FilteredEdgeType` resolves/creates edge types), plus the reused title-less form field-list (from Task 3's generalised `Form` blocks) bound to the item-relative `form.fields`. `EdgePreview.tsx`: render the chosen edge type's label and a "N attributes" summary.

- [ ] **Step 4: Export and register**

Add the export to `sections/index.tsx`; import into `Interfaces.tsx`; insert `ComposerEdges` into `NetworkComposer.sections` after `ComposerNodeForm`. Final `NetworkComposer.sections` order:

```ts
    sections: [
      NodeType,
      QuickAdd,
      ComposerLayoutVariable,
      ComposerNodeForm,
      ComposerEdges,
      Background,
      AutomaticLayout,
      SkipLogic,
      InterviewScript,
    ],
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/ComposerEdges/__tests__/ComposerEdges.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-web/src/components/sections/ComposerEdges/ \
        apps/architect-web/src/components/sections/index.tsx \
        apps/architect-web/src/components/StageEditor/Interfaces.tsx
git commit -m "feat(architect): NetworkComposer edge-types-with-forms section"
```

---

## Milestone M5 — End-to-end editor validation & verification

### Task 5: Round-trip a built protocol through schema validation

**Files:**

- Test: `apps/architect-web/src/components/StageEditor/__tests__/networkComposer.roundtrip.test.ts`

**Interfaces:**

- Consumes: the app's stage-editor submit/serialisation path (read how an existing section test or the StageEditor test asserts the produced stage shape) and `@codaco/protocol-validation`'s stage schema.

- [ ] **Step 1: Write the test**

Create `.../networkComposer.roundtrip.test.ts`: construct a `NetworkComposer` stage object matching what the editor produces (subject node `person`, `quickAdd`, `layoutVariable`, one `edges` entry `{ subject: { entity: 'edge', type: 'knows' }, form: { fields: [...] } }`, optional `nodeForm`), and assert it parses successfully against the exported `networkComposerStage` schema from `@codaco/protocol-validation`. Add a negative case (missing `edges`) that fails.

```ts
import { describe, expect, it } from 'vitest';

import { networkComposerStage } from '@codaco/protocol-validation';

describe('NetworkComposer editor output validates', () => {
  const stage = {
    id: 's1',
    label: 'Compose',
    type: 'NetworkComposer',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    layoutVariable: 'layoutPosition',
    nodeForm: { fields: [{ variable: 'age', prompt: 'Age?' }] },
    edges: [
      {
        subject: { entity: 'edge', type: 'knows' },
        form: { fields: [{ variable: 'closeness', prompt: 'How close?' }] },
      },
    ],
  };

  it('accepts a fully-configured stage', () => {
    expect(networkComposerStage.safeParse(stage).success).toBe(true);
  });

  it('rejects a stage with no edges', () => {
    expect(
      networkComposerStage.safeParse({ ...stage, edges: [] }).success,
    ).toBe(false);
  });
});
```

(Confirm `networkComposerStage` is exported from the `@codaco/protocol-validation` package entry — it is re-exported via the schema-8 `stages` barrel added in plan 1. If the package's public entry does not surface it, import from the same path the existing tests use for other stage schemas.)

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/StageEditor/__tests__/networkComposer.roundtrip.test.ts`
Expected: PASS.

- [ ] **Step 3: Full verification**

```bash
pnpm --filter @codaco/architect-web exec vitest run src/components/sections/Composer* src/components/StageEditor/__tests__/networkComposer.registry.test.ts src/components/StageEditor/__tests__/networkComposer.roundtrip.test.ts
pnpm --filter @codaco/architect-web typecheck
pnpm knip
```

Expected: all NetworkComposer editor tests pass; typecheck clean; knip reports no unused exports (the three new sections are referenced from `Interfaces.tsx`).

- [ ] **Step 4: Commit**

```bash
git add apps/architect-web/src/components/StageEditor/__tests__/networkComposer.roundtrip.test.ts
git commit -m "test(architect): NetworkComposer editor output validates against schema"
```

---

## Self-review notes (coverage vs. spec)

- Picker entry (Sociograms, create-nodes/edges + node/edge attributes tags) ✓ (Task 1). Editor registry entry satisfying the exhaustive type ✓ (Task 1). Reused sections: node type (no filter), quick-add var, background (circles+image), automatic layout (default off), skip logic, interview script ✓ (Task 1). Stage-level layout variable ✓ (Task 2). Node attribute form (title-less) ✓ (Task 3). Edge-types-with-per-type-forms list, edges as `{ subject, form }` ✓ (Task 4). Editor output validates against the plan-1 schema ✓ (Task 5).
- **Execution-order reminder:** Task 1 must land with/after plan 1 to keep `apps/architect-web` typecheck green (exhaustive `INTERFACE_CONFIGS`).

```

```
