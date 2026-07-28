import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import {
  Field,
  FieldArray,
  reducer as formReducer,
  reduxForm,
  SubmissionError,
  type InjectedFormProps,
  type WrappedFieldProps,
} from 'redux-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

const dialogRenderSpy = vi.hoisted(() => vi.fn());

vi.mock('@codaco/fresco-ui/dialogs/Dialog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@codaco/fresco-ui/dialogs/Dialog')>();
  const Dialog = actual.default;

  return {
    ...actual,
    default: (props: ComponentProps<typeof Dialog>) => {
      dialogRenderSpy({ open: props.open, title: props.title });
      return <Dialog {...props} />;
    },
  };
});

import DialogArrayField from '../DialogArrayField';

type Item = Record<string, unknown> & {
  id: string;
  label: string;
};

const Preview = ({ label }: Record<string, unknown>) => (
  <span>{String(label)}</span>
);

const TextInput = ({ input }: WrappedFieldProps) => (
  <input aria-label="Item label" {...input} />
);

let capturedEditorFieldsProps: Record<string, unknown> | undefined;
const EditorFields = (props: Record<string, unknown>) => {
  capturedEditorFieldsProps = props;
  return <Field name="label" component={TextInput} />;
};
// Read through a call so control-flow analysis keeps the declared type: the
// only writes happen inside EditorFields, which CFA cannot see, so a direct
// read after `capturedEditorFieldsProps = undefined` narrows to `never`.
const editorFieldsProps = () => capturedEditorFieldsProps;

type OwnProps = {
  editorValidate?: (
    values: Record<string, unknown>,
    props?: { editIndex?: number },
  ) => Record<string, unknown>;
  normalizeItem?: (value: unknown) => unknown;
  onBeforeSave?: (value: unknown) => unknown;
};

type HarnessProps = InjectedFormProps<Record<string, unknown>, OwnProps> &
  OwnProps;

const Harness = ({
  editorValidate,
  normalizeItem,
  onBeforeSave,
}: HarnessProps) => (
  <FieldArray
    name="items"
    component={DialogArrayField}
    previewComponent={Preview}
    editorFieldsComponent={EditorFields}
    editorTitle="Edit item"
    addTitle="Add item"
    itemLabel="item"
    itemTemplate={() => ({ label: '' })}
    editorValidate={editorValidate}
    normalizeItem={normalizeItem}
    onBeforeSave={onBeforeSave}
    rerenderOnEveryChange
  />
);

const ReduxHarness = reduxForm<Record<string, unknown>, OwnProps>({
  form: 'dialog-array-test',
  touchOnChange: true,
})(Harness);

const setup = ({
  initialItems = [],
  editorValidate,
  normalizeItem,
  onBeforeSave,
}: {
  initialItems?: Item[];
  editorValidate?: OwnProps['editorValidate'];
  normalizeItem?: (value: unknown) => unknown;
  onBeforeSave?: (value: unknown) => unknown;
} = {}) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const view = render(
    <Provider store={store}>
      <DialogProvider>
        <ReduxHarness
          initialValues={{ items: initialItems }}
          editorValidate={editorValidate}
          normalizeItem={normalizeItem}
          onBeforeSave={onBeforeSave}
        />
      </DialogProvider>
    </Provider>,
  );

  const getItems = () =>
    store.getState().form['dialog-array-test']?.values?.items as Item[];

  return { getItems, unmount: view.unmount };
};

