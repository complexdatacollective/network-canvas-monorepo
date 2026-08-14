import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AnyDialog,
  DialogContextType,
} from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  clearActiveProtocol,
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app, {
  setProtocolLockState,
  setStorageUnavailable,
} from '~/ducks/modules/app';
import protocols from '~/ducks/modules/protocols';
import protocolValidation from '~/ducks/modules/protocolValidation';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';
import type { AppDispatch } from '~/ducks/store';

import {
  getLeavePersistence,
  guardState,
  promptLeaveEditor,
} from '../useProtocolNavGuard';

// Intercepts the fresco dialog request so the test can read the config shown to
// the user and auto-confirm it. Records every dispatched action (resetDraft is a
// thunk, i.e. a function, so we can detect it by type).
const setup = (
  dialogAction:
    | 'leave'
    | 'download-and-leave'
    | 'discard-and-leave'
    | null = 'leave',
  downloadResult: 'success' | 'failure' = 'success',
) => {
  const dispatched: unknown[] = [];
  const captured: AnyDialog[] = [];

  const openDialog = (async (config: AnyDialog) => {
    captured.push(config);
    return dialogAction;
  }) as DialogContextType['openDialog'];

  const dispatch = ((action: unknown) => {
    dispatched.push(action);
    if (typeof action === 'function') {
      return {
        unwrap: async () => {
          if (downloadResult === 'failure') {
            throw new Error('Export failed');
          }
          return { skippedAssets: [] };
        },
      };
    }
    return action;
  }) as unknown as AppDispatch;

  return {
    dispatch,
    dispatched,
    openDialog,
    getCaptured: () => captured[0],
    getCapturedDialogs: () => captured,
  };
};

