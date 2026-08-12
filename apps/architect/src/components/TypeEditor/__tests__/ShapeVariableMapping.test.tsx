import { fireEvent, render, screen, within } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

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
    options = [],
    onChange,
  }: {
    options?: Array<{ label: string; value: string }>;
    onChange?: (value: string) => void;
  }) => (
    <div>
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

import type { ShapeMappingDraft } from '../shapeMappingTypes';
import ShapeVariableMapping, {
  type ShapeMappingVariable,
} from '../ShapeVariableMapping';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

type ShapeDynamic = {
  variable: string;
  type: string;
  map: Array<{ value: boolean; shape: string }>;
};

const THRESHOLD_VARIABLES: Record<string, ShapeMappingVariable> = {
  weight: { name: 'Weight', type: 'number' },
};

const THRESHOLD_MAPPING = {
  variable: 'weight',
  type: 'breakpoints',
  thresholds: [{ value: 5, shape: 'square' }],
} as ShapeMappingDraft;

const setup = ({
  variables = THRESHOLD_VARIABLES,
  initialMapping = THRESHOLD_MAPPING,
}: {
  variables?: Record<string, ShapeMappingVariable>;
  initialMapping?: ShapeMappingDraft;
} = {}) => {
  let storeApi: StoreApi | null = null;
  const CaptureStore = () => {
    storeApi = useContext(FormStoreContext) ?? null;
    return null;
  };

  render(
    <Form onSubmit={() => ({ success: true })}>
      <CaptureStore />
      <ShapeVariableMapping
        variables={variables}
        initialMapping={initialMapping}
      />
    </Form>,
  );

  const getDynamic = () =>
    (
      (storeApi?.getState().getFormValues().shape ?? {}) as {
        dynamic?: ShapeDynamic;
      }
    ).dynamic;
  const getThresholds = () =>
    (
      (storeApi?.getState().getFormValues().shape ?? {}) as {
        dynamic?: { thresholds?: Array<{ value: number; shape: string }> };
      }
    ).dynamic?.thresholds;

  return { getDynamic, getThresholds };
};

describe('ShapeVariableMapping', () => {
  it('authors a discrete mapping with raw boolean values for a Toggle variable', () => {
    const { getDynamic } = setup({
      variables: {
        is_person: { name: 'Is Person', type: 'boolean' },
      },
      // An empty mapping is what turning the feature on produces.
      initialMapping: {},
    });

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
