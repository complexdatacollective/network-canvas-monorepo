import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { reducer as formReducer, reduxForm } from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../ShapePicker', () => ({
  ShapePickerControl: ({
    'aria-label': ariaLabel,
    value,
    onChange,
  }: {
    'aria-label'?: string;
    'value'?: string;
    'onChange'?: (value: string) => void;
  }) => (
    <div aria-label={ariaLabel}>
      {['Circle', 'Square', 'Diamond'].map((label) => {
        const shape = label.toLowerCase();
        return (
          <button
            key={shape}
            type="button"
            aria-label={`Select shape ${label}`}
            aria-pressed={value === shape}
            onClick={() => onChange?.(shape)}
          >
            shape
          </button>
        );
      })}
    </div>
  ),
  SHAPES: [
    { value: 'circle', label: 'Circle' },
    { value: 'square', label: 'Square' },
    { value: 'diamond', label: 'Diamond' },
  ],
}));

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({
    label,
    options = [],
    onChange,
  }: {
    label?: string;
    options?: Array<{ label: string; value: string }>;
    onChange?: (value: string) => void;
  }) => (
    <div>
      {label}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange?.(option.value)}
        >
          Select {option.label}
        </button>
      ))}
    </div>
  ),
}));

import ShapeVariableMapping from '../ShapeVariableMapping';

const FORM = 'shape-variable-mapping-test';

type FormValues = Record<string, unknown>;

type ShapeDynamic = {
  variable: string;
  type: string;
  map: Array<{ value: boolean; shape: string }>;
};

const Harness = () => <ShapeVariableMapping form={FORM} />;

const ReduxHarness = reduxForm<FormValues>({ form: FORM })(Harness);

const thresholdInitialValues = {
  variables: { weight: { name: 'Weight', type: 'number' } },
  shape: {
    dynamic: {
      variable: 'weight',
      type: 'breakpoints',
      thresholds: [{ value: 5, shape: 'square' }],
    },
  },
};

const setup = (initialValues: FormValues = thresholdInitialValues) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <ReduxHarness initialValues={initialValues} />
    </Provider>,
  );

  const getDynamic = () =>
    store.getState().form[FORM]?.values?.shape?.dynamic as
      | ShapeDynamic
      | undefined;
  const getThresholds = () =>
    store.getState().form[FORM]?.values?.shape?.dynamic?.thresholds as
      | Array<{ value: number; shape: string }>
      | undefined;

  return { getDynamic, getThresholds };
};

describe('ShapeVariableMapping', () => {
  it('authors a discrete mapping with raw boolean values for a Toggle variable', () => {
    const { getDynamic } = setup({
      variables: {
        is_person: {
          name: 'Is Person',
          type: 'boolean',
          component: 'Toggle',
        },
      },
      shape: { default: 'square' },
    });

    fireEvent.click(
      screen.getByRole('switch', { name: 'Map variable to shape' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select Is Person' }));

    const trueLabel = screen.getByText('True');
    const trueRow = trueLabel.parentElement;
    if (!trueRow) throw new Error('Expected a row for the true boolean value');

    expect(screen.getByText('False')).toBeInTheDocument();
    fireEvent.click(
      within(trueRow).getByRole('button', { name: 'Select shape Circle' }),
    );

    expect(getDynamic()).toEqual({
      variable: 'is_person',
      type: 'discrete',
      map: [{ value: true, shape: 'circle' }],
    });
    expect(typeof getDynamic()?.map[0]?.value).toBe('boolean');
  });

  it('can clear a threshold without snapping back to the committed value', () => {
    const { getThresholds } = setup();
    const input = screen.getByRole('spinbutton', { name: 'Threshold 1 value' });

    expect(input).toHaveValue(5);

    fireEvent.change(input, { target: { value: '' } });

    expect(input).toHaveValue(null);
    expect(getThresholds()?.[0]?.value).toBe(5);
  });

  it('commits a decimal threshold typed into the field on blur', () => {
    const { getThresholds } = setup();
    const input = screen.getByRole('spinbutton', { name: 'Threshold 1 value' });

    fireEvent.change(input, { target: { value: '0.5' } });
    expect(input).toHaveValue(0.5);
    // The value commits on blur so the list does not re-sort mid-keystroke.
    expect(getThresholds()?.[0]?.value).toBe(5);

    fireEvent.blur(input);
    expect(getThresholds()?.[0]?.value).toBe(0.5);
  });

  it('adds a threshold up to the shape-derived cap and removes it', () => {
    const { getThresholds } = setup();
    expect(getThresholds()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /add threshold/i }));
    expect(getThresholds()).toHaveLength(2);

    // Three shapes → at most two thresholds, so the add control disappears.
    expect(
      screen.queryByRole('button', { name: /add threshold/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove threshold 2' }));
    expect(getThresholds()).toHaveLength(1);
  });

  it('keeps thresholds sorted ascending after editing on blur', () => {
    const { getThresholds } = setup();

    fireEvent.click(screen.getByRole('button', { name: /add threshold/i }));
    const inputs = screen.getAllByRole('spinbutton');
    // Give the first row a value greater than the second, then blur.
    fireEvent.change(inputs[0]!, { target: { value: '9' } });
    fireEvent.blur(inputs[0]!);

    const values = getThresholds()?.map((t) => t.value);
    expect(values).toEqual([...(values ?? [])].toSorted((a, b) => a - b));
  });
});
