import { fireEvent, render, screen } from '@testing-library/react';
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

// Record the props passed to the window so the test can assert the create
// button opens it with a categorical initial variable type.
const newVariableWindowSpy = vi.fn();
vi.mock('~/components/NewVariableWindow', () => ({
  default: (props: Record<string, unknown>) => {
    newVariableWindowSpy(props);
    return <div data-testid="new-variable-window" />;
  },
  useNewVariableWindowState: (
    initialProps: Record<string, unknown>,
    onComplete: (...args: unknown[]) => void,
  ) => {
    const openWindow = (
      newProps: { initialValues: { name: string; type: string } },
      newMeta: { field: string },
    ) => {
      openWindowSpy({ initialProps, newProps, newMeta });
      // Simulate a created variable so the append path is exercised.
      onComplete('created-var-id', newMeta);
    };
    return [{ ...initialProps }, openWindow] as const;
  },
}));

type OpenWindowCall = {
  initialProps: Record<string, unknown>;
  newProps: { initialValues: { name: string; type: string } };
  newMeta: { field: string };
};
const openWindowSpy = vi.fn<(call: OpenWindowCall) => void>();

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
  formValueSelector: () => (_state: unknown, field: string) => {
    if (field === 'convexHulls') return ['existing-hull-var'];
    // Mirrors redux-form: selecting a node type resets `behaviours` to null, and
    // a path under a null parent resolves to null (NOT undefined).
    if (field === 'behaviours.automaticLayout') return null;
    return undefined;
  },
  change: (form: string, field: string, value: unknown) => ({
    type: 'CHANGE',
    form,
    field,
    value,
  }),
  SubmissionError: class SubmissionError extends Error {},
}));

type ChangeAction = {
  type: string;
  form: string;
  field: string;
  value: unknown;
};
const dispatchSpy = vi.fn<(action: ChangeAction) => void>();
vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => dispatchSpy,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('~/lib/legacy-ui/components/Button', () => ({
  default: ({
    children,
    onClick,
  }: {
    children?: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
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
  quickAddOptionsForSubject: [],
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

  it('renders each field area under its own subsection heading', () => {
    renderSection();
    expect(
      screen.getByRole('heading', { name: /quick add variable/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /node positions/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /automatic layout/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /group hulls/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /editable attributes/i }),
    ).toBeInTheDocument();
    // Five field areas -> five subsections.
    expect(screen.getAllByTestId('subsection')).toHaveLength(5);
  });

  it('renders node config fields and the editable attributes list', () => {
    renderSection({ type: 'person', entity: 'node' });
    expect(screen.getByTestId('field-quickAdd')).toBeInTheDocument();
    expect(screen.getByTestId('field-layoutVariable')).toBeInTheDocument();
    expect(screen.getByTestId('attributes-list').dataset.fieldname).toBe(
      'nodeForm.fields',
    );
  });

  it('renders the automatic layout toggle and seeds the on-by-default value', () => {
    dispatchSpy.mockClear();
    renderSection();
    expect(
      screen.getByText(/start with automatic layout switched on/i),
    ).toBeInTheDocument();
    // With behaviours.automaticLayout unset in form state, the section seeds the
    // template default (on) so a gated remount can't leave it off.
    const seeded = dispatchSpy.mock.calls
      .map(([action]) => action)
      .find((action) => action.field === 'behaviours.automaticLayout');
    expect(seeded?.value).toBe(true);
  });

  it('renders the convexHulls field', () => {
    renderSection();
    expect(screen.getByTestId('field-convexHulls')).toBeInTheDocument();
  });

  it('renders the NewVariableWindow within the section', () => {
    renderSection();
    expect(screen.getByTestId('new-variable-window')).toBeInTheDocument();
  });

  it('opens the categorical variable editor from the group-hulls create button', () => {
    openWindowSpy.mockClear();
    renderSection();

    fireEvent.click(
      screen.getByRole('button', { name: /create categorical variable/i }),
    );

    expect(openWindowSpy).toHaveBeenCalledTimes(1);
    const call = openWindowSpy.mock.calls[0]![0];
    expect(call.newProps.initialValues.type).toBe('categorical');
    expect(call.newMeta.field).toBe('convexHulls');
  });

  it('appends the created group variable id to the convexHulls array', () => {
    renderSection();
    // Ignore the mount-time automatic-layout default seed; isolate the click.
    dispatchSpy.mockClear();

    fireEvent.click(
      screen.getByRole('button', { name: /create categorical variable/i }),
    );

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0]![0];
    expect(action.field).toBe('convexHulls');
    expect(action.value).toEqual(['existing-hull-var', 'created-var-id']);
  });

  it('is disabled until a node type is selected', () => {
    renderSection({ type: undefined, entity: 'node', disabled: true });
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
