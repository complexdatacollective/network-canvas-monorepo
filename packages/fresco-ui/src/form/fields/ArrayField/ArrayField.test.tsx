import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '../../../dialogs/DialogProvider';
import Surface from '../../../layout/Surface';
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
        onClick={() => onChange?.({ id: item.id, label: item.label ?? 'new' })}
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

function NestedSurfaceItem() {
  return (
    <Surface noContainer data-testid="nested-surface">
      Nested surface
    </Surface>
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
        onClick={() => onSave?.({ id: item.id, label: item.label })}
      >
        Save editor
      </button>
      <button type="button" onClick={onCancel}>
        Cancel editor
      </button>
    </dialog>
  );
}

/** An item whose edit control is registered as the row's focus-return target. */
function TriggerItem({
  item,
  onEdit,
  editTriggerRef,
}: ArrayFieldItemProps<Item>) {
  return (
    <div data-testid={`item-${item.label}`}>
      <button type="button" ref={editTriggerRef} onClick={onEdit}>
        Edit {item.label}
      </button>
    </div>
  );
}

/**
 * An external editor that returns focus the way a modal one does: it resolves
 * `getEditorTrigger` in an effect once the close has committed, not when the
 * editor opened. The timing is the point — the add button and the saved row
 * swap places in that same commit.
 */
