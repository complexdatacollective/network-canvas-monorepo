import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';

// Task 9 fix round 1: mount-level coverage of the REAL wiring behind
// Form.tsx's `hasUnvalidatedUse` closure — the role-map subscription
// (`useSelector(getVariableRoleMap)`), the `roleMapKey` subject scoping, and
// `makeFieldEditorValidate`'s cross-class gate — none of which
// contradictions.test.ts's hand-stubbed `hasUnvalidatedUse` exercises.
// `props.initialValues` plumbing (the escape's other half) is proven
// separately and generically in DialogArrayField.test.tsx, since that
// mechanism lives entirely in DialogArrayField/DialogEditor, shared
// unchanged by every mount.
//
// The array editor itself is stubbed so the real `editorValidate` prop can be
// captured and invoked directly — the same capture-a-handler-prop idiom used
// throughout this project's Task 9 tests (CategoricalBinPrompts,
// SociogramPrompts, etc.).
let capturedEditorValidate:
  | ((
      values: Record<string, unknown>,
      props?: { editIndex?: number; initialValues?: unknown },
    ) => Record<string, unknown>)
  | undefined;
// The picker's sibling list travels the other way, as `editorProps`. Both are
// captured so a test can prove the gate and the picker read the same rows.
let capturedEditorProps: Record<string, unknown> | undefined;
vi.mock('~/components/Form/arrayFields/DialogArrayField', () => ({
  default: ({
    editorValidate,
    editorProps,
  }: {
    editorValidate: (
      values: Record<string, unknown>,
      props?: { editIndex?: number; initialValues?: unknown },
    ) => Record<string, unknown>;
    editorProps?: Record<string, unknown>;
  }) => {
    capturedEditorValidate = editorValidate;
    capturedEditorProps = editorProps;
    return <div data-testid="dialog-array-field" />;
  },
}));

// Only `editorValidate` is under test; the row editor is a full
// variable/control/validation form whose module graph is irrelevant here.
vi.mock('../FieldFields', () => ({ default: () => null }));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import {
  type StageFormContextValue,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

import Form from '../Form';

let stageFormContext: StageFormContextValue | null = null;
const Probe = () => {
  stageFormContext = useStageFormContext();
  return null;
};

/**
 * Rewrites `form.fields` the way the array editor does when the researcher
 * adds or removes a row: the stage form holds it immediately, the saved stage
 * does not carry it until the editor is saved.
 */
const setFormFields = (fields: Record<string, unknown>[]) => {
  if (!stageFormContext) throw new Error('stage form context was not captured');
  const { storeApi } = stageFormContext;
  act(() => {
    storeApi.getState().setFieldValue('form.fields', fields);
  });
};

/** The `editorValidate` as it stands now, not as it stood at mount. */
const currentEditorValidate = () => {
  if (!capturedEditorValidate) {
    throw new Error('editorValidate was not captured');
  }
  return capturedEditorValidate;
};

const currentSiblingFields = () => capturedEditorProps?.siblingFields;

// `cat` is written both by an AlterForm field (validated, stage s1 — this
// stage's OWN field, standing in for the field this dialog is editing) and
// by a CategoricalBin prompt (unvalidated, stage s2), on the `person` node
// type — the same fixture shape pickerExclusions.test.ts/roleMap.test.ts use.
// `place`'s OWN `cat` variable shares the literal id but has zero hits
// anywhere, so it proves roleMapKey scopes by subject, not just variable id.
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          cat: {
            name: 'Cat',
            type: 'categorical',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
          },
          a: {
            name: 'A',
            type: 'datetime',
            component: 'DatePicker',
            validation: {},
          },
          b: {
            name: 'B',
            type: 'datetime',
            component: 'DatePicker',
            validation: {},
          },
          boolA: {
            name: 'Boolean A',
            type: 'boolean',
            component: 'Boolean',
            options: [{ label: 'Yes', value: true }],
            validation: {},
          },
          boolB: {
            name: 'Boolean B',
            type: 'boolean',
            component: 'Boolean',
            options: [{ label: 'Yes', value: true }],
            validation: {},
          },
          draftOnly: {
            name: 'Draft only',
            type: 'boolean',
            component: 'Toggle',
            validation: {},
          },
        },
      },
      place: {
        name: 'Place',
        color: 'c',
        variables: {
          cat: {
            name: 'Cat',
            type: 'categorical',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
          },
        },
      },
    },
  },
  stages: [
    {
      id: 's1',
      type: 'AlterForm',
      label: 'F',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [] },
    },
    {
      id: 's2',
      type: 'CategoricalBin',
      label: 'B',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'cat' }],
    },
    {
      id: 's3',
      type: 'NetworkComposer',
      label: 'Composer',
      subject: { entity: 'node', type: 'person' },
      nodeForm: {
        fields: [
          {
            variable: 'a',
            component: 'DatePicker',
            parameters: { type: 'year' },
          },
          {
            variable: 'b',
            component: 'DatePicker',
            parameters: { type: 'year' },
          },
        ],
      },
      edges: [],
    },
  ],
};

