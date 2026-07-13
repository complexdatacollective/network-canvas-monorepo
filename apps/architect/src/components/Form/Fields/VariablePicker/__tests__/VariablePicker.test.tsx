import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { Field, reducer as formReducer, reduxForm } from 'redux-form';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/VariablePill', () => ({
  default: () => (
    <div data-testid="editable-variable-pill">EditableVariablePill</div>
  ),
  SimpleVariablePill: () => (
    <div data-testid="simple-variable-pill">SimpleVariablePill</div>
  ),
}));

vi.mock('../VariableSpotlight', () => ({
  default: ({
    open,
    onSelect,
    onCancel,
  }: {
    open: boolean;
    onSelect: (value: string) => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Variable library">
        <button type="button" onClick={() => onSelect('age')}>
          Choose age
        </button>
        <button type="button" onClick={onCancel}>
          Cancel selection
        </button>
      </div>
    ) : null,
}));

import VariablePicker from '../VariablePicker';

const options = [
  { label: 'Age', value: 'age', type: 'number' },
  { label: 'New variable', value: 'new-variable' },
];

const ReduxHarness = reduxForm<{ variable?: string }>({
  form: 'variable-picker-test',
})(() => (
  <Field
    name="variable"
    component={VariablePicker}
    label="Variable"
    required
    options={options}
  />
));

const setup = (initialValue?: string) => {
  const store = configureStore({
    reducer: {
      form: formReducer,
      protocol: () => ({
        present: {
          codebook: {
            node: { person: { variables: { age: {} } } },
            edge: {},
            ego: {},
          },
        },
      }),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <ReduxHarness initialValues={{ variable: initialValue }} />
    </Provider>,
  );

  return {
    getValue: () =>
      store.getState().form['variable-picker-test']?.values?.variable as
        | string
        | undefined,
  };
};

describe('VariablePicker', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('uses the shared field label and group semantics', () => {
    setup();

    expect(screen.getByRole('group', { name: 'Variable' })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Variable' }),
    ).toHaveAccessibleDescription('Required');
    expect(
      screen.getByRole('button', { name: 'Select variable' }),
    ).toBeInTheDocument();
  });

  it('renders the selected variable using the appropriate pill', () => {
    setup('age');

    expect(screen.getByTestId('editable-variable-pill')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change variable' }),
    ).toBeInTheDocument();
  });

  it('renders an untyped selected variable using the simple pill', () => {
    setup('new-variable');

    expect(screen.getByTestId('simple-variable-pill')).toBeInTheDocument();
  });

  it('persists a spotlight selection to Redux Form', () => {
    const { getValue } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Select variable' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose age' }));

    expect(getValue()).toBe('age');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
