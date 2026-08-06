import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import {
  type StageFormContextValue,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

// The confirm dialog's own rendering (portal, animation) is irrelevant to
// the regression below; auto-confirming isolates the toggle write.
vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({
    confirm: async ({ onConfirm }: { onConfirm: () => void }) => {
      onConfirm();
      return true;
    },
  }),
}));
vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import NominationPrompts from '../NominationPrompts';

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: { flagVar: { name: 'Flag', type: 'boolean' } },
    },
  },
};

const renderSection = () => {
  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = { present: { schemaVersion: 8, codebook: CODEBOOK, stages: [] } },
      ) => state,
      stageEditorDraft,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

  let context: StageFormContextValue | null = null;
  const Probe = () => {
    context = useStageFormContext();
    return null;
  };

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={
            {
              id: 's1',
              type: 'FamilyPedigree',
              nodeConfig: { type: 'person' },
              nominationPrompts: [{ id: 'p1', text: 'T', variable: 'flagVar' }],
            } as unknown as Stage
          }
          stageId="s1"
          formId="edit-stage"
        >
          <Probe />
          <NominationPrompts
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="FamilyPedigree"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  return {
    getFieldValue: (name: string) => {
      if (!context) throw new Error('stage form context was not captured');
      return (context as StageFormContextValue).storeApi
        .getState()
        .getFieldState(name)?.value;
    },
  };
};

// Regression: the array field is still mounted when the confirm dialog
// resolves (the Section's own `isOpen` only flips afterward), so the clear
// write must use `undefined` — fresco-ui's `ArrayField` throws on a `null`
// value (only `undefined` is defaulted to its own empty array). This mirrors
// IntroScreen.tsx's identical fix.
describe('NominationPrompts toggle off', () => {
  it('clears nominationPrompts without crashing the still-mounted array field', async () => {
    const view = renderSection();

    await act(async () => {
      fireEvent.click(screen.getByRole('switch'));
      // Let the mocked `confirm`'s promise (and the resulting store write)
      // settle before asserting.
      await Promise.resolve();
    });

    expect(view.getFieldValue('nominationPrompts')).toBeUndefined();
  });
});
