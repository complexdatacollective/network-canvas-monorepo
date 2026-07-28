import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

// Task 9 fix round 1: mount-level coverage of the REAL wiring behind
// EditableAttributesList.tsx's `hasUnvalidatedUse` closure — the role-map
// subscription (`useSelector(getVariableRoleMap)`), the `roleMapKey` subject
// scoping, and the DISTINCT wiring shape this mount uses versus Form.tsx/
// NodeConfiguration.tsx: its own local `editorValidate` WRAPS
// `makeFieldEditorValidate`'s call (forwarding `props` through it) and
// destructures `{validation, ...rest}` so a `validation`-keyed contradiction
// re-keys onto COMPOSER_CONTRADICTION_FIELD, while any OTHER key (including
// this gate's `variable`) passes through via `rest` untouched. None of this
// is exercised by EditableAttributesList.test.tsx/.behaviour.test.tsx, which
// deliberately neutralize the role map (`getVariableRoleMap: () => ({})`) to
// isolate their own (pre-existing) contradiction-only coverage.
// `props.initialValues` plumbing (the escape's other half) is proven
// separately and generically in Form/__tests__/DialogArrayField.test.tsx.
//
// Bypasses redux-form's real FieldArray (which needs a reduxForm()-wrapped
// ancestor this mount does not provide on its own) and captures the real
// `editorValidate` componentProp for direct invocation — the same
// capture-a-handler-prop idiom used throughout this project's Task 9 tests.
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
      props?: { editIndex?: number; initialValues?: unknown },
    ) => Record<string, unknown>)
  | undefined;
vi.mock('~/components/Form/DialogArrayField', () => ({
  default: ({
    editorValidate,
  }: {
    editorValidate: (
      values: Record<string, unknown>,
      props?: { editIndex?: number; initialValues?: unknown },
    ) => Record<string, unknown>;
  }) => {
    capturedEditorValidate = editorValidate;
    return <div data-testid="dialog-array-field" />;
  },
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import EditableAttributesList from '../EditableAttributesList';

// `cat` is written both by an AlterForm field (validated, stage s1) and by a
// CategoricalBin prompt (unvalidated, stage s2), on the `person` node type —
// the same fixture shape pickerExclusions.test.ts/roleMap.test.ts use.
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
          // No stage references this at all — isolates the mirror-check
          // tests below from the role-map-based conflict `cat` carries.
          label: { name: 'Label', type: 'text' },
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
      form: { fields: [{ variable: 'cat', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'CategoricalBin',
      label: 'B',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'cat' }],
    },
  ],
};

const renderList = (
  siblingUnvalidatedVariableIds?: string[],
): ((
  values: Record<string, unknown>,
  props?: { editIndex?: number; initialValues?: unknown },
) => Record<string, unknown>) => {
  capturedEditorValidate = undefined;
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: PROTOCOL_WITH_FORM_CONFLICT }) =>
        state,
    },
  });
  render(
    <Provider store={store}>
      <EditableAttributesList
        fieldName="nodeForm.fields"
        entity="node"
        type="person"
        form="edit-stage"
        editFormName="node-attr-edit"
        handleChangeFields={() => undefined}
        siblingUnvalidatedVariableIds={siblingUnvalidatedVariableIds}
      />
    </Provider>,
  );
  expect(screen.getByTestId('dialog-array-field')).toBeInTheDocument();
  if (!capturedEditorValidate) {
    throw new Error('editorValidate was not captured');
  }
  return capturedEditorValidate;
};

describe('EditableAttributesList cross-class gate (real role-map wiring)', () => {
  it('rejects a pick a bin elsewhere already writes, using the REAL role map for the mount’s subject', () => {
    const editorValidate = renderList();
    const errors = editorValidate({
      variable: 'cat',
      validation: {},
      component: 'CheckboxGroup',
    });
    // Passes through the wrapper's `{validation, ...rest}` destructure
    // untouched (no `validation` key here, so no re-keying onto
    // COMPOSER_CONTRADICTION_FIELD) — proving the gate's `variable` key
    // survives this mount's distinct wrapping shape.
    expect(errors).toEqual({
      variable:
        '"Cat" is written without validation by another stage, so it cannot be used as a form field',
    });
  });

  it('escapes when the pick equals the field’s original committed variable', () => {
    const editorValidate = renderList();
    const errors = editorValidate(
      { variable: 'cat', validation: {}, component: 'CheckboxGroup' },
      { initialValues: { variable: 'cat', component: 'CheckboxGroup' } },
    );
    expect(errors).toEqual({});
  });

  // Mirror check (Task 9 fix round 1, controller-approved gap closure): the
  // NetworkComposer nodeForm.fields editor rejects a variable this stage's
  // OWN quickAdd/convexHullVariable already picks in the SAME live draft,
  // via the `siblingUnvalidatedVariableIds` prop NodeConfiguration.tsx (the
  // composer's) threads through — folded into hasUnvalidatedUse alongside
  // the role-map check.
  describe('mirror check: this stage’s own quickAdd/convexHullVariable draft picks', () => {
    it('rejects a pick this draft’s quickAdd/convexHullVariable already claims, with no saved-doc conflict', () => {
      const editorValidate = renderList(['label']);
      const errors = editorValidate({
        variable: 'label',
        validation: {},
        component: 'Text',
      });
      expect(errors).toEqual({
        variable:
          '"Label" is written without validation by another stage, so it cannot be used as a form field',
      });
    });

    it('allows the same pick when no sibling unvalidated writer claims it', () => {
      const editorValidate = renderList();
      const errors = editorValidate({
        variable: 'label',
        validation: {},
        component: 'Text',
      });
      expect(errors).toEqual({});
    });

    // Controller-requested consistency check: this row-level escape already
    // implements the same rule the composer-level gate's check (b) escape
    // implements — a pre-existing committed pair must never block a re-save
    // that changes neither side of it. `siblingUnvalidatedVariableIds`
    // reflects quickAdd/convexHullVariable's CURRENT draft pick, which for an
    // untouched sibling field equals its own committed value — so an
    // unchanged row (via the existing `props.initialValues` escape) already
    // never blocks on a pair that was this way at commit time.
    it('does not block re-saving this row when quickAdd/convexHullVariable’s committed pick already matches it, unchanged on both sides', () => {
      // Both this row and the sibling writer are "unchanged": the row's own
      // pre-edit value and quickAdd's current (also-unchanged) draft pick are
      // the SAME already-committed pair, exactly as NodeConfiguration.
      // crossClassGate.test.tsx's saved-document escape cases construct it.
      const editorValidate = renderList(['label']);
      const errors = editorValidate(
        { variable: 'label', validation: {}, component: 'Text' },
        { initialValues: { variable: 'label', component: 'Text' } },
      );
      expect(errors).toEqual({});
    });

    it('still blocks a NEW pair this row’s own edit introduces, even if a sibling committed pick is otherwise unrelated', () => {
      // The row is being reassigned from a different variable ('other') to
      // 'label', which quickAdd's CURRENT pick already claims — this row's
      // own change is what creates the pair, so it blocks regardless of
      // whether quickAdd itself changed.
      const editorValidate = renderList(['label']);
      const errors = editorValidate(
        { variable: 'label', validation: {}, component: 'Text' },
        { initialValues: { variable: 'other', component: 'Text' } },
      );
      expect(errors).toEqual({
        variable:
          '"Label" is written without validation by another stage, so it cannot be used as a form field',
      });
    });
  });
});
