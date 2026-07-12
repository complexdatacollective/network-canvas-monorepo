import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
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
  }) => (
    <div
      data-testid="validated-field"
      data-fieldname={name}
      data-validation-keys={Object.keys(validation ?? {}).join(',')}
    >
      <Component {...componentProps} />
    </div>
  ),
}));

const renderList = () =>
  render(
    <EditableAttributesList
      fieldName="nodeForm.fields"
      entity="node"
      type="person"
      form="edit-stage"
      editFormName="node-attr-edit"
      handleChangeFields={() => undefined}
    />,
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
