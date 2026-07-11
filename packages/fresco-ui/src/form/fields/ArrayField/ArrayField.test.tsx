import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '../../../dialogs/DialogProvider';
import ArrayField, {
  ArrayFieldDragHandle,
  type ArrayFieldEditorProps,
  type ArrayFieldProps,
  type ArrayFieldItemProps,
} from './ArrayField';

type Item = {
  id?: string;
  label: string;
};

function TestItem({
  item,
  index,
  itemCount,
  isSortable,
  dragControls,
  onMove,
  onChange,
  onCancel,
  onDelete,
  onEdit,
  disabled,
}: ArrayFieldItemProps<Item>) {
  return (
    <div data-testid={`item-${item.label}`} data-internal-id={item._internalId}>
      {isSortable && (
        <ArrayFieldDragHandle
          dragControls={dragControls}
          index={index}
          itemCount={itemCount}
          onMove={onMove}
          disabled={disabled}
        />
      )}
      <span>{item.label}</span>
      <button
        type="button"
        onClick={() => onChange({ id: item.id, label: item.label ?? 'new' })}
      >
        Save
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" onClick={onEdit}>
        Edit
      </button>
      <button type="button" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

function TestEditor({
  item,
  index,
  isNewItem,
  onSave,
  onCancel,
}: ArrayFieldEditorProps<Item>) {
  if (!item) return null;

  return (
    <dialog open data-index={index}>
      <span>{isNewItem ? 'New editor' : 'Existing editor'}</span>
      <button
        type="button"
        onClick={() => onSave({ id: item.id, label: item.label })}
      >
        Save editor
      </button>
      <button type="button" onClick={onCancel}>
        Cancel editor
      </button>
    </dialog>
  );
}

const renderField = (props: Partial<ArrayFieldProps<Item>> = {}) =>
  render(
    <DialogProvider>
      <ArrayField<Item>
        value={[]}
        onChange={() => undefined}
        itemTemplate={() => ({ label: 'new' })}
        itemComponent={TestItem}
        confirmDelete={false}
        {...props}
      />
    </DialogProvider>,
  );

describe('ArrayField', () => {
  it('keeps draft additions out of onChange until they are saved', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({ onChange });

    await user.click(screen.getByRole('button', { name: 'Add Item' }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalledWith([{ label: 'new' }]);
  });

  it('emits an insert descriptor instead of a whole-value change when requested', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onOperation = vi.fn();
    renderField({ onChange, onOperation });

    await user.click(screen.getByRole('button', { name: 'Add Item' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onOperation).toHaveBeenCalledWith({
      type: 'insert',
      index: 0,
      item: { label: 'new' },
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Added item at position 1 of 1.',
    );
  });

  it('emits replace and remove descriptors with confirmed array indices', async () => {
    const user = userEvent.setup();
    const onOperation = vi.fn();
    renderField({
      value: [
        { id: 'one', label: 'one' },
        { id: 'two', label: 'two' },
      ],
      getId: (item) => item.id,
      onOperation,
    });

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]!);
    await user.click(screen.getAllByRole('button', { name: 'Save' })[1]!);
    expect(onOperation).toHaveBeenLastCalledWith({
      type: 'replace',
      index: 1,
      item: { id: 'two', label: 'two' },
    });

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    expect(onOperation).toHaveBeenLastCalledWith({
      type: 'remove',
      index: 0,
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Removed item 1. 1 items remaining.',
    );
  });

  it('removes a cancelled draft without changing the external value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({ onChange });

    await user.click(screen.getByRole('button', { name: 'Add Item' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('item-new')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('strips internal tracking properties from emitted values', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({
      value: [{ label: 'existing' }],
      onChange,
    });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onChange).toHaveBeenCalledWith([{ label: 'existing' }]);
  });

  it('deletes an item without serializing internal tracking properties', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({
      value: [
        { id: 'one', label: 'one' },
        { id: 'two', label: 'two' },
      ],
      getId: (item) => item.id,
      onChange,
    });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]!);

    expect(onChange).toHaveBeenCalledWith([{ id: 'two', label: 'two' }]);
  });

  it('passes the current item index to an external editor', async () => {
    const user = userEvent.setup();
    renderField({
      value: [
        { id: 'one', label: 'one' },
        { id: 'two', label: 'two' },
      ],
      getId: (item) => item.id,
      editorComponent: TestEditor,
    });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[1]!);

    expect(screen.getByRole('dialog')).toHaveAttribute('data-index', '1');
    expect(screen.getByText('Existing editor')).toBeInTheDocument();
  });

  it('preserves an internal ID when a controlled item is replaced immutably', async () => {
    const value = [{ label: 'before' }];
    const { rerender } = render(
      <DialogProvider>
        <ArrayField<Item>
          value={value}
          onChange={() => undefined}
          itemTemplate={() => ({ label: 'new' })}
          itemComponent={TestItem}
          confirmDelete={false}
        />
      </DialogProvider>,
    );
    const originalId = screen.getByTestId('item-before').dataset.internalId;

    rerender(
      <DialogProvider>
        <ArrayField<Item>
          value={[{ label: 'after' }]}
          onChange={() => undefined}
          itemTemplate={() => ({ label: 'new' })}
          itemComponent={TestItem}
          confirmDelete={false}
        />
      </DialogProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('item-after').dataset.internalId).toBe(
        originalId,
      );
    });
  });

  it('reorders with arrow keys and clamps movement to the list bounds', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({
      sortable: true,
      value: [
        { id: 'one', label: 'one' },
        { id: 'two', label: 'two' },
      ],
      getId: (item) => item.id,
      onChange,
    });

    const secondHandle = screen.getByRole('button', {
      name: 'Reorder item 2 of 2',
    });
    await user.click(secondHandle);
    fireEvent.keyDown(secondHandle, { key: 'ArrowUp' });

    expect(onChange).toHaveBeenCalledWith([
      { id: 'two', label: 'two' },
      { id: 'one', label: 'one' },
    ]);

    fireEvent.keyDown(secondHandle, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('commits one move descriptor for one keyboard reorder', () => {
    const onOperation = vi.fn();
    renderField({
      sortable: true,
      value: [
        { id: 'one', label: 'one' },
        { id: 'two', label: 'two' },
      ],
      getId: (item) => item.id,
      onOperation,
    });

    const secondHandle = screen.getByRole('button', {
      name: 'Reorder item 2 of 2',
    });
    fireEvent.keyDown(secondHandle, { key: 'ArrowUp' });

    expect(onOperation).toHaveBeenCalledOnce();
    expect(onOperation).toHaveBeenCalledWith({
      type: 'move',
      from: 1,
      to: 0,
    });
  });

  it('hides the add action at maxItems', () => {
    renderField({
      value: [{ label: 'only' }],
      maxItems: 1,
    });

    expect(
      screen.queryByRole('button', { name: 'Add Item' }),
    ).not.toBeInTheDocument();
  });

  it('blocks add, edit, delete, and reorder while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({
      disabled: true,
      sortable: true,
      value: [{ id: 'one', label: 'one' }],
      getId: (item) => item.id,
      onChange,
    });

    expect(screen.getByRole('button', { name: 'Add Item' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      screen.queryByRole('button', { name: 'Reorder item 1 of 1' }),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds immediately without draft state when immediateAdd is enabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function ControlledField() {
      const [value, setValue] = useState<Item[]>([]);
      return (
        <ArrayField<Item>
          value={value}
          onChange={(nextValue) => {
            setValue(nextValue ?? []);
            onChange(nextValue);
          }}
          immediateAdd
          itemTemplate={() => ({ label: 'immediate' })}
          itemComponent={TestItem}
          confirmDelete={false}
        />
      );
    }

    render(
      <DialogProvider>
        <ControlledField />
      </DialogProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Add Item' }));

    expect(onChange).toHaveBeenCalledWith([{ label: 'immediate' }]);
  });
});
