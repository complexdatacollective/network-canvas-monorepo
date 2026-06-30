import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import EditableAttributesList from '../EditableAttributesList';

vi.mock('~/components/EditableList', () => ({
  formName: 'editable-list-form',
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
      handleChangeFields={() => undefined}
    />,
  );
  const list = screen.getByTestId('editable-list');
  expect(list.dataset.fieldname).toBe('nodeForm.fields');
  expect(list.dataset.editform).toBe('node-attr-edit');
});
