import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useContext, useState, type ContextType, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { renderStageForm } from '~/components/StageEditor/__tests__/stageFormTestHarness';

import ArchitectArrayField from '../../ArchitectArrayField';
import ArchitectField from '../../ArchitectField';
import { useClearValue } from '../../clearFieldValue';
import DialogArrayField, {
  type DialogArrayEditorValidate,
} from '../DialogArrayField';

// `id` is optional so a case can exercise rows that carry none, which fall
// back to ArrayField's positional identity.
type Item = { id?: string; label: string; note?: string };

/** `initialValue` is a register-effect dependency, so keep it stable. */
const NO_ITEMS: Item[] = [];

type TextInputProps = {
  value?: string;
  onChange?: (value: string) => void;
} & React.InputHTMLAttributes<HTMLInputElement>;

const TextInput = ({ value, onChange, ...rest }: TextInputProps) => (
  <input
    {...rest}
    value={value ?? ''}
    onChange={(event) => onChange?.(event.target.value)}
  />
);

const Preview = ({ label }: Record<string, unknown>) => (
  <span>{typeof label === 'string' ? label : ''}</span>
);

let capturedEditorProps: Record<string, unknown> | undefined;
// Read through a call so control-flow analysis keeps the declared type: the
// only writes happen inside EditorFields, which CFA cannot see.
const editorProps = () => capturedEditorProps;

const EditorFields = (props: Record<string, unknown>) => {
  capturedEditorProps = props;
  return (
    <ArchitectField
      name="label"
      label="Item label"
      component={TextInput}
      initialValue={typeof props.label === 'string' ? props.label : ''}
    />
  );
};

/**
 * Stands in for a toggleable Section: turning the note off clears the field
 * explicitly and then unmounts it, which is what the save has to read as
 * "the researcher removed this".
 */
const ToggleableEditorFields = (props: Record<string, unknown>) => {
  const clearValue = useClearValue();
  const [open, setOpen] = useState(typeof props.note === 'string');

  return (
    <>
      <ArchitectField
        name="label"
        label="Item label"
        component={TextInput}
        initialValue={typeof props.label === 'string' ? props.label : ''}
      />
      <button
        type="button"
        onClick={() => {
          if (open) clearValue('note');
          setOpen(!open);
        }}
      >
        Toggle note
      </button>
      {open && (
        <ArchitectField
          name="note"
          label="Note"
          component={TextInput}
          initialValue={typeof props.note === 'string' ? props.note : ''}
        />
      )}
    </>
  );
};

/** Unmounts a field the researcher never touched, without clearing it. */
const UnmountingEditorFields = (props: Record<string, unknown>) => {
  const [visible, setVisible] = useState(true);

  return (
    <>
      <ArchitectField
        name="label"
        label="Item label"
        component={TextInput}
        initialValue={typeof props.label === 'string' ? props.label : ''}
      />
      <button type="button" onClick={() => setVisible(false)}>
        Hide note
      </button>
      {visible && (
        <ArchitectField
          name="note"
          label="Note"
          component={TextInput}
          initialValue=""
        />
      )}
    </>
  );
};

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const getItems = (): Item[] => {
  if (!storeApi) throw new Error('form store was not captured');
  return (storeApi.getState().getFormValues().items ?? []) as Item[];
};

/**
 * Rewrites the whole array from outside the field, the way an undo/redo
 * restore does (`StageFormBridge`'s `runRestore` writes through
 * `setFieldValue`). Used to move the ground under an in-flight row save.
 */
const setItems = (items: Item[]) => {
  if (!storeApi) throw new Error('form store was not captured');
  const { setFieldValue } = storeApi.getState();
  act(() => setFieldValue('items', items));
};

/** A promise the test releases, for suspending `onBeforeSave` mid-save. */
const deferred = () => {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release?.() };
};

