import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  asStage,
  renderNodeConfiguration,
} from './nodeConfigurationTestHarness';

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({
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

vi.mock('~/components/Form/arrayFields/EditableAttributesList', () => ({
  default: ({
    fieldName,
    addButtonLabel,
  }: {
    fieldName: string;
    addButtonLabel?: string;
  }) => (
    <div
      data-testid="attributes-list"
      data-fieldname={fieldName}
      data-addbuttonlabel={addButtonLabel ?? ''}
    />
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
    expect(
      screen.getByRole('heading', { name: 'Node configuration' }),
    ).toBeInTheDocument();
  });

  it('renders each field area under its own nested section heading', () => {
    renderSection();
    expect(
      screen.getByRole('heading', { name: /quick add attribute/i }),
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
    // The same stage renders one more attributes list per selected edge type
    // below this one (see EdgeConfiguration), so this button has to say which
    // list it adds to rather than share a name with all of them.
    expect(screen.getByTestId('attributes-list').dataset.addbuttonlabel).toBe(
      'Create new node attribute',
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
    expect(screen.getByText(/select a node type above/i)).toBeInTheDocument();
  });

  it('is enabled when a node type is provided', () => {
    renderSection({ type: 'person', disabled: false });
    expect(
      screen.queryByText(/select a node type above/i),
    ).not.toBeInTheDocument();
  });
});

describe('NodeConfiguration automatic-layout re-seed on subject change', () => {
  /** Stable identities: `useStageFormValue` compares by value, not identity. */
  const PERSON = { entity: 'node', type: 'person' } as const;
  const FRIEND = { entity: 'node', type: 'friend' } as const;

  const renderWithSubject = () =>
    renderSection(
      {},
      {
        committedStage: {
          subject: PERSON,
          behaviours: { automaticLayout: false },
        },
      },
    );

  const setSubject = (
    view: ReturnType<typeof renderWithSubject>,
    subject: typeof PERSON | typeof FRIEND,
  ) => {
    act(() => {
      view.getContext().storeApi.getState().setFieldValue('subject', subject);
    });
  };

  /**
   * Stands in for `useStageDraftHistory`, whose `applyDiff` writes every field
   * named in the timeline snapshot inside a single `runRestore`.
   */
  const restore = (
    view: ReturnType<typeof renderWithSubject>,
    values: Record<string, unknown>,
  ) => {
    act(() => {
      view.getContext().draft.runRestore(() => {
        const { setFieldValue } = view.getContext().storeApi.getState();
        for (const [name, value] of Object.entries(values)) {
          setFieldValue(name, value as never);
        }
      });
    });
  };

  it('turns automatic layout back on when the subject changes', () => {
    const view = renderWithSubject();
    expect(view.getFieldState('behaviours.automaticLayout')?.value).toBe(false);

    setSubject(view, FRIEND);

    expect(view.getFieldState('behaviours.automaticLayout')?.value).toBe(true);
  });

  it('keeps the automatic-layout value an undo restored alongside the subject', () => {
    const view = renderWithSubject();

    setSubject(view, FRIEND);
    restore(view, { 'subject': PERSON, 'behaviours.automaticLayout': false });

    // The restore brought the subject's own toggle state back with it;
    // observing the restored subject as "a change" must not overwrite it.
    expect(view.getFieldState('behaviours.automaticLayout')?.value).toBe(false);
  });

  it('still re-seeds on a user subject change that follows a restore', () => {
    const view = renderWithSubject();

    setSubject(view, FRIEND);
    restore(view, { 'subject': PERSON, 'behaviours.automaticLayout': false });
    setSubject(view, FRIEND);

    expect(view.getFieldState('behaviours.automaticLayout')?.value).toBe(true);
  });

  it('still re-seeds on a user subject change after a restore that left the subject alone', () => {
    const view = renderWithSubject();

    // A restore of some other field bumps the same counter, so the guard has
    // to be consumed even when `subject` did not move.
    restore(view, { 'behaviours.automaticLayout': false });
    setSubject(view, FRIEND);

    expect(view.getFieldState('behaviours.automaticLayout')?.value).toBe(true);
  });
});
