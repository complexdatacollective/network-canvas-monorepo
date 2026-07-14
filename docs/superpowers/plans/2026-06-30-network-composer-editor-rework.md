# Network Composer Editor Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Architect editor for the `NetworkComposer` stage into a consolidated, two-column **Node Configuration** section plus a multi-select **Edge Configuration** section, backed by a new "editable attributes" model where each attribute's input **control lives on the stage configuration** (not the codebook variable).

**Architecture:** Additive, `NetworkComposer`-only schema change (no version bump, no migration — the stage is unreleased) that grows the stage's form-field shape to carry `component`/`parameters`. The interview runtime renders the side panel from the field-level control (backward-compatible fallback to the codebook for every other stage). The Architect editor reuses the existing `EditableList` + `FieldFields` dialog + `OrderedList` + `VariablePicker` machinery, swapping in Composer variants of the persistence helpers so the control is kept on the field and never written to the codebook. `@codaco/protocol-utilities` emits the control on synthetic fields.

**Tech Stack:** Zod 4 (protocol-validation), React + Redux + redux-form + react-recompose (architect-web), Zustand + fresco-ui form system (interview), Vitest across all packages.

## Global Constraints

- **No schema version bump, no migration.** `NetworkComposer` is unreleased; all schema changes are additive to schema 8 only. (See [[interviewer-v8-unreleased-no-changeset]] sibling rule — but this _is_ a released-package change for protocol-validation + interview, so a **changeset IS required** for those two.)
- **Control-on-stage rule:** for `NetworkComposer` attribute fields, `component` + `parameters` are persisted on the stage field and MUST NOT be written to the codebook variable. `options` + `validation` + `name` + `type` stay on the codebook variable. `prompt`/`hint` stay per-field as today.
- **`prompt` is optional** on Composer attribute fields. **No minimum-edge requirement** (`edges` may be empty).
- **Component↔variable-type compatibility is editor-enforced** for v1 (the field schema validates only that `component` is a known `ComponentType`). A codebook-aware compatibility check is explicitly out of scope.
- **No `any`.** No `as` assertions to bypass typing — use guards. (Pre-existing `as` casts copied verbatim from reference files are tolerated only where the reference uses them.)
- **No barrel files.** Import from original sources; never re-export for convenience.
- **Reuse first** (developing-in-network-canvas ladder): reuse/compose existing architect + fresco-ui primitives before building new. New interactive UI is keyboard-operable with correct ARIA.
- **Every registered section's `compose` second generic MUST be `StageEditorSectionProps`** (QuickAdd/ComposerLayoutVariable precedent), e.g. `compose<InnerProps, StageEditorSectionProps>(...)`.
- **Inner section components must NOT be exported** beyond what tests need (knip) — export the named inner only if a unit test imports it directly; otherwise only the `compose(...)` default.
- **Verification discipline** (see [[feedback_agents_minimize_verification_runs]]): each task runs only its **targeted Vitest**. Defer ALL `tsc`/typecheck and `knip` to the final task (Task 10). Pre-commit hooks run lint+format — do NOT run format/lint manually per task. NEVER run e2e/Playwright locally.
- **Turbo-routed typecheck only** when finally run: `pnpm exec turbo run typecheck --filter=<pkg>` (not bare `pnpm --filter <pkg> typecheck`). Interview tests use `--project units`.

---

## File Structure

**`@codaco/protocol-validation`**

- Modify: `packages/protocol-validation/src/schemas/8/stages/network-composer.ts` — new `ComposerFormFieldSchema`/`ComposerFormSchema`; wire into `nodeForm`/`edges[].form`; drop `edges.min(1)`.
- Modify: `packages/protocol-validation/src/schemas/8/index.ts` (or wherever stage types are re-exported) — export the new field/form types if consumed downstream.
- Test: `packages/protocol-validation/src/schemas/8/stages/__tests__/network-composer.test.ts` (+ the cross-reference + superrefine suites that assert `edges:[]` fails).

**`@codaco/interview`**

- Modify: `packages/interview/src/selectors/forms.ts` — `createFieldMetadata` prefers field-level `component`/`parameters`.
- Modify: `packages/interview/src/interfaces/NetworkComposer/Inspector.tsx` + `ComposerDrawer.tsx` — form type `TitlelessForm` → `ComposerForm`.
- Test: `packages/interview/src/selectors/__tests__/forms.test.ts` (or co-located).

**`@codaco/protocol-utilities`**

- Modify: `packages/protocol-utilities/src/SyntheticInterview.ts` — `resolveNetworkComposerFormField`/`…EdgeFormField` emit `component`/`parameters`.
- Test: `packages/protocol-utilities/src/__tests__/SyntheticInterview.test.ts`.

**`apps/architect-web`**

- Create: `apps/architect-web/src/components/sections/Form/composerHelpers.ts` — `composerNormalizeField`, `composerItemSelector`.
- Create: `apps/architect-web/src/components/sections/Form/withComposerFormHandlers.tsx` — Composer `handleChangeFields` (control on field).
- Create: `apps/architect-web/src/components/sections/Form/ComposerFieldPreview.tsx` — lighter row reading `component` from the field.
- Create: `apps/architect-web/src/components/EditableAttributesList/EditableAttributesList.tsx` — reusable list wrapper (node + per-edge-type).
- Create: `apps/architect-web/src/components/sections/NodeConfiguration/NodeConfiguration.tsx` — consolidated node section.
- Create: `apps/architect-web/src/components/sections/EdgeConfiguration/EdgeConfiguration.tsx` — multi-select + per-type attribute blocks.
- Create: `apps/architect-web/src/components/sections/EdgeConfiguration/EdgeTypeMultiSelect.tsx` — multi-select edge-type picker.
- Modify: `apps/architect-web/src/components/StageEditor/Interfaces.tsx` — new 6-section `NetworkComposer` list.
- Delete: `sections/ComposerLayoutVariable/`, `sections/ComposerNodeForm/`, `sections/ComposerConvexHulls/`, `sections/ComposerAutomaticLayout.tsx`, `sections/ComposerEdges/`.
- Test: co-located `__tests__` for each new component + `StageEditor/__tests__/networkComposer.registry.test.ts` + `networkComposer.roundtrip.test.ts`.

**Stories / images**

- Modify: `packages/interview/src/interfaces/NetworkComposer/NetworkComposer.stories.tsx` + `NetworkComposer.capture.stories.tsx` — set `component` on attribute fields.
- Regenerate: `packages/interface-images/src/generated/assets/NetworkComposer.*` (+ manifest).
- Add: `.changeset/network-composer-editor-rework.md` (minor: protocol-validation + interview).

