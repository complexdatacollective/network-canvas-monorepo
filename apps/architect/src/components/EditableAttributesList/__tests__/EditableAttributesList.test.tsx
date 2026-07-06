import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import EditableAttributesList from '../EditableAttributesList';

vi.mock('~/components/EditableList', () => ({
  formName: 'editable-list-form',
  default: (props: {
    fieldName?: string;
    editFormName?: string;
    validation?: Record<string, unknown>;
  }) => (
    <div
      data-testid="editable-list"
      data-fieldname={props.fieldName}
      data-editform={props.editFormName}
      data-validation-keys={Object.keys(props.validation ?? {}).join(',')}
    />
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

it('binds the EditableList to the given fieldName + editFormName', () => {
  renderList();
  const list = screen.getByTestId('editable-list');
  expect(list.dataset.fieldname).toBe('nodeForm.fields');
  expect(list.dataset.editform).toBe('node-attr-edit');
});

it('allows an empty list (no "at least one item" validation)', () => {
  renderList();
  // Empty validation means EditableList's default notEmpty is overridden, so
  // a stage with no editable attributes is valid.
  expect(screen.getByTestId('editable-list').dataset.validationKeys).toBe('');
});
