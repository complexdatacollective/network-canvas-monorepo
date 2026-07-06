import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import { INHERITANCE_PATTERNS } from '@codaco/shared-consts';

let mockBooleanVariables: { value: string; label: string; type: string }[] = [];
let mockColorValue: string | undefined = undefined;

vi.mock('react-redux', async () => {
  const actual =
    await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useSelector: (selector: (state: unknown) => unknown) => {
      const result = selector({});
      if (Array.isArray(result)) return mockBooleanVariables;
      return mockColorValue;
    },
  };
});

vi.mock('redux-form', () => ({
  formValueSelector: () => () => mockColorValue,
  Field: ({ name }: { name: string; component: unknown }) => (
    <div data-testid={`field-${name}`} />
  ),
}));

vi.mock('~/selectors/codebook', () => ({
  getVariableOptionsForSubject: () => [
    { value: 'var-1', label: 'Affected', type: 'boolean' },
    { value: 'var-2', label: 'Carrier', type: 'boolean' },
    { value: 'var-3', label: 'Age', type: 'number' },
  ],
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

vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({
    name,
    componentProps,
  }: {
    name: string;
    componentProps?: {
      label?: string;
      options?: { value: string; label: string }[];
    };
  }) => (
    <div data-testid={`field-${name}`}>
      {componentProps?.label && <span>{componentProps.label}</span>}
      {componentProps?.options?.map((o) => (
        <span key={o.value} data-testid={`option-${o.value}`}>
          {o.label}
        </span>
      ))}
    </div>
  ),
}));

vi.mock('~/components/IssueAnchor', () => ({
  default: () => null,
}));

vi.mock('~/components/Form/Fields/ColorPicker', () => ({
  default: () => <div data-testid="color-picker" />,
}));

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  default: () => <div data-testid="variable-picker" />,
}));

import DiseaseFields from '../DiseaseFields';

const renderFields = (nodeType = 'node-type-1') => {
  const store = configureStore({ reducer: { noop: () => ({}) } });
  return render(
    <Provider store={store}>
      <DiseaseFields nodeType={nodeType} />
    </Provider>,
  );
};

describe('DiseaseFields', () => {
  it('renders the Disease Label section', () => {
    renderFields();
    expect(screen.getByText('Disease Label')).toBeDefined();
  });

  it('renders the label field', () => {
    renderFields();
    expect(screen.getByTestId('field-label')).toBeDefined();
  });

  it('renders the Color section', () => {
    renderFields();
    expect(screen.getByText('Color')).toBeDefined();
  });

  it('renders the color field', () => {
    renderFields();
    expect(screen.getByTestId('field-color')).toBeDefined();
  });

  it('renders the Node Variable section', () => {
    renderFields();
    expect(screen.getByText('Node Variable')).toBeDefined();
  });

  it('renders the variable field', () => {
    renderFields();
    expect(screen.getByTestId('field-variable')).toBeDefined();
  });

  it('renders the Inheritance Pattern section', () => {
    renderFields();
    expect(screen.getByText('Inheritance Pattern')).toBeDefined();
  });

  it('renders all INHERITANCE_PATTERNS as options', () => {
    renderFields();
    const field = screen.getByTestId('field-inheritancePattern');
    for (const pattern of INHERITANCE_PATTERNS) {
      expect(
        field.querySelector(`[data-testid="option-${pattern}"]`),
      ).toBeDefined();
    }
  });
});