describe('promptLeaveEditor', () => {
  beforeEach(() => {
    guardState.prompting = false;
    guardState.bypass = false;
    vi.restoreAllMocks();
  });

  it('uses a separate discard dialog and resets a dirty stage draft when returning to the start screen', async () => {
    const { dispatch, dispatched, openDialog, getCaptured } =
      setup('discard-and-leave');
    const performLeave = vi.fn();

    await promptLeaveEditor(dispatch, openDialog, performLeave, true);

    const captured = getCaptured();
    // Copy must not falsely claim the (unpersisted) stage draft is saved.
    expect(captured?.type).toBe('choice');
    if (captured?.type !== 'choice') throw new Error('Expected choice dialog');
    expect(captured.intent).toBe('warning');
    expect(captured.size).toBe('readable');
    expect(captured.title).toBe('Discard unsaved stage changes?');
    expect(captured.description).not.toMatch(/saved automatically/i);
    expect(captured.description).toMatch(
      /have not been saved to the protocol/i,
    );
    expect(captured.description).toMatch(/last saved version/i);
    expect(captured.actions.primary).toEqual({
      label: 'Discard Changes and Return',
      value: 'discard-and-leave',
    });
    expect(captured.actions.secondary).toBeUndefined();

    // resetDraft is a thunk, so a function is dispatched to clear the draft.
    expect(dispatched.some((action) => typeof action === 'function')).toBe(
      true,
    );
    expect(dispatched).toContainEqual(clearActiveProtocol());
    expect(performLeave).toHaveBeenCalledTimes(1);
  });

  it('keeps the reassuring copy and does NOT reset the draft when the editor is pristine', async () => {
    const { dispatch, dispatched, openDialog, getCaptured } = setup();
    const performLeave = vi.fn();

    await promptLeaveEditor(dispatch, openDialog, performLeave, false);

    const captured = getCaptured();
    expect(captured?.type).toBe('choice');
    if (captured?.type !== 'choice') throw new Error('Expected choice dialog');
    expect(captured.intent).toBe('default');
    expect(captured.size).toBe('readable');
    expect(captured.description).toMatch(/saved automatically/i);
    expect(captured.description).toMatch(/on this device/i);
    expect(captured.description).not.toMatch(/browser/i);

    // No draft-reset thunk for a pristine editor.
    expect(dispatched.some((action) => typeof action === 'function')).toBe(
      false,
    );
    expect(dispatched).toContainEqual(clearActiveProtocol());
    expect(performLeave).toHaveBeenCalledTimes(1);
  });

  it('downloads the protocol before returning to the start screen', async () => {
    const { dispatch, dispatched, openDialog, getCaptured } =
      setup('download-and-leave');
    const performLeave = vi.fn();

    await promptLeaveEditor(dispatch, openDialog, performLeave, false);

    const captured = getCaptured();
    expect(captured?.type).toBe('choice');
    if (captured?.type !== 'choice') throw new Error('Expected choice dialog');
    expect(captured.actions.secondary).toEqual({
      label: 'Return and download now',
      value: 'download-and-leave',
    });
    expect(
      dispatched.filter((action) => typeof action === 'function'),
    ).toHaveLength(1);
    expect(dispatched).toContainEqual(clearActiveProtocol());
    expect(performLeave).toHaveBeenCalledTimes(1);
  });

  it('stays in the editor and reports an export failure', async () => {
    const { dispatch, dispatched, openDialog, getCapturedDialogs } = setup(
      'download-and-leave',
      'failure',
    );
    const performLeave = vi.fn();

    await promptLeaveEditor(dispatch, openDialog, performLeave, false);

    expect(dispatched).not.toContainEqual(clearActiveProtocol());
    expect(performLeave).not.toHaveBeenCalled();
    expect(getCapturedDialogs()).toHaveLength(2);
    expect(getCapturedDialogs()[1]).toMatchObject({
      type: 'acknowledge',
      intent: 'destructive',
      title: 'Your protocol could not be downloaded',
      description:
        'Something went wrong while preparing the file. Please try again.',
    });
  });

  // The reassuring copy is only true when this tab owns the saved copy. A tab
  // whose writes are being dropped must not be told its work is safe.
  it('tells a read-only tab that the other tab holds the saved copy', async () => {
    const { dispatch, openDialog, getCaptured } = setup();

    await promptLeaveEditor(
      dispatch,
      openDialog,
      vi.fn(),
      false,
      'open-elsewhere',
    );

    const captured = getCaptured();
    if (captured?.type !== 'choice') throw new Error('Expected choice dialog');
    expect(captured.description).not.toMatch(/saved automatically/i);
    expect(captured.description).toMatch(/open in another tab/i);
    expect(captured.description).toMatch(/holds the saved copy/i);
  });

  it('leads with downloading when nothing could be saved to this device', async () => {
    const { dispatch, openDialog, getCaptured } = setup();

    await promptLeaveEditor(
      dispatch,
      openDialog,
      vi.fn(),
      false,
      'storage-unavailable',
    );

    const captured = getCaptured();
    if (captured?.type !== 'choice') throw new Error('Expected choice dialog');
    expect(captured.intent).toBe('warning');
    expect(captured.description).not.toMatch(/saved automatically/i);
    expect(captured.description).toMatch(/could not be saved on this device/i);
    expect(captured.actions.primary).toEqual({
      label: 'Return and download now',
      value: 'download-and-leave',
    });
    expect(captured.actions.secondary).toEqual({
      label: 'Return to Start Screen',
      value: 'leave',
    });
  });

  it('never puts a stack trace in a leave-editor dialog', async () => {
    const { dispatch, openDialog, getCapturedDialogs } = setup(
      'download-and-leave',
      'failure',
    );

    await promptLeaveEditor(dispatch, openDialog, vi.fn(), false);

    for (const dialog of getCapturedDialogs()) {
      const description =
        'description' in dialog && typeof dialog.description === 'string'
          ? dialog.description
          : '';
      expect(description).not.toMatch(/at https?:\/\//);
      expect(description).not.toMatch(/"stack"/);
    }
  });
});

describe('getLeavePersistence', () => {
  const makeStore = () =>
    configureStore({
      reducer: combineReducers({
        app,
        protocols,
        protocolValidation,
        stageEditorDraft,
        activeProtocol: createTimeline(activeProtocol),
      }),
    });

  const protocol: CurrentProtocol = {
    name: 'Test Protocol',
    schemaVersion: 8,
    stages: [],
    codebook: {},
  };

  it('reports no protocol when the editing buffer is empty', () => {
    expect(getLeavePersistence(makeStore().getState())).toBe('no-protocol');
  });

  it('reports a saved protocol when this tab owns it', () => {
    const store = makeStore();
    store.dispatch(setActiveProtocol(protocol));

    expect(getLeavePersistence(store.getState())).toBe('saved');
  });

  it('reports the protocol as open elsewhere when another tab holds it', () => {
    const store = makeStore();
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));

    expect(getLeavePersistence(store.getState())).toBe('open-elsewhere');
  });

  it('prefers unavailable storage, the more urgent of the two', () => {
    const store = makeStore();
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));
    store.dispatch(setStorageUnavailable(true));

    expect(getLeavePersistence(store.getState())).toBe('storage-unavailable');
  });
});
