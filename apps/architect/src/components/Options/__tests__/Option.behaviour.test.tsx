import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  isValid,
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import type { OptionValue } from '../Options';
import Options from '../Options';

const FORM = 'optionsBehaviour';

const Harness = (_props: InjectedFormProps) => (
  <Options name="options" label="Options" />
);

const OptionsForm = reduxForm({ form: FORM })(Harness);

const TWO_VALID_OPTIONS: OptionValue[] = [
  { label: 'One', value: 1 },
  { label: 'Two', value: 2 },
];

const setup = (options: OptionValue[] = TWO_VALID_OPTIONS) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

  render(
    <Provider store={store}>
      <DialogProvider>
        <OptionsForm initialValues={{ options }} />
      </DialogProvider>
    </Provider>,
  );

  return {
    isFormValid: () => isValid(FORM)(store.getState()),
    getOptions: () => store.getState().form[FORM]?.values,
  };
};

const addNewOption = async () => {
  fireEvent.click(screen.getByRole('button', { name: /add new/i }));
  return screen.findByRole('button', { name: /finish editing option/i });
};

describe('Option', () => {
  it('keeps the editor open when finishing an option with no label or value', async () => {
    const { isFormValid } = setup();

    fireEvent.click(await addNewOption());

    expect(
      screen.getByRole('button', { name: /finish editing option/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
    expect(isFormValid()).toBe(false);
  });

  it('collapses an option that has both a label and a value', async () => {
    const { isFormValid } = setup([
      ...TWO_VALID_OPTIONS,
      { label: 'Three', value: 3 },
    ]);

    fireEvent.click(screen.getByRole('button', { name: /edit option 3/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: /finish editing option/i }),
    );

    expect(
      screen.queryByRole('button', { name: /finish editing option/i }),
    ).not.toBeInTheDocument();
    expect(isFormValid()).toBe(true);
  });

  it('shows a whitespace-only label as untitled, matching the validator', () => {
    const { isFormValid } = setup([
      ...TWO_VALID_OPTIONS,
      { label: '   ', value: 3 },
    ]);

    expect(screen.getByText('Untitled option')).toBeInTheDocument();
    expect(isFormValid()).toBe(false);
  });

  it('reports an incomplete option that was collapsed by adding another', async () => {
    const { isFormValid, getOptions } = setup();

    await addNewOption();
    await addNewOption();

    expect(
      screen.getByText('Every option needs both a label and a value.'),
    ).toBeInTheDocument();
    expect(isFormValid()).toBe(false);
    expect(getOptions()).toEqual({
      options: [...TWO_VALID_OPTIONS, {}, {}],
    });
  });
});
