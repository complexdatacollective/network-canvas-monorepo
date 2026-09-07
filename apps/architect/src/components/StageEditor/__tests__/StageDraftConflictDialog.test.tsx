import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { act, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import { useNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import NestedDraftReclaimDialog from '~/components/NestedDraftReclaimDialog';
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
  setLiveValues,
} from '~/ducks/modules/stageEditorDraft';
import { getStageEditorDraftOpen } from '~/selectors/stageEditorDraft';
import { renderQueuedMessage } from '~/test/renderQueuedMessage';

import StageDraftConflictDialog from '../StageDraftConflictDialog';

const { mockSetLocation } = vi.hoisted(() => ({
  mockSetLocation: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/protocol/stage/stage-1', mockSetLocation],
}));

const downloadActiveProtocol = vi.hoisted(() => vi.fn());
vi.mock('~/utils/downloadActiveProtocol', () => ({
  downloadActiveProtocol: (...args: unknown[]) =>
    downloadActiveProtocol(...args),
}));

const openDialogMock = globalThis.__architectDialogMocks.openDialog;
const closeDialogMock = globalThis.__architectDialogMocks.closeDialog;

// The codebook as the OTHER tab left it on disk, and the one this editor has
// been building on top of its own snapshot. Different objects, so a commit here
// would visibly overwrite theirs.
const savedCodebook = { node: { person: { name: 'Person', variables: {} } } };
const draftCodebook = {
  node: {
    person: {
      name: 'Person',
      variables: { 'var-1': { name: 'nickname', type: 'text' } },
    },
  },
};

const protocol = {
  name: 'Test Protocol',
  schemaVersion: 8,
  stages: [{ id: 'stage-1', type: 'Information', label: 'A' }],
  codebook: savedCodebook,
} as unknown as CurrentProtocol;

const stage = { id: 'stage-1', type: 'Information', label: 'A' } as Stage;
const editedStage = {
  id: 'stage-1',
  type: 'Information',
  label: 'A, edited',
} as Stage;

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

// A stage editor that has been typed into AND has created a codebook variable,
// exactly the pair that cannot be reconciled with the other tab's saved copy.
const openDirtyStageDraft = (store: TestStore) => {
  store.dispatch(
    draftTimelineActions.reset({ stage, codebook: draftCodebook }),
  );
  store.dispatch(setLiveValues(editedStage));
};

// `withStageIdentity` in the real editor: neither key is owned by a field, so
// the committed identity is authoritative and the form's values cannot carry it.
const withStageIdentity = (values: Stage): Stage =>
  ({
    ...values,
    id: 'stage-1',
    type: 'Information',
  }) as Stage;

const renderDialog = (store: TestStore) =>
  render(
    <Provider store={store}>
      <StageDraftConflictDialog
        stageId="stage-1"
        withStageIdentity={withStageIdentity}
      />
    </Provider>,
  );

// A variable, entity-type, array-row or rule editor, open with its own values
// in its own form store. `dirty` says whether anything has been typed into it.
const NestedEditor = ({ dirty }: { dirty: boolean }) => {
  useNestedDraft(true, () => dirty);
  return null;
};

// Both reclaim questions mounted together, exactly as `ViewManager/views/App`
// and `StageEditor` mount them: only one of them may ever be on screen.
const renderBothReclaimDialogs = (store: TestStore, nestedDirty: boolean) =>
  render(
    <Provider store={store}>
      <NestedEditor dirty={nestedDirty} />
      <StageDraftConflictDialog
        stageId="stage-1"
        withStageIdentity={withStageIdentity}
      />
      <NestedDraftReclaimDialog />
    </Provider>,
  );

const openedDialogTitles = () =>
  openDialogMock.mock.calls.map((call) =>
    renderQueuedMessage((call[0] as { title: ReactNode }).title),
  );

const lastChoiceDialog = () =>
  openDialogMock.mock.calls.at(-1)?.[0] as {
    title: ReactNode;
    description: ReactNode;
    actions: {
      primary: { label: ReactNode; value: string };
      secondary?: { label: ReactNode; value: string };
      cancel: { label: ReactNode; value: null };
    };
  };

describe('StageDraftConflictDialog', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
    store.dispatch(setActiveProtocol(protocol));
    openDialogMock.mockReset();
    closeDialogMock.mockReset();
    mockSetLocation.mockClear();
    downloadActiveProtocol.mockReset();
    downloadActiveProtocol.mockResolvedValue(true);
  });

  it('asks nothing while this tab owns the saved copy', () => {
    openDirtyStageDraft(store);

    renderDialog(store);

    expect(openDialogMock).not.toHaveBeenCalled();
  });

  it('asks nothing while the other tab still holds the protocol', () => {
    openDirtyStageDraft(store);
    store.dispatch(setProtocolLockState('open-elsewhere'));

    renderDialog(store);

    expect(openDialogMock).not.toHaveBeenCalled();
  });

  it('asks the researcher, offering both keeping and giving up the work', async () => {
    openDirtyStageDraft(store);
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    openDialogMock.mockReturnValue(new Promise(() => undefined));

    renderDialog(store);

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledTimes(1);
    });
    const dialog = lastChoiceDialog();
    // Whole sentences, and specific about what is lost: the stage changes AND
    // the codebook edits made while the editor was open.
    expect(renderQueuedMessage(dialog.description)).toMatch(
      /cannot be combined|no safe way/i,
    );
    expect(renderQueuedMessage(dialog.description)).toMatch(
      /discards your changes to this stage/i,
    );
    expect(renderQueuedMessage(dialog.description)).toMatch(
      /attributes you added or edited/i,
    );
    // …and honest about what the rescue copy does NOT contain: it is built from
    // this tab's pre-demotion buffer, so the other tab's saved work is missing
    // from it.
    expect(renderQueuedMessage(dialog.description)).toMatch(
      /will not contain anything the other tab saved/i,
    );
    // Keeping the work leads.
    expect(dialog.actions.primary.value).toBe('download');
    expect(dialog.actions.secondary?.value).toBe('discard');
    // Dismissing is not a discard.
    expect(dialog.actions.cancel.value).toBeNull();
  });

  it('discards nothing while the question is unanswered', async () => {
    openDirtyStageDraft(store);
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    openDialogMock.mockReturnValue(new Promise(() => undefined));

    renderDialog(store);

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalled();
    });
    expect(getStageEditorDraftOpen(store.getState())).toBe(true);
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('discards nothing when the researcher dismisses the dialog', async () => {
    openDirtyStageDraft(store);
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    openDialogMock.mockResolvedValue(null);

    renderDialog(store);

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledTimes(1);
    });
    expect(getStageEditorDraftOpen(store.getState())).toBe(true);
    expect(downloadActiveProtocol).not.toHaveBeenCalled();
  });

  it('downloads a copy carrying the stage edits and the draft codebook', async () => {
    openDirtyStageDraft(store);
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    openDialogMock
      .mockResolvedValueOnce('download')
      .mockReturnValue(new Promise(() => undefined));

    renderDialog(store);

    await waitFor(() => {
      expect(downloadActiveProtocol).toHaveBeenCalledTimes(1);
    });
    const downloaded = downloadActiveProtocol.mock.calls[0]?.[2] as
      | CurrentProtocol
      | undefined;
    expect(downloaded?.stages[0]).toMatchObject({ label: 'A, edited' });
    expect(downloaded?.codebook).toEqual(draftCodebook);

    // Downloading keeps the work but does not answer the question, so it is
    // asked again — and nothing has been discarded.
    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledTimes(2);
    });
    expect(getStageEditorDraftOpen(store.getState())).toBe(true);
    expect(renderQueuedMessage(lastChoiceDialog().description)).toMatch(
      /has been downloaded/i,
    );
    expect(renderQueuedMessage(lastChoiceDialog().description)).toMatch(
      /not the changes the other tab saved/i,
    );
  });

  it('discards the draft and leaves the editor only when asked to', async () => {
    openDirtyStageDraft(store);
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    openDialogMock.mockResolvedValue('discard');

    renderDialog(store);

    await waitFor(() => {
      expect(getStageEditorDraftOpen(store.getState())).toBe(false);
    });
    // Leaving matters as much as clearing: a form left over a closed
    // transaction can never be saved again.
    expect(mockSetLocation).toHaveBeenCalledWith('/protocol');
    // Nothing was written to the protocol on the way out.
    expect(store.getState().activeProtocol?.present?.codebook).toEqual(
      savedCodebook,
    );
  });

  // Dismissing is safe but must not be a dead end: the banner can raise the
  // question again, and with it the download that keeps the work.
  it('asks again when the researcher asks to see the choice', async () => {
    openDirtyStageDraft(store);
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    openDialogMock.mockResolvedValueOnce(null);

    renderDialog(store);
    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledTimes(1);
    });

    openDialogMock.mockReturnValue(new Promise(() => undefined));
    act(() => {
      store.dispatch(requestProtocolReclaimChoice());
    });

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledTimes(2);
    });
  });

  // Both questions are about the same blocked reclaim, and the lock stops at
  // the FIRST thing it cannot resolve: an open nested editor, whether or not
  // anything has been typed into it (`useProtocolTabLock`). So whenever that
  // dialog can fire, this one must defer — otherwise the researcher gets two
  // modal dialogs stacked on one another giving contradictory instructions.
  describe.each([
    { dirty: false, label: 'with nothing typed into it' },
    { dirty: true, label: 'holding unsaved values' },
  ])('while a nested editor is open $label', ({ dirty }) => {
    it('leaves the reclaim question to NestedDraftReclaimDialog alone', async () => {
      openDirtyStageDraft(store);
      store.dispatch(setProtocolLockState('reclaim-blocked'));
      openDialogMock.mockReturnValue(new Promise(() => undefined));

      renderBothReclaimDialogs(store, dirty);

      await waitFor(() => {
        expect(openDialogMock).toHaveBeenCalledTimes(1);
      });
      expect(openedDialogTitles()).toEqual(['An editor is still open']);
      // Give the other dialog's effect every chance to fire late.
      await act(async () => {
        await Promise.resolve();
      });
      expect(openDialogMock).toHaveBeenCalledTimes(1);
      expect(openedDialogTitles()).not.toContain(
        'Choose what to do with your unsaved changes',
      );
    });
  });

  // …and the deferral has to end: once the inner editor is gone, the stage
  // choice is the right question and nothing else will ask it.
  it('asks the stage question once the nested editor closes', async () => {
    openDirtyStageDraft(store);
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    openDialogMock.mockReturnValue(new Promise(() => undefined));

    const view = renderBothReclaimDialogs(store, false);
    await waitFor(() => {
      expect(openedDialogTitles()).toEqual(['An editor is still open']);
    });

    view.rerender(
      <Provider store={store}>
        <StageDraftConflictDialog
          stageId="stage-1"
          withStageIdentity={withStageIdentity}
        />
        <NestedDraftReclaimDialog />
      </Provider>,
    );

    await waitFor(() => {
      expect(openedDialogTitles()).toContain(
        'Choose what to do with your unsaved changes',
      );
    });
    // The explanation that no longer applies is taken off the screen rather
    // than left stacked underneath.
    const reclaim = openDialogMock.mock.calls[0]?.[0] as
      | { id: string }
      | undefined;
    // Named, so a missing first call cannot make the next line pass on
    // `undefined`.
    expect(reclaim?.id).toEqual(expect.any(String));
    expect(closeDialogMock).toHaveBeenCalledWith(reclaim?.id, null);
  });

  it('takes the question away when the other tab re-claims the protocol', async () => {
    openDirtyStageDraft(store);
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    openDialogMock.mockReturnValue(new Promise(() => undefined));

    renderDialog(store);
    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });

    const opened = openDialogMock.mock.calls[0]?.[0] as
      | { id: string }
      | undefined;
    expect(closeDialogMock).toHaveBeenCalledWith(opened?.id, null);
  });
});