---

## Task 1: Schema — Composer attribute field carries the control

**Files:**

- Modify: `packages/protocol-validation/src/schemas/8/stages/network-composer.ts`
- Test: `packages/protocol-validation/src/schemas/8/stages/__tests__/network-composer.test.ts` and the suite asserting `edges:[]` fails (search for it: `grep -rn "edges" packages/protocol-validation/src/schemas/8/**/__tests__ | grep -i "min\|empty\|at least"`).

**Interfaces:**

- Produces: `ComposerFormFieldSchema`, `ComposerFormSchema`, types `ComposerFormField` / `ComposerForm`. Field shape: `{ variable: string; component: ComponentType; parameters?: Record<string, unknown>; prompt?: string; hint?: string; showValidationHints?: boolean }`. `nodeForm?: ComposerForm`; `edges: Array<{ id: string; subject: EdgeStageSubject; form?: ComposerForm }>` (no `.min(1)`).

- [ ] **Step 1: Write failing tests** in `network-composer.test.ts`:

```ts
import { ComponentTypes } from '../../variables/types';
import { networkComposerStage } from '../network-composer';

const baseStage = {
  id: 's1',
  type: 'NetworkComposer' as const,
  label: 'Compose',
  subject: { entity: 'node' as const, type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layout',
  edges: [],
};

it('accepts a nodeForm field that carries a component and omits prompt', () => {
  const result = networkComposerStage.safeParse({
    ...baseStage,
    nodeForm: {
      fields: [{ variable: 'age', component: ComponentTypes.Number }],
    },
  });
  expect(result.success).toBe(true);
});

it('accepts an empty edges array (no minimum-edge requirement)', () => {
  expect(
    networkComposerStage.safeParse({ ...baseStage, edges: [] }).success,
  ).toBe(true);
});

it('accepts an empty nodeForm.fields array', () => {
  const result = networkComposerStage.safeParse({
    ...baseStage,
    nodeForm: { fields: [] },
  });
  expect(result.success).toBe(true);
});

it('rejects a nodeForm field with an unknown component', () => {
  const result = networkComposerStage.safeParse({
    ...baseStage,
    nodeForm: { fields: [{ variable: 'age', component: 'NotAControl' }] },
  });
  expect(result.success).toBe(false);
});

it('carries component + parameters + prompt on an edge form field', () => {
  const result = networkComposerStage.safeParse({
    ...baseStage,
    edges: [
      {
        id: 'e1',
        subject: { entity: 'edge', type: 'knows' },
        form: {
          fields: [
            {
              variable: 'closeness',
              component: ComponentTypes.VisualAnalogScale,
              parameters: { minLabel: 'Distant', maxLabel: 'Close' },
              prompt: 'How close?',
            },
          ],
        },
      },
    ],
  });
  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/protocol-validation exec vitest run -t "NetworkComposer" src/schemas/8/stages/__tests__/network-composer.test.ts`
Expected: FAIL — component-bearing fields rejected (current `FormFieldSchema` is strict without `component`); `edges:[]` currently rejected by `.min(1)`.

- [ ] **Step 3: Implement the schema** — replace `network-composer.ts` body:

```ts
import { z } from 'zod';

import { findDuplicateName } from '~/utils/validation-helpers';

import { EdgeStageSubjectSchema, NodeStageSubjectSchema } from '../common';
import { entityAttributeReference } from '../entity-attribute-reference';
import { ComponentTypes } from '../variables/types';
import { baseStageSchema } from './base';

// Every input control the form system can render. Layout/location variables
// have no participant-facing control, so they are intentionally absent.
const ComposerComponentSchema = z.enum([
  ComponentTypes.Text,
  ComponentTypes.TextArea,
  ComponentTypes.Number,
  ComponentTypes.RadioGroup,
  ComponentTypes.CheckboxGroup,
  ComponentTypes.Boolean,
  ComponentTypes.Toggle,
  ComponentTypes.ToggleButtonGroup,
  ComponentTypes.VisualAnalogScale,
  ComponentTypes.LikertScale,
  ComponentTypes.DatePicker,
  ComponentTypes.RelativeDatePicker,
]);

// NetworkComposer attribute fields differ from the shared FormFieldSchema:
// the input control (`component`) and its parameters live on the STAGE here,
// not on the codebook variable, so the same variable can render with different
// controls in different stages. The runtime side panel reads the control from
// this field (see interview/src/selectors/forms.ts). `prompt` is optional —
// an attribute can render with just its variable label.
export const ComposerFormFieldSchema = z.strictObject({
  variable: entityAttributeReference({ subject: 'stageSubject' }),
  component: ComposerComponentSchema,
  parameters: z.record(z.string(), z.unknown()).optional(),
  prompt: z.string().optional(),
  hint: z.string().optional(),
  showValidationHints: z.boolean().optional(),
});
export type ComposerFormField = z.infer<typeof ComposerFormFieldSchema>;

// Title-less, and (unlike TitlelessFormSchema) the fields array may be empty —
// the runtime renders "No attributes to edit" for an empty/absent form.
export const ComposerFormSchema = z.strictObject({
  fields: z.array(ComposerFormFieldSchema),
});
export type ComposerForm = z.infer<typeof ComposerFormSchema>;

export const networkComposerStage = baseStageSchema.extend({
  type: z.literal('NetworkComposer'),
  subject: NodeStageSubjectSchema,
  quickAdd: entityAttributeReference({ subject: 'stageSubject' }),
  layoutVariable: entityAttributeReference({ subject: 'stageSubject' }),
  nodeForm: ComposerFormSchema.optional(),
  convexHulls: z
    .array(entityAttributeReference({ subject: 'stageSubject' }))
    .optional(),
  background: z
    .strictObject({
      image: z.string().optional(),
      concentricCircles: z.number().int().optional(),
      skewedTowardCenter: z.boolean().optional(),
    })
    .optional(),
  behaviours: z
    .strictObject({ automaticLayout: z.boolean().optional() })
    .optional(),
  edges: z
    .array(
      z.strictObject({
        id: z.string(),
        subject: EdgeStageSubjectSchema,
        form: ComposerFormSchema.optional(),
      }),
    )
    .superRefine((edges, ctx) => {
      const duplicateType = findDuplicateName(
        edges.map((edge) => edge.subject.type),
      );
      if (duplicateType) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Network Composer edges contain duplicate type "${duplicateType}"`,
          path: [],
        });
      }
    }),
});
```

Note: keep the existing `TitlelessFormSchema` import removed from this file (it is still used by alter-form/ego-form/alter-edge-form — do not delete the schema itself). Verify the `ComponentTypes` import path resolves (`../variables/types`).

- [ ] **Step 4: Update the negative `edges:[]` test elsewhere** — find the existing assertion that an empty `edges` array fails (cross-reference / superrefine suite) and change it to expect success, OR replace it with the duplicate-edge-type negative (which still fails). Run the full protocol-validation suite region:

Run: `pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8`
Expected: PASS. If `entity-attribute-reference-coverage.test.ts` fails on `EXPECTED_TAGGED_FIELD_COUNT`, the count should be **unchanged** (the field still has exactly one tagged `variable` ref) — investigate any delta before editing the number.

- [ ] **Step 5: Export new types** if any downstream package imports them. Add to the schema-8 stage exports (mirror how `networkComposerStage` is exported). Then commit:

```bash
git add packages/protocol-validation/src/schemas/8/stages/network-composer.ts packages/protocol-validation/src/schemas/8/stages/__tests__/network-composer.test.ts
git commit -m "feat(protocol-validation): NetworkComposer attribute fields carry the input control"
```

---

## Task 2: Runtime — render the side panel from the field-level control

**Files:**

- Modify: `packages/interview/src/selectors/forms.ts` (`createFieldMetadata`, lines 43-77)
- Modify: `packages/interview/src/interfaces/NetworkComposer/Inspector.tsx` (import/type), `ComposerDrawer.tsx` if it types the form
- Test: co-located forms selector test

**Interfaces:**

- Consumes: `ComposerFormField`/`ComposerForm` from `@codaco/protocol-validation` (Task 1).
- Produces: `createFieldMetadata` returns metadata whose `component`/`parameters` come from the field when present, else the codebook entry.

- [ ] **Step 1: Write failing test** — a Composer-shaped field with a field-level `component` that differs from (or is absent on) the codebook variable resolves to the field's component:

```ts
import { selectFieldMetadataFromVariables } from '../forms';

