import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Section: ({
    children,
    title,
    disabled,
  }: {
    children: ReactNode;
    title?: string;
    disabled?: boolean;
  }) => (
    <div data-testid="section" data-disabled={disabled ? 'true' : 'false'}>
      {title && <h2>{title}</h2>}
      {children}
    </div>
  ),
}));

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  default: () => <div data-testid="variable-picker" />,
}));

vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({
    name,
  }: {
    name: string;
    component: unknown;
    componentProps: unknown;
    validation?: unknown;
  }) => <div data-testid={`field-${name}`} />,
}));

vi.mock('~/components/IssueAnchor', () => ({
  default: () => null,
}));

vi.mock('~/components/Form/Fields/CheckboxGroup', () => ({
  default: () => <div data-testid="checkbox-group" />,
}));

vi.mock('redux-form', () => ({
  Field: ({
    name,
  }: {
    name: string;
    component: unknown;
    [key: string]: unknown;
  }) => <div data-testid={`field-${name}`} />,
  FormSection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  reduxForm: () => (Component: unknown) => Component,
  formValueSelector: () => () => null,
  change: vi.fn(),
  SubmissionError: class SubmissionError extends Error {},
}));

vi.mock('~/components/EditableAttributesList/EditableAttributesList', () => ({
  default: ({
    fieldName,
  }: {
    fieldName: string;
    entity: string;
    type: string | null;
    form: string;
    editFormName: string;
    title: string;
    handleChangeFields: unknown;
  }) => <div data-testid="attributes-list" data-fieldname={fieldName} />,
}));

import { NodeConfigurationComponent } from '../NodeConfiguration';

const defaultProps = {
  form: 'edit-stage',
  stagePath: 'stages[0]',
  interfaceType: 'NetworkComposer' as const,
  entity: 'node' as const,
  type: 'person',
  disabled: false,
  handleCreateVariable: vi.fn(),
  handleChangeFields: vi.fn(),
  layoutVariablesForSubject: [],
  categoricalVariablesForSubject: [],
};

const renderSection = (overrides: Partial<typeof defaultProps> = {}) =>
  render(<NodeConfigurationComponent {...defaultProps} {...overrides} />);

describe('NodeConfiguration', () => {
  it('renders the section title', () => {
    renderSection();
    expect(
      screen.getByRole('heading', { name: /node configuration/i }),
    ).toBeDefined();
  });

  it('renders node config fields and the editable attributes list', () => {
    renderSection({ type: 'person', entity: 'node' });
    expect(screen.getByTestId('field-quickAdd')).toBeInTheDocument();
    expect(screen.getByTestId('field-layoutVariable')).toBeInTheDocument();
    expect(screen.getByTestId('attributes-list').dataset.fieldname).toBe(
      'nodeForm.fields',
    );
  });

  it('renders the automatic layout toggle inside behaviours FormSection', () => {
    renderSection();
    expect(screen.getByTestId('field-automaticLayout')).toBeInTheDocument();
  });

  it('renders the convexHulls field', () => {
    renderSection();
    expect(screen.getByTestId('field-convexHulls')).toBeInTheDocument();
  });

  it('is disabled until a node type is selected', () => {
    renderSection({ type: null, entity: 'node', disabled: true });
    expect(screen.getByTestId('section')).toHaveAttribute(
      'data-disabled',
      'true',
    );
  });

  it('is enabled when a node type is provided', () => {
    renderSection({ type: 'person', disabled: false });
    expect(screen.getByTestId('section')).toHaveAttribute(
      'data-disabled',
      'false',
    );
  });
});
