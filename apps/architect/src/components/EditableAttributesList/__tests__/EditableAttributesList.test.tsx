import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import { expect, it, vi } from 'vitest';

import EditableAttributesList from '../EditableAttributesList';

vi.mock('~/components/Form/DialogArrayField', () => ({
  default: ({ requestedEditFormName }: { requestedEditFormName?: string }) => (
    <div
      data-testid="dialog-array-field"
      data-editform={requestedEditFormName}
    />
  ),
}));

let capturedEditorValidate:
  | ((values: Record<string, unknown>) => Record<string, unknown>)
  | undefined;

vi.mock('~/components/Form/ValidatedFieldArray', () => ({
  default: ({
    name,
    component: Component,
    componentProps,
    validation,
  }: {
    name: string;
    component: ComponentType<Record<string, unknown>>;
    componentProps?: Record<string, unknown>;
    validation?: Record<string, unknown>;
  }) => {
    capturedEditorValidate = componentProps?.editorValidate as
      | typeof capturedEditorValidate
      | undefined;
    return (
      <div
        data-testid="validated-field"
        data-fieldname={name}
        data-validation-keys={Object.keys(validation ?? {}).join(',')}
      >
        <Component {...componentProps} />
      </div>
    );
  },
}));

// Standing in for the codebook: one categorical variable whose committed
// `minSelected: 3` would contradict a draft that shrinks its options below 3.
// Memoized on the `subject` object's own identity (a self-contained stand-in
// for getVariablesForSubjectSelector's real reselect memoization) so the
// referential-stability test below can exercise Finding 1's actual contract:
// a fresh subject reference per call (the bug) produces a fresh result, while
// a stable subject reference (the fix, via EditableAttributesList's useMemo)
// hits the cache and returns the same result.
vi.mock('~/selectors/codebook', () => {
  const cache = new WeakMap<object, Record<string, unknown>>();
  return {
    getVariablesForSubjectSelector: (_state: unknown, subject: object) => {
      if (!cache.has(subject)) {
        cache.set(subject, {
          colors: {
            name: 'colors',
            type: 'categorical',
            options: [
              { label: 'Red', value: 'red' },
              { label: 'Blue', value: 'blue' },
              { label: 'Green', value: 'green' },
            ],
            validation: { minSelected: 3 },
          },
          // Both full-resolution DatePickers in the codebook, joined by
          // sameAs — used by the sibling-composer-field-overlay test below
          // (PR #1107 Finding 4).
          a: {
            name: 'a',
            type: 'datetime',
            component: 'DatePicker',
            validation: { sameAs: 'b' },
          },
          b: {
            name: 'b',
            type: 'datetime',
            component: 'DatePicker',
            validation: {},
          },
        });
      }
      return cache.get(subject);
    },
  };
});

const store = configureStore({ reducer: () => ({}) });

const listTree = () => (
  <Provider store={store}>
    <EditableAttributesList
      fieldName="nodeForm.fields"
      entity="node"
      type="person"
      form="edit-stage"
      editFormName="node-attr-edit"
      handleChangeFields={() => undefined}
    />
  </Provider>
);

const renderList = () => render(listTree());

it('binds the dialog array field to the given fieldName + editFormName', () => {
  renderList();
  expect(screen.getByTestId('validated-field').dataset.fieldname).toBe(
    'nodeForm.fields',
  );
  expect(screen.getByTestId('dialog-array-field').dataset.editform).toBe(
    'node-attr-edit',
  );
});

it('allows an empty list (no "at least one item" validation)', () => {
  renderList();
  expect(screen.getByTestId('validated-field').dataset.validationKeys).toBe('');
});

it('wires editorValidate from the entity/type variables so a contradictory draft is rejected', () => {
  renderList();

  expect(capturedEditorValidate).toBeInstanceOf(Function);
  const errors = capturedEditorValidate?.({
    variable: 'colors',
    validation: { minSelected: 3 },
    options: [
      { label: 'Red', value: 'red' },
      { label: 'Blue', value: 'blue' },
    ],
  });
  expect(errors?.validation).toContain('minSelected');

  const coherent = capturedEditorValidate?.({
    variable: 'colors',
    validation: { minSelected: 3 },
    options: [
      { label: 'Red', value: 'red' },
      { label: 'Blue', value: 'blue' },
      { label: 'Green', value: 'green' },
    ],
  });
  expect(coherent).toEqual({});
});

// PR #1107 Finding 1: an unmemoized `{ entity, type }` subject object,
// rebuilt on every render, defeats getVariablesForSubjectSelector's
// memoization and so invalidates the makeFieldEditorValidate useMemo below
// it on every re-render — even when entity/type haven't changed. The fix
// memoizes the subject on [entity, type].
it('keeps editorValidate referentially stable across a re-render with unchanged entity/type', () => {
  const { rerender } = renderList();
  const firstEditorValidate = capturedEditorValidate;
  expect(firstEditorValidate).toBeInstanceOf(Function);

  rerender(listTree());

  expect(capturedEditorValidate).toBe(firstEditorValidate);
});

// PR #1107 Finding 4: `a`/`b` are both full-resolution DatePickers in the
// codebook, but this stage's OTHER committed composer field renders `a` as a
// year picker — an override that lives on the field itself (see
// network-composer.ts's ComposerFormFieldSchema), not the codebook variable.
// editorValidate must see that stage-level override, not just the codebook
// definition, when checking a fresh draft for `a`'s sameAs partner `b`.
it('folds a sibling composer field component/parameters override into editorValidate', () => {
  const storeWithSibling = configureStore({
    reducer: () => ({
      form: {
        'edit-stage': {
          values: {
            nodeForm: {
              fields: [
                {
                  variable: 'a',
                  component: 'DatePicker',
                  parameters: { type: 'year' },
                },
              ],
            },
          },
        },
      },
    }),
  });

  render(
    <Provider store={storeWithSibling}>
      <EditableAttributesList
        fieldName="nodeForm.fields"
        entity="node"
        type="person"
        form="edit-stage"
        editFormName="node-attr-edit"
        handleChangeFields={() => undefined}
      />
    </Provider>,
  );

  expect(capturedEditorValidate).toBeInstanceOf(Function);

  // Matches the sibling's stage-level rendering (year): accepted, even
  // though it mismatches the codebook's own full resolution.
  expect(
    capturedEditorValidate?.({
      variable: 'b',
      validation: {},
      component: 'DatePicker',
      parameters: { type: 'year' },
    }),
  ).toEqual({});

  // Stays at the codebook's own full resolution: now mismatches the
  // sibling's stage-level rendering.
  const mismatched = capturedEditorValidate?.({
    variable: 'b',
    validation: {},
    component: 'DatePicker',
    parameters: {},
  });
  expect(mismatched?.validation).toContain('different resolutions');
});
