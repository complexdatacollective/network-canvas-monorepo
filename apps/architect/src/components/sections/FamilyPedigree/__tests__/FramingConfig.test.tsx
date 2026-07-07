import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

const mockDispatch = vi.fn();
const mockChange = vi.fn(
  (form: string, field: string, value: unknown) =>
    ({ type: 'redux-form/CHANGE', form, field, value }) as const,
);

let mockFramingValue: { mode: string; value?: string } | undefined = {
  mode: 'fixed',
  value: 'gamete',
};

vi.mock('redux-form', () => ({
  change: (form: string, field: string, value: unknown) =>
    mockChange(form, field, value),
  formValueSelector: () => () => mockFramingValue,
}));

vi.mock('react-redux', async () => {
  const actual =
    await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useSelector: (selector: (state: unknown) => unknown) => selector({}),
    useDispatch: () => mockDispatch,
  };
});

vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Section: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

vi.mock('~/components/IssueAnchor', () => ({
  default: () => null,
}));

vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({
    name,
    component: Component,
  }: {
    name: string;
    component: React.ComponentType<Record<string, unknown>>;
  }) => (
    <Component
      name={name}
      input={{ value: '', onChange: vi.fn(), name }}
      meta={{}}
    />
  ),
}));

vi.mock('~/components/Form/Fields/RadioGroup', () => ({
  default: ({
    options,
    input,
  }: {
    options: { value: string; label: string }[];
    input: { value: string; name: string; onChange: (v: unknown) => void };
  }) => (
    <div data-testid="radio-group">
      {options.map((opt) => (
        <button
          key={opt.value}
          data-testid={`radio-${opt.value}`}
          aria-pressed={input.value === opt.value}
          onClick={() => input.onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('~/components/Form/Fields/NativeSelect', () => ({
  default: ({
    options,
    input,
  }: {
    options: { value: string; label: string }[];
    input: {
      value: string;
      name: string;
      onChange: (v: string | null) => void;
    };
  }) => (
    <select
      data-testid="native-select"
      value={input.value}
      onChange={(e) => input.onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

import FramingConfig from '../FramingConfig';

const renderSection = (form = 'edit-stage') => {
  const store = configureStore({ reducer: { noop: () => ({}) } });
  return render(
    <Provider store={store}>
      <FramingConfig
        form={form}
        stagePath={null}
        interfaceType="FamilyPedigree"
      />
    </Provider>,
  );
};

describe('FramingConfig', () => {
  it('renders the radio group when framing mode is fixed', () => {
    mockFramingValue = { mode: 'fixed', value: 'gamete' };
    renderSection();
    expect(screen.getByTestId('radio-group')).toBeDefined();
  });

  it('renders the fixed value select when mode is fixed', () => {
    mockFramingValue = { mode: 'fixed', value: 'gamete' };
    renderSection();
    expect(screen.getByRole('combobox', { hidden: true })).toBeDefined();
  });

  it('does not render the fixed value select when mode is participantChoice', () => {
    mockFramingValue = { mode: 'participantChoice' };
    renderSection();
    expect(screen.queryByRole('combobox', { hidden: true })).toBeNull();
  });

  it('dispatches change to participantChoice when that radio is clicked', () => {
    mockFramingValue = { mode: 'fixed', value: 'gamete' };
    mockDispatch.mockClear();
    mockChange.mockClear();
    renderSection();

    fireEvent.click(screen.getByTestId('radio-participantChoice'));

    expect(mockDispatch).toHaveBeenCalled();
    expect(mockChange).toHaveBeenCalledWith('edit-stage', 'framing', {
      mode: 'participantChoice',
    });
  });

  it('dispatches change to fixed with gamete default when that radio is clicked', () => {
    mockFramingValue = { mode: 'participantChoice' };
    mockDispatch.mockClear();
    mockChange.mockClear();
    renderSection();

    fireEvent.click(screen.getByTestId('radio-fixed'));

    expect(mockDispatch).toHaveBeenCalled();
    expect(mockChange).toHaveBeenCalledWith('edit-stage', 'framing', {
      mode: 'fixed',
      value: 'gamete',
    });
  });

  it('dispatches change to framing.value when a fixed value is selected', () => {
    mockFramingValue = { mode: 'fixed', value: 'gamete' };
    mockDispatch.mockClear();
    mockChange.mockClear();
    renderSection();

    fireEvent.change(screen.getByTestId('native-select'), {
      target: { value: 'gendered' },
    });

    expect(mockDispatch).toHaveBeenCalled();
    expect(mockChange).toHaveBeenCalledWith(
      'edit-stage',
      'framing.value',
      'gendered',
    );
  });
});
