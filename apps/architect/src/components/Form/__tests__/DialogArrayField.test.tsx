import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import {
  Field,
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

const EditorFields = () => <Field name="label" component={TextInput} />;

type OwnProps = {
  normalizeItem?: (value: unknown) => unknown;
  onBeforeSave?: (value: unknown) => unknown;
};

type HarnessProps = InjectedFormProps<Record<string, unknown>, OwnProps> &
  OwnProps;

const Harness = ({ normalizeItem, onBeforeSave }: HarnessProps) => (
  <Field
    name="items"
    component={DialogArrayField}
    previewComponent={Preview}
    editorFieldsComponent={EditorFields}
    editorTitle="Edit item"
    addTitle="Add item"
    itemLabel="item"
    itemTemplate={() => ({ label: '' })}
    normalizeItem={normalizeItem}
    onBeforeSave={onBeforeSave}
  />
);

const ReduxHarness = reduxForm<Record<string, unknown>, OwnProps>({
  form: 'dialog-array-test',
})(Harness);

const setup = ({
  initialItems = [],
  normalizeItem,
  onBeforeSave,
}: {
  initialItems?: Item[];
  normalizeItem?: (value: unknown) => unknown;
  onBeforeSave?: (value: unknown) => unknown;
} = {}) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <DialogProvider>
        <ReduxHarness
          initialValues={{ items: initialItems }}
          normalizeItem={normalizeItem}
          onBeforeSave={onBeforeSave}
        />
      </DialogProvider>
    </Provider>,
  );

  const getItems = () =>
    store.getState().form['dialog-array-test']?.values?.items as Item[];

  return { getItems };
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
});
