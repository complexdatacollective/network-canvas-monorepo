import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  asStage,
  renderNodeConfiguration,
} from './nodeConfigurationTestHarness';

// NetworkComposer's quickAdd is a VALIDATED writer, while
// convexHullVariable writes group membership WITHOUT validation. This
// mount-level test covers both saved-document gates and the convex-hull
// field's same-draft collision with nodeForm.fields.
//
// `VariablePicker` is stubbed down to a plain input so a pick can drive the
// REAL `ArchitectField`/`Field` validation pipeline (crossClassPick runs as
// part of the field's `custom` validator, triggered on blur) — the same
// gate NodeConfiguration.tsx wires up for real, rather than capturing an
// internal validator function.
vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({
    name,
    value,
    onChange,
  }: {
    name?: string;
    value?: unknown;
    onChange?: (value: string) => void;
  }) => (
    <input
      data-testid={`picker-${name}`}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));
vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));
vi.mock('~/components/Form/arrayFields/EditableAttributesList', () => ({
  default: () => <div data-testid="attributes-list" />,
}));
vi.mock('~/components/sections/CodebookVariableValidationSection', () => ({
  default: () => <div data-testid="validation-section" />,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { NodeConfigurationComponent } from '../NodeConfiguration';

const pickAndBlur = (fieldName: string, value: string) => {
  const input = screen.getByTestId(`picker-${fieldName}`);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

// `label` is a text variable written by an AlterForm field elsewhere
// (validated, stage s1) and by a FamilyPedigree relationshipVariable (unvalidated,
// stage s2). `cat` has only the validated form use, isolating the
// convexHullVariable gate's direction.
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          cat: {
            name: 'Cat',
            type: 'categorical',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
          },
          label: { name: 'Label', type: 'text' },
        },
      },
    },
  },
  stages: [
    {
      id: 's1',
      type: 'AlterForm',
      label: 'F',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      form: {
        fields: [
          { variable: 'cat', prompt: 'P' },
          { variable: 'label', prompt: 'Q' },
        ],
      },
    },
    {
      id: 's2',
      type: 'FamilyPedigree',
      label: 'P',
      nodeConfig: { type: 'person', relationshipVariable: 'label' },
    },
  ],
};

const renderComponent = (
  protocol: unknown = PROTOCOL_WITH_FORM_CONFLICT,
  committedStage?: Record<string, unknown>,
) =>
  renderNodeConfiguration({
    protocol,
    committedStage: committedStage ? asStage(committedStage) : null,
    children: (
      <NodeConfigurationComponent
        entity="node"
        type="person"
        handleCreateVariable={() => Promise.resolve(undefined)}
        handleChangeFields={() => undefined}
      />
    ),
  });

describe('NodeConfiguration (NetworkComposer) quickAdd cross-class gate', () => {
  it('rejects a pick a bin/nomination/etc. elsewhere already writes without validation', async () => {
    renderComponent();
    pickAndBlur('quickAdd', 'label');
    expect(
      await screen.findByText(
        '"Label" is written without validation by another stage, so it cannot be used as a form field',
      ),
    ).toBeInTheDocument();
  });

  it('escapes when the pick equals the stage’s original committed value', () => {
    renderComponent(PROTOCOL_WITH_FORM_CONFLICT, { quickAdd: 'label' });
    pickAndBlur('quickAdd', 'label');
    expect(
      screen.queryByText(/is written without validation/),
    ).not.toBeInTheDocument();
  });

  it('allows a pick with no saved-document conflict', () => {
    const conflictFree = { ...PROTOCOL_WITH_FORM_CONFLICT, stages: [] };
    renderComponent(conflictFree);
    pickAndBlur('quickAdd', 'label');
    expect(
      screen.queryByText(/is written without validation/),
    ).not.toBeInTheDocument();
  });

  it('allows a pick that only a form elsewhere already validates (no unvalidated hit)', () => {
    const validatedOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[0]],
    };
    renderComponent(validatedOnly);
    pickAndBlur('quickAdd', 'label');
    expect(
      screen.queryByText(/is written without validation/),
    ).not.toBeInTheDocument();
  });
});

describe('NodeConfiguration (NetworkComposer) convexHullVariable cross-class gate', () => {
  it('rejects a pick a form elsewhere already validates', async () => {
    renderComponent();
    pickAndBlur('convexHullVariable', 'cat');
    expect(
      await screen.findByText(
        '"Cat" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
      ),
    ).toBeInTheDocument();
  });

  it('escapes when the pick equals the stage’s original committed value', () => {
    renderComponent(PROTOCOL_WITH_FORM_CONFLICT, { convexHullVariable: 'cat' });
    pickAndBlur('convexHullVariable', 'cat');
    expect(
      screen.queryByText(/is collected by a form elsewhere/),
    ).not.toBeInTheDocument();
  });

  it('rejects a collision with this stage’s live nodeForm draft', async () => {
    const conflictFree = { ...PROTOCOL_WITH_FORM_CONFLICT, stages: [] };
    const { getContext } = renderComponent(conflictFree);
    // `EditableAttributesList` (which would normally own `nodeForm.fields`)
    // is stubbed out above, so seed the live draft directly the same way its
    // array field would register it.
    act(() => {
      getContext()
        .storeApi.getState()
        .registerField({
          name: 'nodeForm',
          initialValue: {
            fields: [{ variable: 'cat', component: 'CheckboxGroup' }],
          },
        });
    });

    pickAndBlur('convexHullVariable', 'cat');

    expect(
      await screen.findByText(
        '"Cat" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
      ),
    ).toBeInTheDocument();
  });

  it('allows an unchanged pair that already existed in the committed stage', () => {
    const nodeForm = {
      fields: [{ variable: 'cat', component: 'CheckboxGroup' }],
    };
    const conflictFree = { ...PROTOCOL_WITH_FORM_CONFLICT, stages: [] };
    const { getContext } = renderComponent(conflictFree, {
      convexHullVariable: 'cat',
      nodeForm,
    });
    act(() => {
      getContext().storeApi.getState().registerField({
        name: 'nodeForm',
        initialValue: nodeForm,
      });
    });

    pickAndBlur('convexHullVariable', 'cat');

    expect(
      screen.queryByText(/is collected by a form elsewhere/),
    ).not.toBeInTheDocument();
  });
});
