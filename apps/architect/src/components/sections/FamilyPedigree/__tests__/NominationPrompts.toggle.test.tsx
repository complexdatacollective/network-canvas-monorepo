import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import {
  type StageFormContextValue,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm: confirmMock }),
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
        state = {
          present: { schemaVersion: 8, codebook: CODEBOOK, stages: [] },
        },
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
    getFormValues: () => {
      if (!context) throw new Error('stage form context was not captured');
      return (context as StageFormContextValue).storeApi
        .getState()
        .getFormValues();
    },
  };
};

describe('NominationPrompts toggle off', () => {
  beforeEach(() => {
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
  });

  it('clears accepted nomination prompts without resurrecting them on reopen', async () => {
    const view = renderSection();
    const toggle = screen.getByRole('switch', { name: 'Nomination prompts' });

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    await waitFor(() =>
      expect(view.getFormValues()).not.toHaveProperty('nominationPrompts'),
    );
    expect(view.getFieldValue('nominationPrompts')).toBeUndefined();
    expect(confirmMock).toHaveBeenCalledOnce();

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(view.getFormValues().nominationPrompts).toBeUndefined();
    expect(confirmMock).toHaveBeenCalledOnce();
  });

  it('keeps the section and values open when clearing is cancelled', async () => {
    confirmMock.mockResolvedValue(false);
    const view = renderSection();
    const toggle = screen.getByRole('switch', { name: 'Nomination prompts' });

    fireEvent.click(toggle);

    await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce());
    expect(toggle).toBeChecked();
    expect(view.getFormValues()).toHaveProperty('nominationPrompts');
  });
});
