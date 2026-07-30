import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import { reducer as formReducer, reduxForm } from 'redux-form';
import { describe, expect, it } from 'vitest';

import DatePicker from '../DatePicker';

const DatePickerParametersField = DatePicker as unknown as ComponentType<{
  name: string;
  form: string;
}>;

const FORM = 'date-picker-parameters-test';

const Harness = reduxForm({ form: FORM })(() => (
  <DatePickerParametersField name="parameters" form={FORM} />
));

const renderParameters = (min: string) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <Harness initialValues={{ parameters: { type: 'full', min } }} />
    </Provider>,
  );

  return screen.getByLabelText(/End range/);
};

const RANGE_ERROR = 'End date must not be before start date';
// Absence assertions match ANY range complaint, so they still fail against the
// stricter message this replaced rather than silently passing on its wording.
const ANY_RANGE_ERROR = /start date/;

// Audit sweep: the protocol schema only rejects `min > max`, so a collapsed
// single-day window (`min === max`) is legal — and it is exactly the shape the
// contradiction analyser reasons about when it pins such a variable to one
// value. Gating the editor with a strict `greaterThan` refused to author the
// very configuration the analyser understands.
describe('DatePicker range parameters', () => {
  it('accepts an end range equal to the start range', async () => {
    const max = renderParameters('2024-06-15');

    fireEvent.change(max, { target: { value: '2024-06-15' } });
    fireEvent.blur(max);

    await waitFor(() => {
      expect(screen.queryByText(ANY_RANGE_ERROR)).not.toBeInTheDocument();
    });
  });

  it('still rejects an end range before the start range', async () => {
    const max = renderParameters('2024-06-15');

    fireEvent.change(max, { target: { value: '2024-06-14' } });
    fireEvent.blur(max);

    await waitFor(() => {
      expect(screen.getByText(RANGE_ERROR)).toBeInTheDocument();
    });
  });

  it('clears the error once the end range reaches the start range', async () => {
    const max = renderParameters('2024-06-15');

    fireEvent.change(max, { target: { value: '2024-06-14' } });
    fireEvent.blur(max);
    await waitFor(() => {
      expect(screen.getByText(RANGE_ERROR)).toBeInTheDocument();
    });

    fireEvent.change(max, { target: { value: '2024-06-15' } });
    await waitFor(() => {
      expect(screen.queryByText(ANY_RANGE_ERROR)).not.toBeInTheDocument();
    });
  });
});