const releaseAndSettle = async ({
  promise,
  release,
}: ReturnType<typeof deferred>) => {
  await act(async () => {
    release();
    await promise;
  });
};

type FieldOverrides = {
  editorFieldsComponent?: React.ComponentType<Record<string, unknown>>;
  editorValidate?: DialogArrayEditorValidate;
  normalizeItem?: (value: unknown) => unknown;
  onBeforeSave?: (value: unknown) => unknown;
  sortable?: boolean;
};

const arrayField = (
  initialItems: Item[],
  {
    editorFieldsComponent = EditorFields,
    editorValidate,
    normalizeItem,
    onBeforeSave,
    sortable,
  }: FieldOverrides,
) => (
  <ArchitectArrayField
    name="items"
    label="Items"
    component={DialogArrayField}
    initialValue={initialItems}
    previewComponent={Preview}
    editorFieldsComponent={editorFieldsComponent}
    editorTitle="Edit item"
    addTitle="Add item"
    itemLabel="item"
    itemTemplate={() => ({ label: '' })}
    editorValidate={editorValidate}
    normalizeItem={normalizeItem}
    onBeforeSave={onBeforeSave}
    sortable={sortable}
  />
);

const setup = ({
  initialItems = NO_ITEMS,
  ...overrides
}: FieldOverrides & { initialItems?: Item[] } = {}) => {
  capturedEditorProps = undefined;
  storeApi = null;

  // The row editor reads `itemSelector` through `useSelector`, so a Redux
  // store is a precondition of the field even when no selector is configured.
  const store = configureStore({ reducer: (state = {}) => state });

  const view = render(
    <Provider store={store}>
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        {arrayField(initialItems, overrides)}
      </Form>
    </Provider>,
  );

  return { getItems, unmount: view.unmount };
};

const editorInput = () => screen.getByRole('textbox', { name: 'Item label' });

