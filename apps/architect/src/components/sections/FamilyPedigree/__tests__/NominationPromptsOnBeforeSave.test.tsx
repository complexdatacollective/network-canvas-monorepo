import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

// Bypasses the real DialogArrayField (whose dialog machinery is irrelevant
// here) and captures the `onBeforeSave` prop for direct invocation — the same
// capture-a-handler-prop idiom
// FamilyPedigree/__tests__/NodeConfigurationHandlers.test.tsx uses for this
// app's other DialogArrayField-backed sections.
let capturedOnBeforeSave: ((value: unknown) => unknown) | undefined;
vi.mock('~/components/Form/ArchitectArrayField', () => ({
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
import NominationPrompts from '../NominationPrompts';

// `flagged` mirrors the pickerExclusions.test.ts/roleMap.test.ts fixture
// shape: written both by a form field (validated, stage s1) and — here — a
// FamilyPedigree nomination toggle (unvalidated, stage s2).
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
      type: 'FamilyPedigree',
      label: 'P',
      nodeConfig: { type: 'person' },
      nominationPrompts: [{ id: 'p1', text: 'T', variable: 'flagged' }],
    },
  ],
};

const renderWithStore = (
  protocol: unknown,
  committedNominationPrompts: Record<string, unknown>[],
): ((value: unknown) => unknown) => {
  capturedOnBeforeSave = undefined;
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: protocol }) => state,
      stageEditorDraft,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={
            {
              id: 's2',
              type: 'FamilyPedigree',
              nodeConfig: { type: 'person' },
              // Non-empty so the toggleable Section's startExpanded is true
              // and the array field (and its onBeforeSave) actually mounts.
              nominationPrompts: committedNominationPrompts,
            } as unknown as Stage
          }
          stageId="s2"
          formId="edit-stage"
        >
          <NominationPrompts
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="FamilyPedigree"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );
  expect(screen.getByTestId('dialog-array-field')).toBeInTheDocument();
  // Read into a local const: `capturedOnBeforeSave` is reassigned by the
  // mocked ArchitectArrayField closure above, so TS cannot narrow the outer
  // `let` itself past `undefined` here even after this guard.
  const onBeforeSave = capturedOnBeforeSave;
  if (!onBeforeSave) {
    throw new Error('onBeforeSave was not captured');
  }
  return onBeforeSave;
};

describe('NominationPrompts onBeforeSave cross-class gate', () => {
  it('blocks the save with a field error keyed at variable, with the mirror message', () => {
    const onBeforeSave = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT, [
      { id: 'p1', text: 'T', variable: 'other' },
    ]);

    const result = onBeforeSave({ id: 'p1', text: 'T', variable: 'flagged' });

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        variable: [
          '"Flagged" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
        ],
      },
    });
  });

  it('escapes when the pick equals the prompt’s original committed variable (editing without changing)', () => {
    const onBeforeSave = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT, [
      { id: 'p1', text: 'T', variable: 'flagged' },
    ]);
    const value = { id: 'p1', text: 'T', variable: 'flagged' };
    expect(onBeforeSave(value)).toBe(value);
  });

  // A nomination toggle writes through a per-node control the participant
  // operates; the pedigree derives its ego marker from the structure instead.
  // Two writers on one variable put several participants in one family.
  it('blocks a save bound to the pedigree’s own ego variable', () => {
    const withEgoSlot = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [
        {
          ...PROTOCOL_WITH_FORM_CONFLICT.stages[1],
          nodeConfig: { type: 'person', egoVariable: 'flagged' },
        },
      ],
    };
    const onBeforeSave = renderWithStore(withEgoSlot, [
      { id: 'p1', text: 'T', variable: 'other' },
    ]);

    expect(onBeforeSave({ id: 'p1', text: 'T', variable: 'flagged' })).toEqual({
      success: false,
      fieldErrors: {
        variable: [
          'This variable is set by the Family Pedigree interface, which marks the participant, so it cannot be used here. Choose a different variable.',
        ],
      },
    });
  });

  // No unchanged-pick escape here, unlike the cross-class gate: re-saving an
  // imported protocol's ego-bound prompt would keep overwriting the ego flag.
  it('blocks an ego-bound save even when it is the prompt’s committed variable', () => {
    const withEgoSlot = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [
        {
          ...PROTOCOL_WITH_FORM_CONFLICT.stages[1],
          nodeConfig: { type: 'person', egoVariable: 'flagged' },
        },
      ],
    };
    const onBeforeSave = renderWithStore(withEgoSlot, [
      { id: 'p1', text: 'T', variable: 'flagged' },
    ]);
    const result = onBeforeSave({ id: 'p1', text: 'T', variable: 'flagged' });
    expect(result).toMatchObject({ success: false });
  });

  it('allows a save with no cross-class conflict', () => {
    const nominationOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[1]],
    };
    const onBeforeSave = renderWithStore(nominationOnly, [
      { id: 'p1', text: 'T', variable: 'flagged' },
    ]);
    const value = { id: 'p1', text: 'T', variable: 'flagged' };
    expect(onBeforeSave(value)).toBe(value);
  });
});
