import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { act, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import { useNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app, {
  requestProtocolReclaimChoice,
  setProtocolLockState,
} from '~/ducks/modules/app';
import protocols from '~/ducks/modules/protocols';
import protocolValidation from '~/ducks/modules/protocolValidation';
import stageEditorDraft, {
  draftTimelineActions,
} from '~/ducks/modules/stageEditorDraft';

import NestedDraftReclaimDialog from '../NestedDraftReclaimDialog';

const openDialogMock = globalThis.__architectDialogMocks.openDialog;
const closeDialogMock = globalThis.__architectDialogMocks.closeDialog;

const protocol = {
  name: 'Test Protocol',
  schemaVersion: 8,
  stages: [{ id: 'stage-1', type: 'Information', label: 'A' }],
  codebook: {},
} as unknown as CurrentProtocol;

const stage = { id: 'stage-1', type: 'Information', label: 'A' } as Stage;

const createTestStore = () =>
  configureStore({
    reducer: combineReducers({
      app,
      protocols,
      protocolValidation,
      stageEditorDraft,
      activeProtocol: createTimeline(activeProtocol),
    }),
  });

type TestStore = ReturnType<typeof createTestStore>;

// A variable, entity-type, array-row or rule editor, open with unsaved values
// in its own form store.
const NestedEditor = ({ dirty = true }: { dirty?: boolean }) => {
  useNestedDraft(true, () => dirty);
  return null;
};

const renderDialog = (store: TestStore, editor = <NestedEditor />) =>
  render(
    <Provider store={store}>
      {editor}
      <NestedDraftReclaimDialog />
    </Provider>,
  );

const lastDialog = () =>
  openDialogMock.mock.calls.at(-1)?.[0] as {
    title: string;
    description: string;
    intent: string;
    actions: {
      primary: { label: string; value: string };
      cancel: { label: string; value: null };
    };
  };

describe('NestedDraftReclaimDialog', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
    store.dispatch(setActiveProtocol(protocol));
    openDialogMock.mockReset();
    openDialogMock.mockResolvedValue(null);
    closeDialogMock.mockReset();
  });

  it('asks nothing while this tab owns the saved copy', () => {
    renderDialog(store);

    expect(openDialogMock).not.toHaveBeenCalled();
  });

  it('asks nothing when the reclaim is blocked on the stage draft alone', () => {
    store.dispatch(setProtocolLockState('reclaim-blocked'));

    renderDialog(store, <NestedEditor dirty={false} />);

    // That situation is the stage editor's own three-action choice; answering
    // it here would put two questions about one reclaim on screen at once.
    expect(openDialogMock).not.toHaveBeenCalled();
  });

  // Outside a stage editor the inner editor's Finish writes the canonical
  // protocol, which this tab cannot save and the reclaim's re-read would
  // replace — so cancelling is the only honest way through, and the copy must
  // not promise otherwise.
  it('asks the researcher to cancel the editor when finishing it could not be kept', async () => {
    store.dispatch(setProtocolLockState('reclaim-blocked'));

    renderDialog(store);

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledTimes(1);
    });
    const dialog = lastDialog();
    expect(dialog.title).toBe('An editor is still open');
    expect(dialog.description).toMatch(/cancel that editor to continue/i);
    expect(dialog.description).not.toMatch(/finish that editor/i);
    // Nothing offered here downloads anything: the stage flow's copy is built
    // from the stage draft, which does not contain this editor's values.
    expect(dialog.actions.primary.label).toBe('Back to the Editor');
    expect(dialog.actions.cancel.label).toBe('Decide Later');
    // `DialogProvider` autofocuses cancel on a warning and primary otherwise;
    // nothing here is discouraged, so focus belongs on the primary action.
    expect(dialog.intent).toBe('info');
  });

  // Inside a stage editor the commit lands in that editor's draft transaction,
  // which is exactly how the researcher moves this work somewhere the stage
  // flow can then rescue or discard as one decision.
  it('offers finishing the editor when its values would reach the stage draft', async () => {
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    store.dispatch(draftTimelineActions.reset({ stage, codebook: {} }));

    renderDialog(store);

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledTimes(1);
    });
    const dialog = lastDialog();
    expect(dialog.description).toMatch(
      /Finish that editor to move its changes into this stage/i,
    );
    expect(dialog.description).toMatch(/or cancel it to discard them/i);
  });

  it('takes the question away once the editor that raised it is gone', async () => {
    store.dispatch(setProtocolLockState('reclaim-blocked'));

    const { rerender } = renderDialog(store);
    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      rerender(
        <Provider store={store}>
          <NestedDraftReclaimDialog />
        </Provider>,
      );
    });

    // A stale explanation of a wait that is over is worse than none.
    expect(closeDialogMock).toHaveBeenCalledTimes(1);
  });

  // The question is dismissible on purpose — the editor it is about is on the
  // screen behind it — so the banner has to be able to put it back.
  it('asks again when the banner requests it', async () => {
    store.dispatch(setProtocolLockState('reclaim-blocked'));

    renderDialog(store);
    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      store.dispatch(requestProtocolReclaimChoice());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledTimes(2);
    });
  });
});