const renderForm = (
  subject: {
    entity: string;
    type: string;
  },
  currentStageIndex = 0,
): ((
  values: Record<string, unknown>,
  props?: { editIndex?: number; initialValues?: unknown },
) => Record<string, unknown>) => {
  capturedEditorValidate = undefined;
  capturedEditorProps = undefined;
  stageFormContext = null;
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: PROTOCOL_WITH_FORM_CONFLICT }) =>
        state,
      stageEditorDraft,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

  // `subject`, this stage's own form fields and its unsaved prompt drafts are
  // stage-form reads now, seeded from the committed stage the editor opened on.
  const committedStage = {
    id: 's1',
    type: 'AlterForm',
    subject,
    form: { fields: [{ variable: 'boolA' }, { variable: 'boolB' }] },
    prompts: [
      { additionalAttributes: [{ variable: 'draftOnly', value: true }] },
    ],
  } as unknown as Stage;

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={committedStage}
          stageId="s1"
          formId="edit-stage"
        >
          <Probe />
          <Form
            stagePath={`stages[${currentStageIndex}]`}
            stagePosition={currentStageIndex}
            interfaceType="AlterForm"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  expect(screen.getByTestId('dialog-array-field')).toBeInTheDocument();
  if (!capturedEditorValidate) {
    throw new Error('editorValidate was not captured');
  }
  return capturedEditorValidate;
};

