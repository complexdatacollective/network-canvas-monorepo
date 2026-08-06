import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  asStage,
  renderNodeConfiguration,
} from './nodeConfigurationTestHarness';

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  default: ({
    name,
    onCreateOption,
  }: {
    name?: string;
    onCreateOption?: (value: string) => void;
  }) => (
    <div data-testid={`field-${name}`}>
      {onCreateOption && (
        <button type="button" onClick={() => onCreateOption(`new-${name}`)}>
          create option for {name}
        </button>
      )}
    </div>
  ),
}));

// Record the props passed to the window so the test can assert the picker's
// create option opens it with a categorical initial variable type.
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
      // Simulate a created variable so the set path is exercised.
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

vi.mock('~/components/EditableAttributesList/EditableAttributesList', () => ({
  default: ({ fieldName }: { fieldName: string }) => (
    <div data-testid="attributes-list" data-fieldname={fieldName} />
  ),
}));

// CodebookVariableValidationSection pulls in ValidationSection's own
// `~/components/Validations` import chain, which belongs to a different,
// still-in-flight batch — stub it out rather than depend on that chain
// resolving.
vi.mock('~/components/sections/CodebookVariableValidationSection', () => ({
  default: () => <div data-testid="validation-section" />,
}));

import { NodeConfigurationComponent } from '../NodeConfiguration';

const PROTOCOL = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {},
      },
    },
  },
  stages: [],
};

const defaultProps = {
  entity: 'node' as const,
  type: 'person',
  disabled: false,
  handleCreateVariable: vi.fn(),
  handleChangeFields: vi.fn(),
};

const renderSection = (
  overrides: Partial<typeof defaultProps> = {},
  options: {
    protocol?: unknown;
    committedStage?: Record<string, unknown>;
  } = {},
) =>
  renderNodeConfiguration({
    protocol: options.protocol ?? PROTOCOL,
    committedStage: asStage(options.committedStage ?? {}),
    children: <NodeConfigurationComponent {...defaultProps} {...overrides} />,
  });

describe('NodeConfiguration', () => {
  it('renders the section title', () => {
    renderSection();
    // `Section`'s title renders as a styled span rather than a heading
    // element (unlike `Subsection`, which uses a real `<h3>`).
    expect(screen.getByText('Node Configuration')).toBeInTheDocument();
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
  });

  it('renders node config fields and the editable attributes list', () => {
    renderSection({ type: 'person', entity: 'node' });
    expect(screen.getByTestId('field-quickAdd')).toBeInTheDocument();
    expect(screen.getByTestId('field-layoutVariable')).toBeInTheDocument();
    expect(screen.getByTestId('attributes-list').dataset.fieldname).toBe(
      'nodeForm.fields',
    );
  });

  it('creates quick-add variables with required validation', () => {
    const handleCreateVariable = vi.fn();
    renderSection({ handleCreateVariable });

    fireEvent.click(
      screen.getByRole('button', {
        name: /create option for quickAdd/i,
      }),
    );

    expect(handleCreateVariable).toHaveBeenCalledWith(
      'new-quickAdd',
      'text',
      'quickAdd',
      { required: true },
    );
  });

  it('defaults automatic layout to on when the committed stage has no value', () => {
    renderSection();
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('honours an off automatic layout value committed on the stage', () => {
    renderSection(
      {},
      { committedStage: { behaviours: { automaticLayout: false } } },
    );
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('renders the convexHullVariable field', () => {
    renderSection();
    expect(screen.getByTestId('field-convexHullVariable')).toBeInTheDocument();
  });

  it('renders the NewVariableWindow within the section', () => {
    renderSection();
    expect(screen.getByTestId('new-variable-window')).toBeInTheDocument();
  });

  it('opens the categorical variable editor from the group-hulls picker', () => {
    openWindowSpy.mockClear();
    renderSection();

    fireEvent.click(
      screen.getByRole('button', {
        name: /create option for convexHullVariable/i,
      }),
    );

    expect(openWindowSpy).toHaveBeenCalledTimes(1);
    const call = openWindowSpy.mock.calls[0]![0];
    expect(call.newProps.initialValues.type).toBe('categorical');
    expect(call.newProps.initialValues.name).toBe('new-convexHullVariable');
    expect(call.newMeta.field).toBe('convexHullVariable');
  });

  it('sets the created group variable id as convexHullVariable', () => {
    const { getFieldState } = renderSection();

    fireEvent.click(
      screen.getByRole('button', {
        name: /create option for convexHullVariable/i,
      }),
    );

    expect(getFieldState('convexHullVariable')?.value).toBe('created-var-id');
  });

  it('is disabled until a node type is selected', () => {
    renderSection({ type: undefined, entity: 'node', disabled: true });
    expect(
      screen.getByText(/complete the required options above/i),
    ).toBeInTheDocument();
  });

  it('is enabled when a node type is provided', () => {
    renderSection({ type: 'person', disabled: false });
    expect(
      screen.queryByText(/complete the required options above/i),
    ).not.toBeInTheDocument();
  });
});
