import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { Provider } from 'react-redux';
import { SubmissionError } from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

// Bypasses redux-form's real FieldArray (which needs a reduxForm()-wrapped
// ancestor SociogramPrompts does not provide on its own) and captures the
// `onBeforeSave` componentProp for direct invocation — the same
// capture-a-handler-prop idiom
// FamilyPedigree/__tests__/NodeConfigurationHandlers.test.tsx uses for this
// app's other DialogArrayField-backed sections.
vi.mock('~/components/Form/ValidatedFieldArray', () => ({
  default: ({
    component,
    componentProps,
  }: {
    component: ComponentType<Record<string, unknown>>;
    componentProps?: Record<string, unknown>;
  }) => createElement(component, componentProps),
}));

let capturedOnBeforeSave: ((value: unknown) => unknown) | undefined;
vi.mock('~/components/Form/DialogArrayField', () => ({
  default: ({
    onBeforeSave,
  }: {
    onBeforeSave: (value: unknown) => unknown;
  }) => {
    capturedOnBeforeSave = onBeforeSave;
    return <div data-testid="dialog-array-field" />;
  },
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import SociogramPrompts from '../SociogramPrompts';

// `flagged` mirrors the pickerExclusions.test.ts/roleMap.test.ts fixture
// shape: written both by a form field (validated, stage s1) and — here — the
// sociogram's own highlight toggle (unvalidated, stage s2).
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          flagged: { name: 'Flagged', type: 'boolean' },
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
      form: { fields: [{ variable: 'flagged', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'Sociogram',
      label: 'S',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'T',
          layout: { layoutVariable: 'layoutVar' },
          highlight: { allowHighlighting: true, variable: 'flagged' },
        },
      ],
    },
  ],
};

const renderWithStore = (
  protocol: unknown,
  editFormInitial?: Record<string, unknown>,
): ((value: unknown) => unknown) => {
  capturedOnBeforeSave = undefined;
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: protocol }) => state,
      form: (
        state = {
          'edit-stage': {
            values: { subject: { entity: 'node', type: 'person' } },
          },
          ...(editFormInitial
            ? { 'editable-list-form': { initial: editFormInitial } }
            : {}),
        },
      ) => state,
    },
  });
  render(
    <Provider store={store}>
      <SociogramPrompts
        form="edit-stage"
        stagePath="stages[0]"
        stagePosition={0}
        interfaceType="Sociogram"
      />
    </Provider>,
  );
  expect(screen.getByTestId('dialog-array-field')).toBeInTheDocument();
  // Read into a local const: `capturedOnBeforeSave` is reassigned by the
  // mocked DialogArrayField closure above, so TS cannot narrow the outer
  // `let` itself past `undefined` here even after this guard.
  const onBeforeSave = capturedOnBeforeSave;
  if (!onBeforeSave) {
    throw new Error('onBeforeSave was not captured');
  }
  return onBeforeSave;
};

describe('SociogramPrompts onBeforeSave cross-class gate', () => {
  it('throws a SubmissionError keyed at highlight.variable with the mirror message', async () => {
    const onBeforeSave = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT);
    let thrown: unknown;
    try {
      await onBeforeSave({
        id: 'p1',
        text: 'T',
        highlight: { allowHighlighting: true, variable: 'flagged' },
      });
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof SubmissionError)) {
      throw new Error('onBeforeSave did not block the save');
    }
    expect(thrown.errors).toEqual({
      highlight: {
        variable:
          '"Flagged" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
      },
    });
  });

  it('escapes when the pick equals the prompt’s original committed highlight variable (editing without changing)', async () => {
    const onBeforeSave = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT, {
      highlight: { allowHighlighting: true, variable: 'flagged' },
    });
    const value = {
      id: 'p1',
      text: 'T',
      highlight: { allowHighlighting: true, variable: 'flagged' },
    };
    expect(onBeforeSave(value)).toBe(value);
  });

  it('allows a save with no cross-class conflict', async () => {
    const sociogramOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[1]],
    };
    const onBeforeSave = renderWithStore(sociogramOnly);
    const value = {
      id: 'p1',
      text: 'T',
      highlight: { allowHighlighting: true, variable: 'flagged' },
    };
    expect(onBeforeSave(value)).toBe(value);
  });

  it('is a no-op when highlighting is disabled (no variable picked)', async () => {
    const onBeforeSave = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT);
    const value = {
      id: 'p1',
      text: 'T',
      highlight: { allowHighlighting: false },
    };
    expect(onBeforeSave(value)).toBe(value);
  });
});