describe('DialogArrayField', () => {
  it('adds a UUID-backed item only after the editor is saved', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    expect(getItems()).toEqual([]);

    fireEvent.change(editorInput(), { target: { value: 'First item' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(getItems()).toEqual([
        expect.objectContaining({
          id: expect.any(String),
          label: 'First item',
        }),
      ]);
    });
  });

  it('edits an existing item and preserves properties the editor never renders', async () => {
    setup({ initialItems: [{ id: 'item-1', label: 'Before' }] });

    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }));
    fireEvent.change(editorInput(), { target: { value: 'After' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(getItems()).toEqual([{ id: 'item-1', label: 'After' }]);
    });
  });

  it('drops a field the editor cleared before its section unmounted', async () => {
    setup({
      initialItems: [{ id: 'item-1', label: 'Before', note: 'Remove me' }],
      editorFieldsComponent: ToggleableEditorFields,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle note' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('textbox', { name: 'Note' }),
      ).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(getItems()).toEqual([{ id: 'item-1', label: 'Before' }]);
    });
  });

  it('does not invent a key for an untouched field that merely unmounted', async () => {
    setup({
      initialItems: [{ id: 'item-1', label: 'Before' }],
      editorFieldsComponent: UnmountingEditorFields,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide note' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('textbox', { name: 'Note' }),
      ).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(getItems()).toEqual([{ id: 'item-1', label: 'Before' }]);
    });
  });

  it('discards a cancelled draft', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.change(editorInput(), { target: { value: 'Discard me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(getItems()).toEqual([]);
    await waitFor(() => {
      expect(
        screen.queryByRole('textbox', { name: 'Item label' }),
      ).not.toBeInTheDocument();
    });
  });

  it('gives every editing session a fresh field store', async () => {
    setup({ initialItems: [{ id: 'item-1', label: 'Before' }] });

    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }));
    fireEvent.change(editorInput(), { target: { value: 'Abandoned' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Cancelling a DIRTY editor now asks first, so the row only comes back
    // once the (auto-confirmed) discard dialog has resolved.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Edit item' }),
      ).toBeInTheDocument(),
    );

    // Re-opening the SAME row must start from its committed values, not from
    // the store the cancelled session left behind.
    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }));
    await waitFor(() => expect(editorInput()).toHaveValue('Before'));
  });

  it('awaits pre-save work before normalization and persistence', async () => {
    const onBeforeSave = vi.fn(async (value: unknown) => ({
      ...(value as Item),
      label: `${(value as Item).label} transformed`,
    }));
    const normalizeItem = vi.fn((value: unknown) => ({
      ...(value as Item),
      normalized: true,
    }));
    setup({ onBeforeSave, normalizeItem });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.change(editorInput(), { target: { value: 'Async' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(getItems()[0]).toEqual(
        expect.objectContaining({
          label: 'Async transformed',
          normalized: true,
        }),
      );
    });
    expect(onBeforeSave).toHaveBeenCalledOnce();
    expect(normalizeItem).toHaveBeenCalledOnce();
  });

  it('keeps the editor open when pre-save work reports field errors', async () => {
    const onBeforeSave = vi.fn(() => ({
      success: false as const,
      fieldErrors: { label: ['Unable to save this item.'] },
    }));
    setup({ onBeforeSave });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('Unable to save this item.'),
    ).toBeInTheDocument();
    expect(getItems()).toEqual([]);
    expect(editorInput()).toBeInTheDocument();
  });

  it('keeps the editor open when editorValidate rejects the item', async () => {
    const editorValidate = vi.fn(() => ({ label: 'Blocked by validate' }));
    const onBeforeSave = vi.fn((value: unknown) => value);
    setup({ editorValidate, onBeforeSave });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Blocked by validate')).toBeInTheDocument();
    expect(onBeforeSave).not.toHaveBeenCalled();
    expect(getItems()).toEqual([]);
  });

  it('surfaces the edited row’s index and committed values to editorValidate', async () => {
    const editorValidate = vi.fn<DialogArrayEditorValidate>(() => ({}));
    setup({
      initialItems: [
        { id: 'item-1', label: 'First' },
        { id: 'item-2', label: 'Second' },
      ],
      editorValidate,
    });

    const secondEditButton = screen.getAllByRole('button', {
      name: 'Edit item',
    })[1];
    if (!secondEditButton) throw new Error('Expected two edit buttons');
    fireEvent.click(secondEditButton);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(editorValidate).toHaveBeenCalled());
    expect(editorValidate.mock.calls.at(-1)?.[1]).toMatchObject({
      editIndex: 1,
      initialValues: { id: 'item-2', label: 'Second' },
    });

    // A new item is not in the committed array, so it reports no index.
    editorValidate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(editorValidate).toHaveBeenCalled());
    expect(editorValidate.mock.calls.at(-1)?.[1]?.editIndex).toBeUndefined();
  });

  it('gives the fields component the same edited-row index as editorValidate', async () => {
    const editorValidate = vi.fn<DialogArrayEditorValidate>(() => ({}));
    setup({
      initialItems: [
        { id: 'item-1', label: 'First' },
        { id: 'item-2', label: 'Second' },
      ],
      editorValidate,
    });

    const secondEditButton = screen.getAllByRole('button', {
      name: 'Edit item',
    })[1];
    if (!secondEditButton) throw new Error('Expected two edit buttons');
    fireEvent.click(secondEditButton);
    await waitFor(() => expect(editorProps()).toBeDefined());
    expect(editorProps()?.editIndex).toBe(1);
    expect(editorProps()?.form).toBe('edit-stage-items-item-editor');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(editorValidate).toHaveBeenCalled());
    expect(editorValidate.mock.calls.at(-1)?.[1]?.editIndex).toBe(1);
  });

  it('removes a row through its own confirm dialog', async () => {
    setup({ initialItems: [{ id: 'item-1', label: 'Only' }] });

    fireEvent.click(screen.getByRole('button', { name: 'Remove item' }));

    await waitFor(() => expect(getItems()).toEqual([]));
    expect(globalThis.__architectDialogMocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ confirmLabel: 'Remove item' }),
    );
  });

  it('emits the whole array when a row is reordered', async () => {
    setup({
      initialItems: [
        { id: 'item-1', label: 'First' },
        { id: 'item-2', label: 'Second' },
      ],
      sortable: true,
    });

    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Reorder item 1 of 2' }),
      { key: 'ArrowDown' },
    );

    await waitFor(() => {
      expect(getItems()).toEqual([
        { id: 'item-2', label: 'Second' },
        { id: 'item-1', label: 'First' },
      ]);
    });
  });

  it('never registers a per-row field in the parent form', async () => {
    setup({ initialItems: [{ id: 'item-1', label: 'Only' }] });

    await waitFor(() => expect(getItems()).toHaveLength(1));
    if (!storeApi) throw new Error('form store was not captured');
    expect([...storeApi.getState().fields.keys()]).toEqual(['items']);
  });

  it('commits a slow save to the row it was made on, not to whatever now sits at its index', async () => {
    const gate = deferred();
    const onBeforeSave = vi.fn(async (value: unknown) => {
      await gate.promise;
      return value;
    });
    setup({
      initialItems: [
        { id: 'item-1', label: 'First' },
        { id: 'item-2', label: 'Second' },
      ],
      onBeforeSave,
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit item' })[0]!);
    fireEvent.change(editorInput(), { target: { value: 'First edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onBeforeSave).toHaveBeenCalledOnce());

    // The array is rewritten under the in-flight save, exactly as an undo or a
    // reorder does: the edited row is still there, but no longer at index 0,
    // and the editing session it belonged to has been replaced.
    setItems([
      { id: 'item-2', label: 'Second' },
      { id: 'item-1', label: 'First' },
    ]);

    await releaseAndSettle(gate);

    // The edit lands on item-1 at its NEW index, and item-2 — which now
    // occupies the index the save started from — is untouched.
    await waitFor(() => {
      expect(getItems()).toEqual([
        { id: 'item-2', label: 'Second' },
        { id: 'item-1', label: 'First edited' },
      ]);
    });
  });

  it('does not resurrect a row that was removed while its save was in flight', async () => {
    const gate = deferred();
    const onBeforeSave = vi.fn(async (value: unknown) => {
      await gate.promise;
      return value;
    });
    setup({
      initialItems: [
        { id: 'item-1', label: 'First' },
        { id: 'item-2', label: 'Second' },
      ],
      onBeforeSave,
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit item' })[0]!);
    fireEvent.change(editorInput(), { target: { value: 'First edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onBeforeSave).toHaveBeenCalledOnce());

    setItems([{ id: 'item-2', label: 'Second' }]);

    await releaseAndSettle(gate);

    // There is no row left to commit to, so the save writes nothing: neither
    // a resurrected item-1 nor item-1's label onto item-2.
    await waitFor(() => {
      expect(getItems()).toEqual([{ id: 'item-2', label: 'Second' }]);
    });
    // The save returns a failure, but the list has already stopped editing a
    // row that is no longer there, so the dialog closes on its own and that
    // failure has nowhere to render — see the comment on the path itself.
    await waitFor(() => {
      expect(
        screen.queryByRole('textbox', { name: 'Item label' }),
      ).not.toBeInTheDocument();
    });
  });

  it('refuses a save it cannot place, rather than writing it onto the row that took its place', async () => {
    const gate = deferred();
    const onBeforeSave = vi.fn(async (value: unknown) => {
      await gate.promise;
      return value;
    });
    // Rows with no id of their own fall back to ArrayField's positional
    // identity, so deleting the first row hands its editing session — and the
    // still-open editor — to the second. Nothing here can be addressed by id,
    // and the one thing the save must not do is write onto that neighbour.
    setup({
      initialItems: [{ label: 'First' }, { label: 'Second' }],
      onBeforeSave,
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit item' })[0]!);
    fireEvent.change(editorInput(), { target: { value: 'First edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onBeforeSave).toHaveBeenCalledOnce());

    setItems([{ label: 'Second' }]);

    await releaseAndSettle(gate);

    expect(getItems()).toEqual([{ label: 'Second' }]);
    // The editor is still open — on the neighbour, showing its own value, not
    // the edit that was in flight for the row that is gone.
    expect(editorInput()).toHaveValue('Second');
  });

  it('commits a row the researcher added even if the array editor unmounts first', async () => {
    const gate = deferred();
    const onBeforeSave = vi.fn(async (value: unknown) => {
      await gate.promise;
      return value;
    });
    const { unmount } = setup({ onBeforeSave });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.change(editorInput(), { target: { value: 'Slow addition' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onBeforeSave).toHaveBeenCalledOnce());

    const captured = storeApi;
    unmount();
    await releaseAndSettle(gate);

    if (!captured) throw new Error('form store was not captured');
    // The field is unregistered, so the row is not part of `getFormValues()`
    // — an unmounted field contributes nothing to the form's output. What
    // matters is that the researcher's row was written to the field rather
    // than silently dropped: the store parks it for the field's next
    // registration, which is where it comes back from.
    expect(captured.getState().getFieldState('items')?.value).toEqual([
      expect.objectContaining({ label: 'Slow addition' }),
    ]);
  });
});

describe('DialogArrayField in the stage form', () => {
  const renderInStageForm = (children: ReactNode) =>
    renderStageForm({
      committedStage: null,
      children,
    });

  it('round-trips an added row through the draft timeline', async () => {
    const { snapshots, getHistory, getFormValues } = renderInStageForm(
      arrayField(NO_ITEMS, {}),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.change(editorInput(), { target: { value: 'Undo me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(getFormValues().items as Item[]).toHaveLength(1),
    );
    // Adding a row is one logical change: it snapshots immediately rather than
    // waiting out the leaf-edit debounce.
    expect(snapshots.at(-1)).toMatchObject({
      items: [expect.objectContaining({ label: 'Undo me' })],
    });

    act(() => getHistory().undo());

    expect(getFormValues().items as Item[]).toHaveLength(0);
  });
});

/**
 * Where focus goes when a row editor closes.
 *
 * The row hides its own controls while it is being edited, so the Edit button
 * that opened the dialog is unmounted for the whole session and a FRESH one is
 * mounted on the way back. Nothing captured at open time survives that, which is
 * why the editor names its return target through `getEditorTrigger`, resolved
 * when focus is actually returned.
 */
describe('DialogArrayField focus return', () => {
  const settle = async () => {
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Item label' }),
      ).not.toBeInTheDocument(),
    );
    // Base UI returns focus after the popup's exit animation.
    await new Promise((resolve) => setTimeout(resolve, 500));
  };

  const openEditorFor = async (name: string) => {
    const trigger = screen.getByRole('button', { name });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
  };

  it('returns focus to the row’s Edit control after Cancel', async () => {
    setup({ initialItems: [{ id: 'item-1', label: 'Before' }] });

    await openEditorFor('Edit item');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settle();

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Edit item' }),
    );
  });

  it('returns focus to the add button after a new item is cancelled', async () => {
    // A new item was never a row, so there is no Edit control to go back to —
    // the control that opened the editor is the list's add button.
    setup();

    await openEditorFor('Create new');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settle();

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Create new' }),
    );
  });

  it('returns focus to the row’s Edit control after a save', async () => {
    setup({ initialItems: [{ id: 'item-1', label: 'Before' }] });

    await openEditorFor('Edit item');
    fireEvent.change(editorInput(), { target: { value: 'After' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await settle();

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Edit item' }),
    );
  });
});
