import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

import ValidatedField from '~/components/Form/ValidatedField';

import { SkipLogicRadioGroupReduxField } from '../SkipLogicReduxFields';

type FormValues = {
  action?: 'SHOW' | 'SKIP';
};

const Harness = (_props: InjectedFormProps<FormValues>) => (
  <ValidatedField
    name="action"
    component={SkipLogicRadioGroupReduxField}
    validation={{ required: true }}
    componentProps={{
      label: 'When the rules match',
      options: [
        { value: 'SHOW', label: 'Show this stage' },
        { value: 'SKIP', label: 'Skip this stage' },
      ],
    }}
  />
);

const ReduxHarness = reduxForm<FormValues>({ form: 'skip-action' })(Harness);

describe('SkipLogicRadioGroupReduxField', () => {
  it('provides accessible Fresco semantics and writes through Redux Form', () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    render(
      <Provider store={store}>
        <ReduxHarness initialValues={{ action: 'SHOW' }} />
      </Provider>,
    );

    expect(
      screen.getByRole('radiogroup', { name: 'When the rules match' }),
    ).toBeVisible();
    expect(
      screen.getByRole('radio', { name: 'Show this stage' }),
    ).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Skip this stage' }));
    fireEvent.blur(
      screen.getByRole('radiogroup', { name: 'When the rules match' }),
    );

    expect(
      store.getState().form['skip-action']?.values as FormValues,
    ).toMatchObject({ action: 'SKIP' });
  });
});