function ReturnFocusEditor({
  item,
  onSave,
  onCancel,
  getEditorTrigger,
}: ArrayFieldEditorProps<Item>) {
  const wasOpen = useRef(false);
  const isOpen = item !== undefined;

  useEffect(() => {
    if (wasOpen.current && !isOpen) getEditorTrigger()?.focus();
    wasOpen.current = isOpen;
  }, [isOpen, getEditorTrigger]);

  if (!item) return null;

  return (
    <dialog open>
      <button
        type="button"
        onClick={() => onSave?.({ id: item.id, label: item.label })}
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
  it('renders each item as an accent Surface boundary', () => {
    renderField({
      value: [{ id: 'one', label: 'one' }],
      itemComponent: NestedSurfaceItem,
    });

    const nestedSurface = screen.getByTestId('nested-surface');
    const item = nestedSurface.closest('li');
    expect(item).not.toBeNull();
    expect(item?.classList).toContain('bg-surface-accent');
    expect(item?.classList).toContain('[--surface-depth:0]');
    expect(nestedSurface.classList).toContain('bg-surface-accent-1');
    expect(nestedSurface.classList).toContain('[--surface-depth:1]');
  });

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
    // Singular: the announcement is an ICU `plural`, where the template
    // literal it replaced said "1 items remaining".
    expect(screen.getByRole('status')).toHaveTextContent(
      'Removed item 1. 1 item remaining.',
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

  it('restores focus to the drag handle after a keyboard reorder', async () => {
    // jsdom does not reproduce the browser blur that follows repositioning the
    // moved element, so this asserts the refocus mechanism fires; the live focus
    // retention is verified downstream in a real browser.
    renderField({
      sortable: true,
      value: [
        { id: 'one', label: 'one' },
        { id: 'two', label: 'two' },
      ],
      getId: (item) => item.id,
      onChange: vi.fn(),
    });

    const secondHandle = screen.getByRole('button', {
      name: 'Reorder item 2 of 2',
    });
    secondHandle.focus();
    const focusSpy = vi.spyOn(secondHandle, 'focus');

    fireEvent.keyDown(secondHandle, { key: 'ArrowUp' });

    await waitFor(() => expect(focusSpy).toHaveBeenCalled());
  });

  it('does not refocus the handle for a clamped keyboard press at the bounds', async () => {
    renderField({
      sortable: true,
      value: [
        { id: 'one', label: 'one' },
        { id: 'two', label: 'two' },
      ],
      getId: (item) => item.id,
      onChange: vi.fn(),
    });

    const firstHandle = screen.getByRole('button', {
      name: 'Reorder item 1 of 2',
    });
    firstHandle.focus();
    const focusSpy = vi.spyOn(firstHandle, 'focus');

    fireEvent.keyDown(firstHandle, { key: 'ArrowUp' });

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(focusSpy).not.toHaveBeenCalled();
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

  // Regression: `getEditorTrigger` answered the add button for every new-item
  // session, so saving the item that reaches `maxItems` returned null — the
  // button it named had just unmounted — and focus escaped the list entirely.
  it('returns focus to the new row when saving the item that fills the list', async () => {
    const user = userEvent.setup();
    renderField({
      maxItems: 1,
      itemComponent: TriggerItem,
      editorComponent: ReturnFocusEditor,
    });

    await user.click(screen.getByRole('button', { name: 'Add Item' }));
    await user.click(screen.getByRole('button', { name: 'Save editor' }));

    // The add button is gone, so it cannot be the focus target.
    expect(
      screen.queryByRole('button', { name: 'Add Item' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit new' })).toHaveFocus();
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

  // Regression: ArrayField used to swap the real onDeleteItem/onEditItem/
  // onChange/onUpdateItem handlers for `() => undefined` stubs while
  // disabled/readOnly, rather than omitting them. Every one of those stubs
  // is truthy, so an itemComponent that renders its edit/delete affordance
  // from handler presence (a normal, encouraged pattern — see below) drew a
  // live-looking control wired to a no-op instead of hiding it.
  it.each([
    ['disabled', { disabled: true }],
    ['readOnly', { readOnly: true }],
  ])(
    'omits (rather than stubs) onDelete/onEdit/onChange/onUpdate passed to itemComponent when %s',
    async (_label, fieldProps) => {
      let latestProps: ArrayFieldItemProps<Item> | undefined;
      function CapturingItem(props: ArrayFieldItemProps<Item>) {
        latestProps = props;
        return <div data-testid={`item-${props.item.label}`} />;
      }

      renderField({
        ...fieldProps,
        value: [{ id: 'one', label: 'one' }],
        getId: (item) => item.id,
        itemComponent: CapturingItem,
      });

      expect(latestProps?.onDelete).toBeUndefined();
      expect(latestProps?.onEdit).toBeUndefined();
      expect(latestProps?.onChange).toBeUndefined();
      expect(latestProps?.onUpdate).toBeUndefined();
    },
  );

  it('passes real onDelete/onEdit/onChange/onUpdate handlers to itemComponent when interaction is enabled', () => {
    let latestProps: ArrayFieldItemProps<Item> | undefined;
    function CapturingItem(props: ArrayFieldItemProps<Item>) {
      latestProps = props;
      return <div data-testid={`item-${props.item.label}`} />;
    }

    renderField({
      value: [{ id: 'one', label: 'one' }],
      getId: (item) => item.id,
      itemComponent: CapturingItem,
    });

    expect(latestProps?.onDelete).toBeInstanceOf(Function);
    expect(latestProps?.onEdit).toBeInstanceOf(Function);
    expect(latestProps?.onUpdate).toBeInstanceOf(Function);
  });

  it('lets an itemComponent hide its edit/delete affordance from handler presence while disabled', () => {
    function ConditionalItem({
      item,
      onEdit,
      onDelete,
    }: ArrayFieldItemProps<Item>) {
      return (
        <div data-testid={`item-${item.label}`}>
          {onEdit && (
            <button type="button" onClick={onEdit}>
              Edit
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
      );
    }

    renderField({
      disabled: true,
      value: [{ id: 'one', label: 'one' }],
      getId: (item) => item.id,
      itemComponent: ConditionalItem,
    });

    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
  });

  it('omits onSave passed to editorComponent when disabled', () => {
    let latestOnSave: ((value: Item) => void) | undefined;
    function CapturingEditor(props: ArrayFieldEditorProps<Item>) {
      latestOnSave = props.onSave;
      return null;
    }

    renderField({
      disabled: true,
      value: [{ id: 'one', label: 'one' }],
      getId: (item) => item.id,
      editorComponent: CapturingEditor,
    });

    expect(latestOnSave).toBeUndefined();
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
