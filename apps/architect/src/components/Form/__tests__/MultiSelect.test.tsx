import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

vi.mock('../ValidatedField', () => ({
  default: ({
    name,
    onChange,
    componentProps = {},
  }: {
    name: string;
    onChange?: () => void;
    componentProps?: Record<string, unknown>;
  }) => (
    <button
      type="button"
      aria-label={String(componentProps.label ?? name)}
      data-has-options={String(Array.isArray(componentProps.options))}
      onClick={onChange}
    >
      {name}
    </button>
  ),
}));

import MultiSelect from '../MultiSelect';

type ItemValue = Record<string, unknown>;
type FormValues = { items: ItemValue[] };
type OptionGetter = (
  fieldName: string,
  rowValues: unknown,
  allValues: unknown,
) => Array<Record<string, unknown>>;
type OwnProps = {
  maxItems?: number | null;
  options: OptionGetter;
  properties?: Array<{
    fieldName: string;
    control?: 'input' | 'select';
    label?: string;
  }>;
};
type HarnessProps = InjectedFormProps<FormValues, OwnProps> & OwnProps;

const Harness = ({
  maxItems,
  options,
  properties = [{ fieldName: 'first' }, { fieldName: 'second' }],
}: HarnessProps) => (
  <MultiSelect
    name="items"
    properties={properties}
    options={options}
    maxItems={maxItems}
  />
);

const ReduxHarness = reduxForm<FormValues, OwnProps>({
  form: 'multi-select-test',
})(Harness);

const setup = (
  initialItems: ItemValue[],
  { maxItems, options = vi.fn(() => []), properties }: Partial<OwnProps> = {},
) => {
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
          options={options}
          maxItems={maxItems}
          properties={properties}
        />
      </DialogProvider>
    </Provider>,
  );

  const getItems = () =>
    store.getState().form['multi-select-test']?.values?.items as ItemValue[];

  return { getItems, options };
};

describe('MultiSelect', () => {
  it('calculates options from row and array values and resets dependencies', () => {
    const initialItems = [{ first: 'a', second: 'b' }];
    const options = vi.fn(() => []);
    const { getItems } = setup(initialItems, { options });

    expect(options).toHaveBeenCalledWith(
      'first',
      initialItems[0],
      initialItems,
    );
    expect(options).toHaveBeenCalledWith(
      'second',
      initialItems[0],
      initialItems,
    );

    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    expect(getItems()).toEqual([{ first: 'a', second: null }]);
  });

  it('uses semantic labels and a Fresco input for free-text properties', () => {
    const options = vi.fn(() => []);

    setup([{ first: 'a', label: 'Visible label' }], {
      options,
      properties: [
        { fieldName: 'first' },
        { fieldName: 'label', control: 'input' },
      ],
    });

    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute(
      'data-has-options',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Label' })).toHaveAttribute(
      'data-has-options',
      'false',
    );
    expect(options).not.toHaveBeenCalledWith(
      'label',
      expect.anything(),
      expect.anything(),
    );
    expect(
      screen.queryByRole('button', {
        name: 'items[0].first',
      }),
    ).not.toBeInTheDocument();
  });

  it('reorders the Redux array with the keyboard drag handle', () => {
    const { getItems } = setup([
      { first: 'a', second: '1' },
      { first: 'b', second: '2' },
    ]);

    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Reorder item 1 of 2' }),
      { key: 'ArrowDown' },
    );

    expect(getItems()).toEqual([
      { first: 'b', second: '2' },
      { first: 'a', second: '1' },
    ]);
  });

  it('adds immediately and enforces maxItems', () => {
    const { getItems } = setup([], { maxItems: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Add new' }));

    expect(getItems()).toEqual([{}]);
    expect(
      screen.queryByRole('button', { name: 'Add new' }),
    ).not.toBeInTheDocument();
  });
});
