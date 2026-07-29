import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

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
// Bypasses redux-form's real FieldArray (which needs a reduxForm()-wrapped
// ancestor Form.tsx does not provide on its own) and captures the real
// `editorValidate` componentProp for direct invocation — the same
// capture-a-handler-prop idiom used throughout this project's Task 9 tests
// (CategoricalBinPrompts, SociogramPrompts, etc.).
vi.mock('~/components/Form/ValidatedFieldArray', () => ({
  default: ({
    component,
    componentProps,
  }: {
    component: ComponentType<Record<string, unknown>>;
    componentProps?: Record<string, unknown>;
  }) => createElement(component, componentProps),
}));

let capturedEditorValidate:
  | ((
      values: Record<string, unknown>,
      props?: { initialValues?: unknown },
    ) => Record<string, unknown>)
  | undefined;
vi.mock('~/components/Form/DialogArrayField', () => ({
  default: ({
    editorValidate,
  }: {
    editorValidate: (
      values: Record<string, unknown>,
      props?: { initialValues?: unknown },
    ) => Record<string, unknown>;
  }) => {
    capturedEditorValidate = editorValidate;
    return <div data-testid="dialog-array-field" />;
  },
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import Form from '../Form';

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

const renderForm = (subject: {
  entity: string;
  type: string;
}): ((
  values: Record<string, unknown>,
  props?: { initialValues?: unknown },
) => Record<string, unknown>) => {
  capturedEditorValidate = undefined;
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: PROTOCOL_WITH_FORM_CONFLICT }) =>
        state,
      form: (
        state = {
          'edit-stage': {
            values: {
              subject,
              form: {
                fields: [{ variable: 'boolA' }, { variable: 'boolB' }],
              },
              prompts: [
                {
                  additionalAttributes: [
                    { variable: 'draftOnly', value: true },
                  ],
                },
              ],
            },
          },
        },
      ) => state,
    },
  });
  render(
    <Provider store={store}>
      <Form
        form="edit-stage"
        stagePath="stages[0]"
        stagePosition={0}
        interfaceType="AlterForm"
      />
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

  it('checks the current shared form as a stage-effective view', () => {
    const editorValidate = renderForm({ entity: 'node', type: 'person' });
    const errors = editorValidate({
      variable: 'boolA',
      validation: { differentFrom: 'boolB' },
      component: 'Boolean',
      options: [{ label: 'Yes', value: true }],
    });

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
