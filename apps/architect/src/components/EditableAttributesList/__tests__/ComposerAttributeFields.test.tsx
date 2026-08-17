import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

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
vi.mock('~/components/Form/ArchitectField', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid={`field-${name}`} />
  ),
}));
vi.mock('~/components/Form/ArchitectArrayField', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid={`field-${name}`} />
  ),
}));

vi.mock('~/components/Form/arrayFields/Options', () => ({
  default: () => <div data-testid="options" />,
  optionsValidation: {},
}));
vi.mock('~/components/Parameters', () => ({
  default: () => <div data-testid="parameters" />,
}));
vi.mock('~/components/BooleanChoice', () => ({
  default: () => <div data-testid="boolean-choice" />,
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
  existingVariables: {},
  handleNewVariable: vi.fn(),
};
vi.mock('~/components/sections/Form/withFieldsHandlers', () => ({
  useFieldHandlers: () => fieldHandlers,
  CREATE_NEW_VARIABLE_FIELD: '_createNewVariable',
  HiddenFieldValue: () => null,
}));

import ComposerAttributeFields from '../ComposerAttributeFields';

const renderFields = () =>
  render(
    <Form onSubmit={() => ({ success: true })}>
      <ComposerAttributeFields entity="node" type="person" />
    </Form>,
  );

describe('ComposerAttributeFields', () => {
  it('renders the variable, label, and input-control fields', () => {
    renderFields();
    expect(screen.getByTestId('field-variable')).toBeInTheDocument();
    expect(screen.getByTestId('field-label')).toBeInTheDocument();
    expect(screen.getByTestId('field-component')).toBeInTheDocument();
  });

  it('renders control-specific options for a categorical variable', () => {
    renderFields();
    expect(screen.getByTestId('field-options')).toBeInTheDocument();
  });

  it('does not render prompt, hint, or validation fields', () => {
    renderFields();
    expect(screen.queryByTestId('field-prompt')).toBeNull();
    expect(screen.queryByTestId('field-hint')).toBeNull();
    expect(screen.queryByRole('heading', { name: /question/i })).toBeNull();
    expect(
      screen.queryByRole('heading', { name: /show validation hints/i }),
    ).toBeNull();
  });
});
