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
vi.mock('~/selectors/codebook', () => ({
  getVariablesForSubjectSelector: () => ({
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
  }),
}));

const store = configureStore({ reducer: () => ({}) });

const renderList = () =>
  render(
    <Provider store={store}>
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
