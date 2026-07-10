import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import {
  Field,
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import FrescoReduxArrayField, {
  type FrescoReduxArrayFieldItemProps,
} from '../FrescoReduxArrayField';

type Item = Record<string, unknown> & {
  label: string;
};

const ItemRow = ({
  item,
  fieldName,
  onDelete,
  onUpdate,
}: FrescoReduxArrayFieldItemProps<Item>) => {
  useEffect(() => {
    rowMounted();
  }, []);

  return (
    <div>
      <span>{fieldName}</span>
      <span>{item.label}</span>
      <button type="button" onClick={() => onUpdate({ label: 'updated' })}>
        Update
      </button>
      <button type="button" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
};

const rowMounted = vi.fn();

const Harness = (_props: InjectedFormProps) => (
  <Field
    name="items"
    component={FrescoReduxArrayField}
    itemComponent={ItemRow}
    itemTemplate={() => ({ label: 'new item' })}
    addButtonLabel="Add item"
    immediateAdd
    confirmDelete={false}
  />
);

const ReduxHarness = reduxForm({ form: 'array-adapter-test' })(Harness);

const setup = (initialItems: Item[] | null | undefined) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <DialogProvider>
        <ReduxHarness initialValues={{ items: initialItems }} />
      </DialogProvider>
    </Provider>,
  );

  const getItems = () =>
    store.getState().form['array-adapter-test']?.values?.items as
      | Item[]
      | null
      | undefined;

  return { getItems };
};

describe('FrescoReduxArrayField', () => {
  beforeEach(() => {
    rowMounted.mockClear();
  });

  it.each([null, undefined])(
    'normalizes %s to an empty display array without changing storage until mutation',
    (initialItems) => {
      const { getItems } = setup(initialItems);

      expect(screen.getByText(/No items added yet/)).toBeInTheDocument();
      expect(getItems()).toBe(initialItems);

      fireEvent.click(screen.getByRole('button', { name: 'Add item' }));

      expect(getItems()).toEqual([{ label: 'new item' }]);
      expect(screen.getByText('items[0]')).toBeInTheDocument();
    },
  );

  it('updates and deletes Redux Form values without remounting the row', () => {
    const { getItems } = setup([{ label: 'original' }]);

    expect(rowMounted).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(getItems()).toEqual([{ label: 'updated' }]);
    expect(screen.getByText('items[0]')).toBeInTheDocument();
    expect(rowMounted).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(getItems()).toEqual([]);
  });
});
