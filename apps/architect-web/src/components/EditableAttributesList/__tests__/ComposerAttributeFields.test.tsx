import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/EditorLayout', () => ({
  Section: ({ children }: { children: ReactNode }) => (
    <div data-testid="section">{children}</div>
  ),
  Subsection: ({
    children,
    title,
  }: {
    children: ReactNode;
    title?: ReactNode;
  }) => (
    <section data-testid="subsection">
      {title && <h3>{title}</h3>}
      {children}
    </section>
  ),
}));

// Surface each rendered field's `name` so the test can assert which fields
// exist (variable, component) and which do not (prompt, hint, showValidationHints).
vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid={`field-${name}`} />
  ),
}));

vi.mock('~/components/Form/Fields/NativeSelect', () => ({
  default: () => <div data-testid="native-select" />,
}));
vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  default: () => <div data-testid="variable-picker" />,
}));
vi.mock('~/components/Form/Fields/InputPreview', () => ({
  default: () => <div data-testid="input-preview" />,
}));
vi.mock('~/components/Options', () => ({
  default: () => <div data-testid="options" />,
}));
vi.mock('~/components/Parameters', () => ({
  default: () => <div data-testid="parameters" />,
}));
vi.mock('~/components/BooleanChoice', () => ({
  default: () => <div data-testid="boolean-choice" />,
}));
vi.mock('~/components/Tip', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/components/ExternalLink', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const fieldHandlers = {
  variable: 'age',
  variableType: 'categorical',
  isNewVariable: false,
  variableOptions: [],
  component: 'RadioGroup',
  componentOptions: [],
  metaForType: { label: 'Radio Group' },
  handleNewVariable: vi.fn(),
  handleChangeVariable: vi.fn(),
  handleChangeComponent: vi.fn(),
};
vi.mock('~/components/sections/Form/withFieldsHandlers', () => ({
  useFieldHandlers: () => fieldHandlers,
}));

import ComposerAttributeFields from '../ComposerAttributeFields';

describe('ComposerAttributeFields', () => {
  it('renders the variable and input-control fields', () => {
    render(
      <ComposerAttributeFields form="attr-edit" entity="node" type="person" />,
    );
    expect(screen.getByTestId('field-variable')).toBeInTheDocument();
    expect(screen.getByTestId('field-component')).toBeInTheDocument();
  });

  it('renders control-specific options for a categorical variable', () => {
    render(
      <ComposerAttributeFields form="attr-edit" entity="node" type="person" />,
    );
    expect(screen.getByTestId('options')).toBeInTheDocument();
  });

  it('does not render prompt, hint, or validation fields', () => {
    render(
      <ComposerAttributeFields form="attr-edit" entity="node" type="person" />,
    );
    expect(screen.queryByTestId('field-prompt')).toBeNull();
    expect(screen.queryByTestId('field-hint')).toBeNull();
    expect(screen.queryByRole('heading', { name: /question/i })).toBeNull();
    expect(
      screen.queryByRole('heading', { name: /show validation hints/i }),
    ).toBeNull();
  });
});
