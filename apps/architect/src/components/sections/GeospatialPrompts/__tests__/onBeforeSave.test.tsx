import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { Provider } from 'react-redux';
import { SubmissionError } from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

// Bypasses redux-form's real FieldArray (which needs a reduxForm()-wrapped
// ancestor GeospatialPrompts does not provide on its own) and captures the
// `onBeforeSave` componentProp for direct invocation — the same
// capture-a-handler-prop idiom SociogramPrompts/__tests__/onBeforeSave.test.tsx
// uses for this app's other DialogArrayField-backed sections.
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
import GeospatialPrompts from '../GeospatialPrompts';

// `loc` mirrors the pickerExclusions.test.ts/roleMap.test.ts fixture shape:
// written both by a form field (validated, stage s1) and — here — a
// geospatial selection prompt (unvalidated, stage s2).
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          loc: { name: 'Location', type: 'location' },
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
      form: { fields: [{ variable: 'loc', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'Geospatial',
      label: 'G',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'loc' }],
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
      <GeospatialPrompts
        form="edit-stage"
        stagePath="stages[0]"
        stagePosition={0}
        interfaceType="Geospatial"
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

describe('GeospatialPrompts onBeforeSave cross-class gate', () => {
  it('throws a SubmissionError keyed at variable with the mirror message', async () => {
    const onBeforeSave = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT);
    let thrown: unknown;
    try {
      await onBeforeSave({ id: 'p1', text: 'T', variable: 'loc' });
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof SubmissionError)) {
      throw new Error('onBeforeSave did not block the save');
    }
    expect(thrown.errors).toEqual({
      variable:
        '"Location" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
    });
  });

  it('escapes when the pick equals the prompt’s original committed variable (editing without changing)', () => {
    const onBeforeSave = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT, {
      variable: 'loc',
    });
    const value = { id: 'p1', text: 'T', variable: 'loc' };
    expect(onBeforeSave(value)).toBe(value);
  });

  it('allows a save with no cross-class conflict', () => {
    const geospatialOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[1]],
    };
    const onBeforeSave = renderWithStore(geospatialOnly);
    const value = { id: 'p1', text: 'T', variable: 'loc' };
    expect(onBeforeSave(value)).toBe(value);
  });
});
