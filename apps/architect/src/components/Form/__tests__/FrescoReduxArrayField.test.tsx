import {
  configureStore,
  type Middleware,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import {
  Field,
  FieldArray,
  reducer as formReducer,
  reduxForm,
  stopAsyncValidation,
  stopSubmit,
  touch,
  type InjectedFormProps,
  type WrappedFieldProps,
} from 'redux-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { ArrayFieldDragHandle } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

import FrescoReduxArrayField, {
  type FrescoReduxArrayFieldItemProps,
} from '../FrescoReduxArrayField';
import ValidatedFieldArray from '../ValidatedFieldArray';

type Item = Record<string, unknown> & {
  label: string;
};

const ItemRow = ({
  item,
  fieldName,
  dragControls,
  index,
  isSortable,
  itemCount,
  onDelete,
  onMove,
  onUpdate,
}: FrescoReduxArrayFieldItemProps<Item>) => {
  useEffect(() => {
    rowMounted();
  }, []);

  return (
    <div>
      {isSortable && (
        <ArrayFieldDragHandle
          dragControls={dragControls}
          index={index}
          itemCount={itemCount}
          onMove={onMove}
        />
      )}
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

const NestedInput = ({ input }: WrappedFieldProps) => (
  <input aria-label="Nested label" {...input} />
);

const NestedItemRow = ({ fieldName }: FrescoReduxArrayFieldItemProps<Item>) => (
  <Field name={`${fieldName}.label`} component={NestedInput} />
);

const Harness = (_props: InjectedFormProps) => (
  <FieldArray
    name="items"
    component={FrescoReduxArrayField}
    itemComponent={ItemRow}
    itemTemplate={() => ({ label: 'new item' })}
    addButtonLabel="Add item"
    immediateAdd
    sortable
    confirmDelete={false}
    rerenderOnEveryChange
  />
);

const ReduxHarness = reduxForm({
  form: 'array-adapter-test',
  touchOnChange: true,
})(Harness);

const NestedHarness = (_props: InjectedFormProps) => (
  <FieldArray
    name="items"
    component={FrescoReduxArrayField}
    itemComponent={NestedItemRow}
    itemTemplate={() => ({ label: '' })}
    confirmDelete={false}
    rerenderOnEveryChange
  />
);

const NestedReduxHarness = reduxForm({
  form: 'nested-array-adapter-test',
  touchOnChange: true,
})(NestedHarness);

const ValidatedHarness = ({ handleSubmit }: InjectedFormProps) => (
  <form onSubmit={handleSubmit(() => undefined)}>
    <ValidatedFieldArray
      name="items"
      component={FrescoReduxArrayField}
      validation={{ minSelected: 1 }}
      componentProps={{
        itemComponent: ItemRow,
        itemTemplate: () => ({ label: 'new item' }),
        addButtonLabel: 'Add required item',
        immediateAdd: true,
        confirmDelete: false,
      }}
    />
    <button type="submit">Submit validated array</button>
  </form>
);

const ValidatedReduxHarness = reduxForm({
  form: 'validated-array-adapter-test',
  touchOnChange: true,
})(ValidatedHarness);

const setup = (initialItems: Item[] | null | undefined) => {
  const actions: string[] = [];
  const recordActions: Middleware = () => (next) => (action) => {
    if (typeof action === 'object' && action && 'type' in action) {
      actions.push(String(action.type));
    }
    return next(action);
  };
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).concat(recordActions),
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

  return { actions, getItems, store };
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
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { actions, getItems } = setup([{ label: 'original' }]);

    expect(rowMounted).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(getItems()).toEqual([{ label: 'updated' }]);
    expect(actions).toContain('@@redux-form/ARRAY_SPLICE');
    expect(screen.getByText('items[0]')).toBeInTheDocument();
    expect(rowMounted).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(getItems()).toEqual([]);
    expect(actions).toContain('@@redux-form/ARRAY_REMOVE');
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain(
      'Cannot update a component',
    );
    consoleError.mockRestore();
  });

  it('moves indexed metadata with keyboard reordering', () => {
    const { actions, getItems, store } = setup([
      { label: 'first' },
      { label: 'second' },
    ]);
    act(() => {
      store.dispatch(
        touch(
          'array-adapter-test',
          'items[0].label',
        ) as unknown as UnknownAction,
      );
      store.dispatch(
        stopSubmit('array-adapter-test', {
          items: [{ label: 'first submit' }, { label: 'second submit' }],
        }) as unknown as UnknownAction,
      );
      store.dispatch(
        stopAsyncValidation('array-adapter-test', {
          items: [{ label: 'first async' }, { label: 'second async' }],
        }) as unknown as UnknownAction,
      );
    });

    const secondHandle = screen.getByRole('button', {
      name: 'Reorder item 2 of 2',
    });
    fireEvent.keyDown(secondHandle, { key: 'ArrowUp' });

    expect(getItems()).toEqual([{ label: 'second' }, { label: 'first' }]);
    expect(actions).toContain('@@redux-form/ARRAY_MOVE');
    const formState = store.getState().form['array-adapter-test'];
    const formStateRecord = formState as unknown as Record<string, unknown>;
    expect(formState?.submitErrors).toEqual({
      items: [{ label: 'second submit' }, { label: 'first submit' }],
    });
    expect(formStateRecord.asyncErrors).toEqual({
      items: [{ label: 'second async' }, { label: 'first async' }],
    });
    expect(formState?.fields?.items).toEqual([
      undefined,
      { label: { touched: true } },
    ]);
    expect(formState?.fields?.items).not.toHaveProperty('NaN');

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);

    expect(getItems()).toEqual([{ label: 'first' }]);
    expect(store.getState().form['array-adapter-test']?.submitErrors).toEqual({
      items: [{ label: 'first submit' }],
    });
    const updatedFormState = store.getState().form[
      'array-adapter-test'
    ] as unknown as Record<string, unknown>;
    expect(updatedFormState.asyncErrors).toEqual({
      items: [{ label: 'first async' }],
    });
    expect(updatedFormState.fields).toEqual({
      items: [{ label: { touched: true } }],
    });
  });

  it('uses ARRAY_INSERT without malformed parent metadata when touchOnChange is enabled', () => {
    const { actions, getItems, store } = setup([]);

    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));

    expect(getItems()).toEqual([{ label: 'new item' }]);
    expect(actions).toContain('@@redux-form/ARRAY_INSERT');
    expect(
      JSON.stringify(store.getState().form['array-adapter-test']),
    ).not.toContain('NaN');
  });

  it('renders an array-level validation error after a failed submit', () => {
    const { store } = setup([]);
    act(() => {
      store.dispatch(
        stopSubmit('array-adapter-test', {
          items: { _error: 'Add at least one item.' },
        }) as unknown as UnknownAction,
      );
    });

    expect(screen.getByText('Add at least one item.')).toBeInTheDocument();
  });

  it('runs ValidatedFieldArray rules and clears the error after insertion', () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });
    render(
      <Provider store={store}>
        <DialogProvider>
          <ValidatedReduxHarness initialValues={{ items: [] }} />
        </DialogProvider>
      </Provider>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Submit validated array' }),
    );
    expect(
      screen.getByText('You must choose a minimum of 1 option(s)'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add required item' }));
    expect(
      screen.queryByText('You must choose a minimum of 1 option(s)'),
    ).not.toBeInTheDocument();
  });

  it('lets indexed child fields own focus and blur metadata', () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    render(
      <Provider store={store}>
        <DialogProvider>
          <NestedReduxHarness
            initialValues={{ items: [{ label: 'Nested value' }] }}
          />
        </DialogProvider>
      </Provider>,
    );

    const input = screen.getByRole('textbox', { name: 'Nested label' });
    expect(() => {
      fireEvent.focus(input);
      fireEvent.blur(input);
    }).not.toThrow();
    expect(input).toHaveValue('Nested value');
  });
});