describe('Form.tsx cross-class gate (real role-map wiring)', () => {
  it('rejects a pick a bin elsewhere already writes, using the REAL role map for the mount’s subject', () => {
    const editorValidate = renderForm({ entity: 'node', type: 'person' });
    const errors = editorValidate({ variable: 'cat', validation: {} });
    expect(errors.variable).toBe(
      '"Cat" is written without validation by another stage, so it cannot be used as a form field',
    );
  });

  it('allows moving a variable from this stage attribute writer into its form', () => {
    const editorValidate = renderForm({ entity: 'node', type: 'person' }, 1);
    const errors = editorValidate({ variable: 'cat', validation: {} });

    expect(errors).toEqual({});
  });

  it('escapes when the pick equals the field’s original committed variable', () => {
    const editorValidate = renderForm({ entity: 'node', type: 'person' });
    const errors = editorValidate(
      { variable: 'cat', validation: {} },
      { initialValues: { variable: 'cat' } },
    );
    expect(errors).toEqual({});
  });

  // roleMapKey subject scoping: `place`'s own `cat` shares the literal id
  // with `person`'s conflicted `cat`, but has no hits of its own — proving
  // the gate scopes by {entity, type}, not by variable id alone.
  it('does not fire for a same-named variable on an unconflicted subject', () => {
    const editorValidate = renderForm({ entity: 'node', type: 'place' });
    const errors = editorValidate({ variable: 'cat', validation: {} });
    expect(errors).toEqual({});
  });

  it('checks codebook edits against a composer view with stage rendering taking precedence', () => {
    const editorValidate = renderForm({ entity: 'node', type: 'person' });
    const errors = editorValidate({
      variable: 'a',
      validation: { sameAs: 'b' },
      component: 'DatePicker',
      parameters: {},
    });

    expect(errors).toEqual({});
  });

  // One form may not collect a variable twice: every field renders under its
  // variable's name, so two fields share one value while each still supplies
  // its own control and rules.
  it('rejects a new field that repeats a variable this form already collects', () => {
    const editorValidate = renderForm({ entity: 'node', type: 'person' });
    const errors = editorValidate({ variable: 'boolA', validation: {} });
    expect(errors.variable).toBe(
      'This variable is already collected by another field in this form. Choose a different variable, or edit the existing field instead.',
    );
  });

  it('lets the row being edited keep its own variable', () => {
    const editorValidate = renderForm({ entity: 'node', type: 'person' });
    const errors = editorValidate(
      { variable: 'boolA', validation: {} },
      { editIndex: 0 },
    );
    expect(errors.variable).toBeUndefined();
  });

  // The rows to check against are the ones in the OPEN editor, not the ones on
  // the saved stage. A field added in this session is not on the saved stage
  // yet, so a committed sibling list would let its variable be picked a second
  // time — and would not hide it in the picker either — leaving a stage the
  // schema refuses on save.
  it('rejects a variable a field added in this editing session already collects', () => {
    renderForm({ entity: 'node', type: 'person' });

    setFormFields([
      { variable: 'boolA' },
      { variable: 'boolB' },
      { variable: 'draftOnly' },
    ]);

    expect(
      currentEditorValidate()({ variable: 'draftOnly', validation: {} })
        .variable,
    ).toBe(
      'This variable is already collected by another field in this form. Choose a different variable, or edit the existing field instead.',
    );
    expect(currentSiblingFields()).toEqual([
      { variable: 'boolA' },
      { variable: 'boolB' },
      { variable: 'draftOnly' },
    ]);
  });

  it('stops rejecting a variable whose field was removed in this editing session', () => {
    renderForm({ entity: 'node', type: 'person' });

    setFormFields([{ variable: 'boolB' }]);

    expect(
      currentEditorValidate()({ variable: 'boolA', validation: {} }).variable,
    ).toBeUndefined();
    expect(currentSiblingFields()).toEqual([{ variable: 'boolB' }]);
  });

  it('checks the current shared form as a stage-effective view', () => {
    const editorValidate = renderForm({ entity: 'node', type: 'person' });
    // `editIndex` identifies the committed row being edited — boolA's own —
    // so the duplicate-variable gate excludes it, exactly as
    // `DialogArrayField` supplies it when a row's dialog is opened.
    const errors = editorValidate(
      {
        variable: 'boolA',
        validation: { differentFrom: 'boolB' },
        component: 'Boolean',
        options: [{ label: 'Yes', value: true }],
      },
      { editIndex: 0 },
    );

    expect(errors.validation).toContain('must differ');
  });

  it('rejects a field variable written by an unsaved prompt draft', () => {
    const editorValidate = renderForm({ entity: 'node', type: 'person' });
    const errors = editorValidate({
      variable: 'draftOnly',
      validation: {},
      component: 'Toggle',
    });

    expect(errors.variable).toBe(
      '"Draft only" is assigned without validation by a prompt in this stage, so it cannot be used as a form field',
    );
  });

  it('keeps the unchanged-pick escape for a pre-existing draft conflict', () => {
    const editorValidate = renderForm({ entity: 'node', type: 'person' });
    expect(
      editorValidate(
        {
          variable: 'draftOnly',
          validation: {},
          component: 'Toggle',
        },
        { initialValues: { variable: 'draftOnly' } },
      ),
    ).toEqual({});
  });
});