describe('DialogArrayField', () => {
  beforeEach(() => {
    dialogRenderSpy.mockClear();
  });

  it('adds a UUID-backed item only after the editor is saved', async () => {
    const { getItems } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    expect(getItems()).toEqual([]);

    fireEvent.change(screen.getByRole('textbox', { name: 'Item label' }), {
      target: { value: 'First item' },
    });
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

  it('edits an existing item and preserves its ID', async () => {
    const { getItems } = setup({
      initialItems: [{ id: 'item-1', label: 'Before' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Item label' }), {
      target: { value: 'After' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(getItems()).toEqual([{ id: 'item-1', label: 'After' }]);
    });
  });

  it('hands the edited item layout over to a rounded dialog', () => {
    setup({
      initialItems: [{ id: 'item-1', label: 'Before' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }));

    expect(screen.queryByText('Before')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveStyle({
      borderRadius: 'var(--radius)',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Before')).toBeInTheDocument();
  });

  it('closes the mounted dialog so its layout ID can animate back', () => {
    setup({
      initialItems: [{ id: 'item-1', label: 'Before' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }));
    expect(dialogRenderSpy).toHaveBeenCalledWith({
      open: true,
      title: 'Edit item',
    });

    dialogRenderSpy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(dialogRenderSpy).toHaveBeenCalledWith({
      open: false,
      title: 'Edit item',
    });
  });

  it('discards a cancelled draft', () => {
    const { getItems } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Item label' }), {
      target: { value: 'Discard me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(getItems()).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    const { getItems } = setup({ onBeforeSave, normalizeItem });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Item label' }), {
      target: { value: 'Async' },
    });
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

  it('keeps the editor open when async pre-save work fails', async () => {
    const onBeforeSave = vi.fn(async () => {
      throw new SubmissionError({ _error: 'Unable to save this item.' });
    });
    const { getItems } = setup({ onBeforeSave });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(onBeforeSave).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getItems()).toEqual([]);
  });

  it('keeps the editor open when editorValidate rejects the item', async () => {
    const editorValidate = vi.fn(() => ({ label: 'Blocked by validate' }));
    const onBeforeSave = vi.fn((value: unknown) => value);
    const { getItems } = setup({ editorValidate, onBeforeSave });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(editorValidate).toHaveBeenCalled();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onBeforeSave).not.toHaveBeenCalled();
    expect(getItems()).toEqual([]);
  });

  // Eleventh-wave Finding 4: an existing item's committed array index is
  // surfaced to editorValidate via redux-form's (values, props) validate
  // signature, so a validate closure can scope itself to the edited row
  // (e.g. excluding it from a sibling overlay) without relying on the row
  // carrying an id. A new item is not in the committed array and reports no
  // index.
  it('surfaces the edited row’s index to editorValidate, and none for a new item', async () => {
    const editorValidate = vi.fn<
      (
        values: Record<string, unknown>,
        props?: { editIndex?: number },
      ) => Record<string, unknown>
    >(() => ({}));
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
    await waitFor(() => {
      expect(editorValidate).toHaveBeenCalled();
    });
    expect(editorValidate.mock.calls.at(-1)?.[1]).toMatchObject({
      editIndex: 1,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    editorValidate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    await waitFor(() => {
      expect(editorValidate).toHaveBeenCalled();
    });
    expect(editorValidate.mock.calls.at(-1)?.[1]).toMatchObject({
      editIndex: undefined,
    });
  });

  // Seventeenth-wave follow-up: the fields component gets the SAME index the
  // validate does, so an editor's pickers can scope themselves to exactly the
  // row the validate is judging (e.g. offering only variables no sibling has
  // claimed). If the two ever disagree, a picker hides something the validate
  // accepts, or offers something it rejects.
  it('gives the fields component the same edited-row index as editorValidate', async () => {
    const editorValidate = vi.fn<
      (
        values: Record<string, unknown>,
        props?: { editIndex?: number },
      ) => Record<string, unknown>
    >(() => ({}));
    capturedEditorFieldsProps = undefined;
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
    await waitFor(() => {
      expect(editorFieldsProps()).toBeDefined();
    });
    expect(editorFieldsProps()?.editIndex).toBe(1);
    expect(editorFieldsProps()?.editIndex).toBe(
      editorValidate.mock.calls.at(-1)?.[1]?.editIndex,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    capturedEditorFieldsProps = undefined;
    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    await waitFor(() => {
      expect(editorFieldsProps()).toBeDefined();
    });
    expect(editorFieldsProps()?.editIndex).toBeUndefined();
  });

  it('prevents duplicate saves and dismissal while pre-save work is pending', async () => {
    let resolvePreSave: ((value: undefined) => void) | undefined;
    const onBeforeSave = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          resolvePreSave = resolve;
        }),
    );
    const { getItems } = setup({ onBeforeSave });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Item label' }), {
      target: { value: 'Only once' },
    });
    const addButton = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addButton);
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(onBeforeSave).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getItems()).toEqual([]);

    resolvePreSave?.(undefined);
    await waitFor(() => {
      expect(getItems()).toEqual([
        expect.objectContaining({ label: 'Only once' }),
      ]);
    });
    expect(onBeforeSave).toHaveBeenCalledOnce();
  });

  it('ignores an async completion after the array editor unmounts', async () => {
    let resolvePreSave: ((value: undefined) => void) | undefined;
    const pendingSave = new Promise<undefined>((resolve) => {
      resolvePreSave = resolve;
    });
    const onBeforeSave = vi.fn(() => pendingSave);
    const { getItems, unmount } = setup({ onBeforeSave });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Item label' }), {
      target: { value: 'Stale completion' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onBeforeSave).toHaveBeenCalledOnce());

    unmount();
    await act(async () => {
      resolvePreSave?.(undefined);
      await pendingSave;
    });

    expect(getItems() ?? []).toEqual([]);
  });
});