it('prefers the field-level component over the codebook (control on stage)', () => {
  const variables = {
    closeness: { name: 'closeness', type: 'scalar' as const }, // no codebook component
  };
  const fields = [
    {
      variable: 'closeness',
      component: 'VisualAnalogScale',
      prompt: 'How close?',
    },
  ];
  const [meta] = selectFieldMetadataFromVariables(
    variables as never,
    fields as never,
  );
  expect(meta.component).toBe('VisualAnalogScale');
  expect(meta.label).toBe('How close?');
});

it('falls back to the codebook component when the field has none (other stages)', () => {
  const variables = {
    age: { name: 'age', type: 'number' as const, component: 'Number' },
  };
  const fields = [{ variable: 'age', prompt: 'Age' }];
  const [meta] = selectFieldMetadataFromVariables(
    variables as never,
    fields as never,
  );
  expect(meta.component).toBe('Number');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/selectors/__tests__/forms.test.ts`
Expected: FAIL — current `createFieldMetadata` invariants on the codebook component and ignores any field-level component.

- [ ] **Step 3: Implement** — replace `createFieldMetadata` (forms.ts:43-77):

```ts
const createFieldMetadata = (
  variables: Record<string, Variable>,
  fields: Array<
    FormField & { component?: string; parameters?: Record<string, unknown> }
  >,
) => {
  if (!variables || Object.keys(variables).length === 0) return [];
  if (!Array.isArray(fields)) return [];

  return fields.map((field) => {
    const { variable, prompt, hint, showValidationHints } = field;
    if (!variables[variable]) {
      throw new Error(`Missing codebook entry for variable: ${variable}`);
    }
    const codebookEntry = variables[variable];

    // The control (component) and its parameters may live on the stage field
    // (NetworkComposer) or, for every other stage, on the codebook variable.
    const codebookComponent =
      'component' in codebookEntry ? codebookEntry.component : undefined;
    const component = field.component ?? codebookComponent;
    invariant(component !== undefined, 'Missing component for form field');

    const codebookParameters =
      'parameters' in codebookEntry ? codebookEntry.parameters : undefined;
    const parameters = field.parameters ?? codebookParameters;

    return {
      ...codebookEntry,
      ...(parameters !== undefined ? { parameters } : {}),
      component,
      variable,
      label: prompt,
      hint,
      showValidationHints,
    };
  });
};
```

Update the exported wrappers' `fields` param types to `Array<FormField & { component?: string; parameters?: Record<string, unknown> }>` (or import `ComposerFormField` and widen to a union). Keep `selectFieldMetadataWithSubject`'s `createSelector` shape.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/selectors/__tests__/forms.test.ts`
Expected: PASS.

- [ ] **Step 5: Update Inspector/Drawer types** — in `Inspector.tsx` replace `import type { TitlelessForm } from '@codaco/protocol-validation'` with `ComposerForm`, and `form: TitlelessForm | undefined` → `form: ComposerForm | undefined`. Mirror in `ComposerDrawer.tsx` if it carries the type. Run the NetworkComposer inspector suite:

Run: `pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/interview/src/selectors/forms.ts packages/interview/src/selectors/__tests__/forms.test.ts packages/interview/src/interfaces/NetworkComposer/Inspector.tsx packages/interview/src/interfaces/NetworkComposer/ComposerDrawer.tsx
git commit -m "feat(interview): NetworkComposer side panel renders the stage-level control"
```

---

## Task 3: protocol-utilities — emit the control on synthetic fields

**Files:**

- Modify: `packages/protocol-utilities/src/SyntheticInterview.ts` (`resolveNetworkComposerFormField` ~1031, `resolveNetworkComposerEdgeFormField` ~1052)
- Test: `packages/protocol-utilities/src/__tests__/SyntheticInterview.test.ts`

**Interfaces:**

- Produces: both resolvers return `{ variable: string; component?: ComponentType; parameters?: Record<string, unknown>; prompt?: string }` and the emitted `nodeForm`/`edges` fields carry `component`.

- [ ] **Step 1: Write failing test** — an `addNodeFormField` with a component surfaces on the serialized stage:

```ts
it('emits the component on a NetworkComposer node attribute field', () => {
  const si = new SyntheticInterview();
  const node = si.addNodeType({ name: 'person' });
  const stage = si.addStage('NetworkComposer', { subject: node.subject });
  stage.addNodeFormField({ component: 'Number', prompt: 'Age' });
  const payload = si.getInterviewPayload();
  const composer = payload.protocol.stages.find(
    (s) => s.type === 'NetworkComposer',
  );
  expect(composer.nodeForm.fields[0].component).toBe('Number');
});
```

(Match the exact builder API in the existing test file — `addStage`, `addNodeType`, `getInterviewPayload`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/protocol-utilities exec vitest run -t "NetworkComposer"`
Expected: FAIL — `resolveNetworkComposerFormField` currently omits `component`.

- [ ] **Step 3: Implement** — update both resolvers to include the control, replacing the omitting comment:

```ts
private resolveNetworkComposerFormField(
  input: FormFieldInput,
  nodeTypeId: string,
): { variable: string; component?: ComponentType; parameters?: Record<string, unknown>; prompt?: string } {
  let variableId = input.variable;
  if (!variableId) {
    const ref = this.addVariableToNodeType(nodeTypeId, {
      component: input.component,
      name: input.prompt,
      validation: input.validation,
    });
    variableId = ref.id;
  }
  const nodeType = this.nodeTypes.get(nodeTypeId);
  const variable = nodeType?.variables.get(variableId);
  return {
    variable: variableId,
    ...(input.component ? { component: input.component } : {}),
    ...(input.parameters ? { parameters: input.parameters } : {}),
    prompt: input.prompt ?? variable?.name ?? 'Field',
  };
}
```

Mirror in `resolveNetworkComposerEdgeFormField` (using `addVariableToEdgeType`). If `FormFieldInput` lacks `parameters`, add it as an optional field on that type. The `getInterviewPayload` serializer (line 1678) already passes `nodeForm`/`edges` through, so no serializer change is needed.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @codaco/protocol-utilities exec vitest run`
Expected: PASS (incl. the all-stage-type coverage test for `generateNetwork`, which is unaffected).

- [ ] **Step 5: Commit**

```bash
git add packages/protocol-utilities/src/SyntheticInterview.ts packages/protocol-utilities/src/__tests__/SyntheticInterview.test.ts
git commit -m "feat(protocol-utilities): emit NetworkComposer attribute control on synthetic fields"
```

---

## Task 4: Architect — Composer persistence helpers + lighter preview

**Files:**

- Create: `apps/architect-web/src/components/sections/Form/composerHelpers.ts`
- Create: `apps/architect-web/src/components/sections/Form/withComposerFormHandlers.tsx`
- Create: `apps/architect-web/src/components/sections/Form/ComposerFieldPreview.tsx`
- Test: `apps/architect-web/src/components/sections/Form/__tests__/composerHelpers.test.ts`

**Interfaces:**

- Consumes: `getCodebookProperties` from `./helpers`, `getVariablesForSubject`, `createVariableAsync`/`updateVariableAsync`, `getTypeForComponent` from `~/config/variables`.
- Produces:
  - `composerNormalizeField(field) => field` — omits `['id','_createNewVariable','options','validation']`; **keeps** `component`, `parameters`, `prompt`, `hint`.
  - `composerItemSelector(entity, type) => (state, {form, editField}) => item` — merges only `options`+`validation` from codebook onto the item.
  - `withComposerFormHandlers` — recompose enhancer providing `handleChangeFields(values)` that writes `type`+`options`+`validation` (NOT `component`/`parameters`) to the codebook and returns the field value **with** `component`/`parameters` retained.
  - `ComposerFieldPreview` — default export; props `{ variable, prompt, component, entity, type }`.

- [ ] **Step 1: Write failing tests** for the helpers:

```ts
import {
  composerNormalizeField,
  composerItemSelector,
} from '../composerHelpers';

describe('composerNormalizeField', () => {
  it('keeps component and parameters on the field but strips codebook + scaffolding props', () => {
    const out = composerNormalizeField({
      id: 'x',
      _createNewVariable: 'Age',
      variable: 'age',
      component: 'Number',
      parameters: { min: 0 },
      prompt: 'Age',
      options: [{ label: 'a', value: 'a' }],
      validation: { required: true },
    });
    expect(out).toEqual({
      variable: 'age',
      component: 'Number',
      parameters: { min: 0 },
      prompt: 'Age',
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/Form/__tests__/composerHelpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `composerHelpers.ts`**:

```ts
import { get, omit } from 'es-toolkit/compat';
import { formValueSelector } from 'redux-form';

import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';

// Codebook props that, for NetworkComposer, stay on the codebook variable.
// `component`/`parameters` are intentionally NOT here — they live on the field.
const COMPOSER_CODEBOOK_PROPERTIES = ['options', 'validation'] as const;

export const composerNormalizeField = (field: Record<string, unknown>) =>
  omit(field, ['id', '_createNewVariable', ...COMPOSER_CODEBOOK_PROPERTIES]);

export const composerItemSelector =
  (entity: string | null, type: string | null) =>
  (
    state: RootState,
    { form, editField }: { form: string; editField: string },
  ) => {
    const item = formValueSelector(form)(state, editField) as
      Record<string, unknown> | undefined;
    if (!item || !entity) return null;

    const variable = item.variable as string | undefined;
    const codebookVariables = getVariablesForSubject(state, {
      entity: entity as 'node' | 'edge' | 'ego',
      type: type ?? undefined,
    });
    const codebookVariable = get(
      codebookVariables,
      variable ?? '',
      {},
    ) as Record<string, unknown>;
    // Merge ONLY options + validation so the dialog can edit them; component +
    // parameters stay as the field already has them (do not let codebook clobber).
    const merged: Record<string, unknown> = { ...item };
    for (const key of COMPOSER_CODEBOOK_PROPERTIES) {
      if (key in codebookVariable) merged[key] = codebookVariable[key];
    }
    return merged;
  };
```

- [ ] **Step 4: Run helper tests**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/Form/__tests__/composerHelpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `withComposerFormHandlers.tsx`** (mirror `withFormHandlers.tsx`, but exclude `component`/`parameters` from the codebook write and retain them in the returned field):

```tsx
import { connect } from 'react-redux';
import { compose, withHandlers } from 'react-recompose';
import type { FormAction } from 'redux-form';
import { change, SubmissionError } from 'redux-form';

import { getTypeForComponent } from '~/config/variables';
import {
  createVariableAsync,
  updateVariableAsync,
} from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/modules/root';

import { makeGetVariable } from '../../../selectors/codebook';

type Entity = 'node' | 'edge' | 'ego';

type FormHandlerProps = {
  updateVariable: typeof updateVariableAsync;
  createVariable: typeof createVariableAsync;
  type: string;
  entity: string;
  changeForm: (form: string, field: string, value: unknown) => FormAction;
  form: string;
  getVariable: (uuid: string) => ReturnType<ReturnType<typeof makeGetVariable>>;
};

const composerFormHandlers = withHandlers({
  handleChangeFields:
    (props: FormHandlerProps) => async (values: Record<string, unknown>) => {
      const { variable, _createNewVariable, options, validation, ...rest } =
        values as {
          variable?: string;
          _createNewVariable?: string;
          options?: unknown;
          validation?: unknown;
          component?: string;
          [key: string]: unknown;
        };

      const variableType = getTypeForComponent(
        rest.component as string | undefined,
      );
      // Codebook keeps type/options/validation only — NOT component/parameters.
      const codebookConfiguration = {
        type: variableType,
        ...(options !== undefined ? { options } : {}),
        ...(validation !== undefined ? { validation } : {}),
      };

      props.changeForm(props.form, '_modified', Date.now());

      if (!_createNewVariable) {
        const current = props.getVariable(variable ?? '');
        if (!current)
          throw new SubmissionError({ _error: 'Variable not found' });
        const currentVar = current as { type?: string; name?: string };
        await props.updateVariable({
          entity: props.entity as Entity,
          type: props.type,
          variable: variable ?? '',
          configuration: {
            type: currentVar.type,
            name: currentVar.name,
            ...codebookConfiguration,
          } as Record<string, unknown>,
          merge: false,
        });
        return { variable, ...rest }; // rest retains component + parameters
      }

      try {
        const result = await props.createVariable({
          entity: props.entity as Entity,
          type: props.type,
          configuration: {
            ...codebookConfiguration,
            name: _createNewVariable,
          } as Record<string, unknown>,
        });
        const payload = result as unknown as { payload: { variable: string } };
        return { variable: payload.payload.variable, ...rest };
      } catch (e) {
        throw new SubmissionError({ variable: String(e) });
      }
    },
});

const mapDispatchToProps = {
  changeForm: change as (
    form: string,
    field: string,
    value: unknown,
  ) => FormAction,
  updateVariable: updateVariableAsync,
  createVariable: createVariableAsync,
};
const mapStateToProps = (state: RootState) => ({
  getVariable: (uuid: string) => makeGetVariable(uuid)(state),
});

export default compose(
  connect(mapStateToProps, mapDispatchToProps),
  composerFormHandlers,
);
```

- [ ] **Step 6: Implement `ComposerFieldPreview.tsx`** (lighter row; `component` from the field, `type` from codebook for the badge):

```tsx
import { get } from 'es-toolkit/compat';
import { useSelector } from 'react-redux';

import Badge from '~/components/Badge';
import withSubject from '~/components/enhancers/withSubject';
import { Markdown } from '~/components/Form/Fields';
import { getColorForType } from '~/config/variables';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';

type ComposerFieldPreviewProps = {
  variable: string;
  prompt?: string;
  component?: string;
  entity: string;
  type?: string | null;
};

const ComposerFieldPreview = ({
  variable,
  prompt,
  component,
  entity,
  type = null,
}: ComposerFieldPreviewProps) => {
  const subjectVariables = useSelector((state: RootState) =>
    getVariablesForSubject(state, {
      entity: entity as 'node' | 'edge' | 'ego',
      type: type ?? undefined,
    }),
  );
  const codebookVariable = get(subjectVariables, variable, {}) as {
    type?: string;
  };

  return (
    <div className="m-(--space-md) flex flex-col gap-(--space-sm)">
      {prompt && <Markdown label={prompt} className="[&>p]:m-0" />}
      <div>
        <Badge color={getColorForType(codebookVariable.type)}>
          <strong>{codebookVariable.type}</strong>
          {' variable using '}
          <strong>{component}</strong>
          {' input control'}
        </Badge>
      </div>
    </div>
  );
};

export default withSubject(ComposerFieldPreview);
```

- [ ] **Step 7: Commit**

```bash
git add apps/architect-web/src/components/sections/Form/composerHelpers.ts apps/architect-web/src/components/sections/Form/withComposerFormHandlers.tsx apps/architect-web/src/components/sections/Form/ComposerFieldPreview.tsx apps/architect-web/src/components/sections/Form/__tests__/composerHelpers.test.ts
git commit -m "feat(architect-web): Composer attribute persistence helpers (control on stage)"
```

---

## Task 5: Architect — `EditableAttributesList` wrapper

**Files:**

- Create: `apps/architect-web/src/components/EditableAttributesList/EditableAttributesList.tsx`
- Test: `apps/architect-web/src/components/EditableAttributesList/__tests__/EditableAttributesList.test.tsx`

**Interfaces:**

- Consumes: `EditableList`, `FieldFields`, `ComposerFieldPreview`, `composerNormalizeField`, `composerItemSelector` (Task 4), `withComposerFormHandlers` (Task 4).
- Produces: `EditableAttributesList` — props `{ fieldName: string; entity: 'node'|'edge'; type: string|null; form: string; editFormName?: string; title?: string }`. Renders the reorderable attribute list + add/edit dialog and persists the control on the field.

- [ ] **Step 1: Write failing test** — it renders the list bound to the given `fieldName` and wires the Composer normalize:

```tsx
import { render, screen } from '@testing-library/react';
import EditableAttributesList from '../EditableAttributesList';
// mock EditableList to assert the props EditableAttributesList passes it
vi.mock('~/components/EditableList', () => ({
  default: (props: Record<string, unknown>) => (
    <div
      data-testid="editable-list"
      data-fieldname={props.fieldName as string}
      data-editform={props.editFormName as string}
    />
  ),
}));

it('binds the EditableList to the given fieldName + editFormName', () => {
  render(
    <EditableAttributesList
      fieldName="nodeForm.fields"
      entity="node"
      type="person"
      form="edit-stage"
      editFormName="node-attr-edit"
    />,
  );
  const list = screen.getByTestId('editable-list');
  expect(list.dataset.fieldname).toBe('nodeForm.fields');
  expect(list.dataset.editform).toBe('node-attr-edit');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/EditableAttributesList`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (model on `ComposerNodeForm`'s EditableList wiring, but Composer helpers + the `withComposerFormHandlers`-provided `handleChangeFields` threaded in by the consuming section). Because `handleChangeFields` comes from the section enhancer, accept it as a prop:

```tsx
import EditableList from '~/components/EditableList';

import FieldFields from '../sections/Form/FieldFields';
import ComposerFieldPreview from '../sections/Form/ComposerFieldPreview';
import {
  composerItemSelector,
  composerNormalizeField,
} from '../sections/Form/composerHelpers';

type EditableAttributesListProps = {
  fieldName: string;
  entity: 'node' | 'edge';
  type: string | null;
  form: string;
  editFormName?: string;
  title?: string;
  handleChangeFields: (fields: Array<Record<string, unknown>>) => void;
};

const EditableAttributesList = ({
  fieldName,
  entity,
  type,
  form,
  editFormName = 'editable-list-form',
  title = 'Edit attribute',
  handleChangeFields,
}: EditableAttributesListProps) => (
  <EditableList
    editComponent={FieldFields}
    editProps={{ type, entity }}
    previewComponent={ComposerFieldPreview}
    fieldName={fieldName}
    title={title}
    editFormName={editFormName}
    onChange={(value: unknown) =>
      handleChangeFields(value as Array<Record<string, unknown>>)
    }
    normalize={(value: unknown) =>
      composerNormalizeField(value as Record<string, unknown>)
    }
    itemSelector={
      composerItemSelector(entity, type) as (
        state: Record<string, unknown>,
        params: { form: string; editField: string },
      ) => unknown
    }
    form={form}
  />
);

export default EditableAttributesList;
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/EditableAttributesList`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/architect-web/src/components/EditableAttributesList
git commit -m "feat(architect-web): reusable EditableAttributesList for node + edge attributes"
```

---

## Task 6: Architect — consolidated `NodeConfiguration` section

**Files:**

- Create: `apps/architect-web/src/components/sections/NodeConfiguration/NodeConfiguration.tsx`
- Test: `apps/architect-web/src/components/sections/NodeConfiguration/__tests__/NodeConfiguration.test.tsx`

**Interfaces:**

- Consumes: `Section`/`Row` (two-column, `layout="horizontal"`), `VariablePicker`, `CheckboxGroup`, the automatic-layout `Toggle`, `EditableAttributesList` (Task 5), `withComposerFormHandlers` (Task 4), `withSubject`, `withDisabledSubjectRequired`, `withCreateVariableHandlers`.
- Produces: default `compose<NodeConfigurationProps, StageEditorSectionProps>(...)`. Binds `quickAdd`, `layoutVariable`, `behaviours.automaticLayout`, `convexHulls`, `nodeForm.fields`. Disabled until `subject.type` set.

- [ ] **Step 1: Write failing tests** — asserts the section renders the four pickers + the attributes list and is disabled without a node type. Model the test harness on `ComposerLayoutVariable.test.tsx` and `ComposerConvexHulls` tests (mock `VariablePicker`, `CheckboxGroup`, `EditableAttributesList`). Assert:
  - a `quickAdd` ValidatedField, a `layoutVariable` ValidatedField, an automatic-layout toggle bound to `behaviours.automaticLayout`, a `convexHulls` CheckboxGroup, and an `EditableAttributesList` with `fieldName="nodeForm.fields"`.
  - when `disabled` is true (no subject), the `Section` receives `disabled`.

```tsx
it('renders node config fields and the editable attributes list', () => {
  renderSection({ type: 'person', entity: 'node' });
  expect(screen.getByTestId('field-quickAdd')).toBeInTheDocument();
  expect(screen.getByTestId('field-layoutVariable')).toBeInTheDocument();
  expect(screen.getByTestId('attributes-list').dataset.fieldname).toBe(
    'nodeForm.fields',
  );
});
it('is disabled until a node type is selected', () => {
  renderSection({ type: null, entity: 'node', disabled: true });
  expect(screen.getByTestId('section')).toHaveAttribute(
    'data-disabled',
    'true',
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/NodeConfiguration`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** the section. Inner component renders one `<Section title="Node Configuration" summary={…} layout="horizontal">` with stacked `Row`s: quick-add `VariablePicker` (create ⇒ text), layout `VariablePicker` (create ⇒ layout — reuse `getLayoutVariablesForSubject`), an automatic-layout `Toggle` inside a redux-form `FormSection name="behaviours"` (mirror `ComposerAutomaticLayout.tsx`), a `convexHulls` `CheckboxGroup` filtered to categorical vars (mirror `ComposerConvexHulls.tsx`), and `<EditableAttributesList fieldName="nodeForm.fields" entity={entity} type={type} form={form} editFormName="node-attr-edit" handleChangeFields={handleChangeFields} />`. Default export:

```tsx
export default compose<NodeConfigurationProps, StageEditorSectionProps>(
  withSubject,
  withCreateVariableHandlers,
  withComposerFormHandlers,
  withDisabledSubjectRequired,
)(NodeConfigurationComponent);
```

(Copy the quick-add/layout/convexHull field wiring verbatim from the sections being deleted so behaviour is preserved; only the container/layout and the attributes list change.)

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/NodeConfiguration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/architect-web/src/components/sections/NodeConfiguration
git commit -m "feat(architect-web): consolidated NodeConfiguration section"
```

---

## Task 7: Architect — multi-select edge-type picker

**Files:**

- Create: `apps/architect-web/src/components/sections/EdgeConfiguration/EdgeTypeMultiSelect.tsx`
- Test: `apps/architect-web/src/components/sections/EdgeConfiguration/__tests__/EdgeTypeMultiSelect.test.tsx`

**Interfaces:**

- Consumes: the codebook edge types (via a selector like the one feeding `EntitySelectField`/`getVariableOptionsForSubject` analog for edges), `CheckboxGroup` (architect's multi-select), redux-form `change`/`formValueSelector`.
- Produces: `EdgeTypeMultiSelect` — props `{ form: string }`. Reads/writes `edges[]`: selecting an edge type adds `{ id: uuid(), subject: { entity:'edge', type }, form: undefined }`; deselecting removes that entry (preserving the `form` of still-selected types). Default export.

- [ ] **Step 1: Write failing test** — toggling an option adds/removes an `edges` entry with the right subject and a generated `id`, and re-selecting does not duplicate:

```tsx
it('adds an edges entry with a generated id when an edge type is selected', () => {
  const onChange = vi.fn();
  renderPicker({
    edgeTypes: [{ value: 'knows', label: 'Knows' }],
    value: [],
    onChange,
  });
  fireEvent.click(screen.getByLabelText('Knows'));
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ subject: { entity: 'edge', type: 'knows' } }),
  ]);
});
it('removes the entry (keeping others) when an edge type is deselected', () => {
  const onChange = vi.fn();
  renderPicker({
    edgeTypes: [
      { value: 'knows', label: 'Knows' },
      { value: 'likes', label: 'Likes' },
    ],
    value: [
      {
        id: 'a',
        subject: { entity: 'edge', type: 'knows' },
        form: { fields: [] },
      },
      { id: 'b', subject: { entity: 'edge', type: 'likes' } },
    ],
    onChange,
  });
  fireEvent.click(screen.getByLabelText('Likes'));
  expect(onChange).toHaveBeenCalledWith([
    {
      id: 'a',
      subject: { entity: 'edge', type: 'knows' },
      form: { fields: [] },
    },
  ]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/EdgeConfiguration/__tests__/EdgeTypeMultiSelect.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — a `ValidatedField name="edges"` rendering a `CheckboxGroup`-style control whose options are the codebook edge types. Map the checked set ⇄ `edges[]` via parse/format: `format(edges) => edges.map(e => e.subject.type)`; on toggle, compute the next `edges` array (add `{ id: v4(), subject: { entity: 'edge', type } }` for newly-checked, drop entries whose type was unchecked, keep existing entries — including their `form` — for still-checked types). Use the existing edge-type options selector (find the one used by `EntitySelectField` for `entityType="edge"`).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/EdgeConfiguration/__tests__/EdgeTypeMultiSelect.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/architect-web/src/components/sections/EdgeConfiguration/EdgeTypeMultiSelect.tsx apps/architect-web/src/components/sections/EdgeConfiguration/__tests__/EdgeTypeMultiSelect.test.tsx
git commit -m "feat(architect-web): multi-select edge-type picker bound to edges[]"
```

---

## Task 8: Architect — `EdgeConfiguration` section (multi-select + per-type attributes)

**Files:**

- Create: `apps/architect-web/src/components/sections/EdgeConfiguration/EdgeConfiguration.tsx`
- Test: `apps/architect-web/src/components/sections/EdgeConfiguration/__tests__/EdgeConfiguration.test.tsx`

**Interfaces:**

- Consumes: `EdgeTypeMultiSelect` (Task 7), `EditableAttributesList` (Task 5), `withComposerFormHandlers` (Task 4), `Section`, `formValueSelector` to read the live `edges` array.
- Produces: default `compose<EdgeConfigurationProps, StageEditorSectionProps>(...)`. Renders the multi-select + one `Section` block per selected edge type whose body is `EditableAttributesList` bound to `edges[<index>].form.fields` with a **distinct `editFormName` per edge type** (e.g. `edge-attr-edit-<type>`) and `entity="edge"`, `type=<edge type>`.

- [ ] **Step 1: Write failing tests** — renders the multi-select, and one attributes block per selected edge type bound to the correct indexed path:

```tsx
it('renders an attributes block per selected edge type', () => {
  renderSection({
    edges: [
      { id: 'a', subject: { entity: 'edge', type: 'knows' } },
      { id: 'b', subject: { entity: 'edge', type: 'likes' } },
    ],
  });
  const lists = screen.getAllByTestId('attributes-list');
  expect(lists.map((l) => l.dataset.fieldname)).toEqual([
    'edges[0].form.fields',
    'edges[1].form.fields',
  ]);
});
it('renders only the multi-select when no edge types are selected', () => {
  renderSection({ edges: [] });
  expect(screen.queryByTestId('attributes-list')).toBeNull();
  expect(screen.getByTestId('edge-type-multiselect')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/EdgeConfiguration/__tests__/EdgeConfiguration.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — inner component reads the live `edges` via `formValueSelector(form)(state, 'edges')`, renders `<Section title="Edge Configuration" layout="horizontal">` containing `<EdgeTypeMultiSelect form={form} />`, then `edges.map((edge, i) => <Section key={edge.id} title={`Edge Attributes — ${edgeLabel(edge.subject.type)}`} layout="horizontal"><EditableAttributesList fieldName={`edges[${i}].form.fields`} entity="edge" type={edge.subject.type} form={form} editFormName={`edge-attr-edit-${edge.subject.type}`} handleChangeFields={handleChangeFields} /></Section>)`. Resolve `edgeLabel` from the codebook (mirror `EdgePreview.tsx`'s label resolution). Default export with the standard `compose<…, StageEditorSectionProps>`.

  Note the proven 3-level redux-form nesting: parent `edit-stage` form → the EditableList inner `editFormName` (distinct per edge type) → `FieldFields`'s own nested field edits. Distinct `editFormName` per edge type prevents form-state collisions across the per-type blocks.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/sections/EdgeConfiguration/__tests__/EdgeConfiguration.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/architect-web/src/components/sections/EdgeConfiguration/EdgeConfiguration.tsx apps/architect-web/src/components/sections/EdgeConfiguration/__tests__/EdgeConfiguration.test.tsx
git commit -m "feat(architect-web): EdgeConfiguration section with per-type attribute blocks"
```

---

## Task 9: Architect — registry wiring + remove old sections

**Files:**

- Modify: `apps/architect-web/src/components/StageEditor/Interfaces.tsx` (imports + `NetworkComposer.sections`, lines 252-272)
- Delete: `sections/ComposerLayoutVariable/`, `sections/ComposerNodeForm/`, `sections/ComposerConvexHulls/`, `sections/ComposerAutomaticLayout.tsx`, `sections/ComposerEdges/`
- Modify: `StageEditor/__tests__/networkComposer.registry.test.ts`, `StageEditor/__tests__/networkComposer.roundtrip.test.ts`

**Interfaces:**

- Consumes: `NodeConfiguration` (Task 6), `EdgeConfiguration` (Task 8).
- Produces: `NetworkComposer.sections = [NodeType, NodeConfiguration, EdgeConfiguration, Background, SkipLogic, InterviewScript]`.

- [ ] **Step 1: Update the registry test** to assert the new 6-section order:

```ts
expect(getInterface('NetworkComposer').sections).toEqual([
  NodeType,
  NodeConfiguration,
  EdgeConfiguration,
  Background,
  SkipLogic,
  InterviewScript,
]);
```

(Keep the `template.behaviours.automaticLayout === false` and documentation-URL assertions.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/StageEditor/__tests__/networkComposer.registry.test.ts`
Expected: FAIL — old section list.

- [ ] **Step 3: Implement** — in `Interfaces.tsx`, replace the imports for the five deleted sections + `QuickAdd` (for NetworkComposer) with `NodeConfiguration`/`EdgeConfiguration`, and set:

```tsx
NetworkComposer: {
  sections: [NodeType, NodeConfiguration, EdgeConfiguration, Background, SkipLogic, InterviewScript],
  documentation:
    'https://documentation.networkcanvas.com/interface-documentation/network-composer/',
  template: { behaviours: { automaticLayout: false } },
},
```

Then delete the five old section files/folders. (Leave `QuickAdd` import if still used by NameGenerator interfaces — only remove it from the NetworkComposer list.)

- [ ] **Step 4: Update the roundtrip test** — change the editor-shaped fixture to the new field shape (attribute fields with `component`; `nodeForm`/`edge form` validate against `ComposerFormSchema`; empty `edges` allowed). Run both:

Run: `pnpm --filter @codaco/architect-web exec vitest run src/components/StageEditor/__tests__/networkComposer.registry.test.ts src/components/StageEditor/__tests__/networkComposer.roundtrip.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/architect-web/src/components/StageEditor/Interfaces.tsx apps/architect-web/src/components/StageEditor/__tests__/networkComposer.registry.test.ts apps/architect-web/src/components/StageEditor/__tests__/networkComposer.roundtrip.test.ts
git add -A apps/architect-web/src/components/sections   # stages the deletions
git commit -m "feat(architect-web): wire NetworkComposer to NodeConfiguration + EdgeConfiguration; remove superseded sections"
```

---

## Task 10: Stories, interface images, changeset, and final verification

**Files:**

- Modify: `packages/interview/src/interfaces/NetworkComposer/NetworkComposer.stories.tsx`, `NetworkComposer.capture.stories.tsx`
- Regenerate: `packages/interface-images/src/generated/assets/NetworkComposer.*` + `manifest.ts`
- Create: `.changeset/network-composer-editor-rework.md`

- [ ] **Step 1: Update stories** so the SyntheticInterview attribute fields pass a `component` (now emitted onto the field). Verify the stories render in the deploy-preview Storybook locally if possible; otherwise rely on the chromatic CI job. (Avoid `DatePicker` fields in synthetic stories — see [[reference-synthetic-interview-manual-node-randomisation]] sibling note about datetime warnings.)

- [ ] **Step 2: Regenerate interface images.** The committed `NetworkComposer.*.webp` predate the palette/drawer/convex-hull work and are stale regardless. Full `pnpm generate:interface-images` aborts on the pre-existing FamilyPedigree capture story, so use the one-off capture workaround (reuse `packages/interface-images/scripts/capture.mts`+`process.mts` to capture ONLY NetworkComposer), then restore any unrelated drift with `git checkout` of the other assets and hand-verify the `manifest.ts` NetworkComposer block. Do NOT run two turbo processes concurrently.

- [ ] **Step 3: Add the changeset:**

```bash
cat > .changeset/network-composer-editor-rework.md <<'EOF'
---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
---

Rework the Network Composer editor: consolidated Node Configuration section, multi-select Edge Configuration with per-edge-type attribute lists, and editable attributes whose input control is configured on the stage (rendered in the side panel) rather than the codebook variable.
EOF
```

- [ ] **Step 4: Final verification (the ONE deferred typecheck/knip pass).** Run, in order:

```bash
pnpm exec turbo run typecheck --filter=@codaco/protocol-validation --filter=@codaco/interview --filter=@codaco/protocol-utilities --filter=@codaco/architect-web --filter=@codaco/interface-images
pnpm knip
pnpm --filter @codaco/protocol-validation exec vitest run src/schemas/8
pnpm --filter @codaco/protocol-utilities exec vitest run
pnpm --filter @codaco/interview exec vitest run --project units src/interfaces/NetworkComposer src/selectors
pnpm --filter @codaco/architect-web exec vitest run src/components/sections/NodeConfiguration src/components/sections/EdgeConfiguration src/components/EditableAttributesList src/components/sections/Form src/components/StageEditor
```

Expected: all green; knip exit 0 (no unused exports — confirm the deleted sections left no dangling imports/exports). Fix any cross-package type fallout here (the schema field-shape change is the likely source).

- [ ] **Step 5: Manual / browser verification** (supersedes the old deferred ComposerEdges round-trip item) in `apps/architect-web` (`pnpm --filter @codaco/architect-web dev`):
  1. Add a Network Composer stage; confirm Node Configuration is disabled until a node type is chosen.
  2. Pick a node type; add an **editable attribute** (new variable, choose a control) → save → reopen → confirm the control persisted on the **stage** (inspect the protocol: field has `component`; the codebook variable has no `component`).
  3. Multi-select two edge types; confirm two "Edge Attributes — <Type>" blocks appear; add an attribute to each → save → reopen → confirm `edges[i].form.fields[].component` persisted.
  4. Confirm validation still works and the protocol validates (no schema errors).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(network-composer): refresh stories + interface images; add changeset"
```

---

## Self-Review notes (author)

- **Spec coverage:** §1 schema → Task 1; §2 editor structure (6 sections, gating, consolidation) → Tasks 6/8/9; §3 attributes list (lighter row, dialog add, reorder/remove, control-on-stage) → Tasks 4/5; §4 runtime + protocol-utilities → Tasks 2/3; §5 testing + images → all tasks + Task 10. Multi-select edge picker → Task 7. ✓
- **Deviation from §1:** component↔type compatibility is editor-enforced (not a field `superRefine`) — documented in Global Constraints.
- **Type consistency:** `ComposerFormField`/`ComposerForm` (Task 1) consumed by Tasks 2/3; `composerNormalizeField`/`composerItemSelector`/`withComposerFormHandlers`/`ComposerFieldPreview` (Task 4) consumed by Tasks 5/6/8; `EditableAttributesList` (Task 5) consumed by Tasks 6/8; `EdgeTypeMultiSelect` (Task 7) consumed by Task 8; `NodeConfiguration`/`EdgeConfiguration` consumed by Task 9. ✓
- **Known integration risks to watch during execution:** (a) `FieldFields`/`useFieldHandlers` reuse — verify the control selector initialises from the field's `component` value and that creating a new variable infers the type without writing `component` to the codebook; (b) the multi-select edge picker's parse/format ⇄ `edges[]` round-trip under redux-form; (c) per-edge-type distinct `editFormName` prevents 3-level nesting collisions.
