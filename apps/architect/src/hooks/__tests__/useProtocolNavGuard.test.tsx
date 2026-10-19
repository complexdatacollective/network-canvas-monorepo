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
import type { AppDispatch } from '~/ducks/store';
import { renderQueuedMessage } from '~/test/renderQueuedMessage';

import {
  getLeavePersistence,
  guardState,
  promptLeaveEditor,
} from '../useProtocolNavGuard';

// Intercepts the fresco dialog request so the test can read the config shown to
// the user and auto-confirm it. Records every dispatched action; the download
// thunk is the only function among them, so it is detected by type.
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

  it('uses a separate discard dialog for a dirty stage draft when returning to the start screen', async () => {
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
    expect(renderQueuedMessage(captured.title)).toBe(
      'Discard unsaved changes?',
    );
    expect(renderQueuedMessage(captured.description)).not.toMatch(
      /saved automatically/i,
    );
    expect(renderQueuedMessage(captured.description)).toMatch(
      /have not been saved to the protocol/i,
    );
    expect(renderQueuedMessage(captured.description)).toMatch(
      /last saved version/i,
    );
    expect({
      ...captured.actions.primary,
      label: renderQueuedMessage(captured.actions.primary.label),
    }).toEqual({
      label: 'Discard Changes and Return',
      value: 'discard-and-leave',
    });
    expect(captured.actions.secondary).toBeUndefined();

    expect(dispatched).toContainEqual(clearActiveProtocol());
    expect(performLeave).toHaveBeenCalledTimes(1);
  });

  it('keeps the reassuring copy when the editor is pristine', async () => {
    const { dispatch, dispatched, openDialog, getCaptured } = setup();
    const performLeave = vi.fn();

    await promptLeaveEditor(dispatch, openDialog, performLeave, false);

    const captured = getCaptured();
    expect(captured?.type).toBe('choice');
    if (captured?.type !== 'choice') throw new Error('Expected choice dialog');
    expect(captured.intent).toBe('default');
    expect(captured.size).toBe('readable');
    expect(renderQueuedMessage(captured.description)).toMatch(
      /saved automatically/i,
    );
    expect(renderQueuedMessage(captured.description)).toMatch(
      /on this device/i,
    );
    expect(renderQueuedMessage(captured.description)).not.toMatch(/browser/i);

    // Nothing is downloaded, so no thunk is dispatched.
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
    expect({
      ...captured.actions.secondary,
      label: renderQueuedMessage(captured.actions.secondary?.label),
    }).toEqual({
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
    const failure = getCapturedDialogs()[1];
    expect(failure).toBeDefined();
    expect({
      ...failure,
      title: renderQueuedMessage(failure?.title),
      description: renderQueuedMessage(failure?.description),
    }).toMatchObject({
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
    expect(renderQueuedMessage(captured.description)).not.toMatch(
      /saved automatically/i,
    );
    expect(renderQueuedMessage(captured.description)).toMatch(
      /open in another tab/i,
    );
    expect(renderQueuedMessage(captured.description)).toMatch(
      /holds the saved copy/i,
    );
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
    expect(renderQueuedMessage(captured.description)).not.toMatch(
      /saved automatically/i,
    );
    expect(renderQueuedMessage(captured.description)).toMatch(
      /could not be saved on this device/i,
    );
    expect({
      ...captured.actions.primary,
      label: renderQueuedMessage(captured.actions.primary.label),
    }).toEqual({
      label: 'Return and download now',
      value: 'download-and-leave',
    });
    expect({
      ...captured.actions.secondary,
      label: renderQueuedMessage(captured.actions.secondary?.label),
    }).toEqual({
      label: 'Return to Start Screen',
      value: 'leave',
    });
  });

  // Leaving for Architect 9 is a full-page navigation to another app, not a
  // return to the start screen, and the copy must say where it goes.
  describe('when leaving for Architect 9', () => {
    it('names Architect 9 in the discard dialog', async () => {
      const { dispatch, dispatched, openDialog, getCaptured } =
        setup('discard-and-leave');
      const performLeave = vi.fn();

      await promptLeaveEditor(
        dispatch,
        openDialog,
        performLeave,
        true,
        'saved',
        'architect-9',
      );

      const captured = getCaptured();
      if (captured?.type !== 'choice') {
        throw new Error('Expected choice dialog');
      }
      const description = renderQueuedMessage(captured.description);
      expect(description).toMatch(/If you open Architect 9 now/);
      expect(description).toMatch(/last saved version/i);
      expect(description).not.toMatch(/start screen/i);
      expect({
        ...captured.actions.primary,
        label: renderQueuedMessage(captured.actions.primary.label),
      }).toEqual({
        label: 'Discard Changes and Open Architect 9',
        value: 'discard-and-leave',
      });
      expect(dispatched).toContainEqual(clearActiveProtocol());
      expect(performLeave).toHaveBeenCalledTimes(1);
    });

    it.each([
      'open-elsewhere',
      'reclaim-blocked',
      'storage-unavailable',
    ] as const)(
      'describes a %s tab without mentioning the start screen',
      async (persistence) => {
        const { dispatch, openDialog, getCaptured } =
          setup('discard-and-leave');

        await promptLeaveEditor(
          dispatch,
          openDialog,
          vi.fn(),
          true,
          persistence,
          'architect-9',
        );

        const captured = getCaptured();
        if (captured?.type !== 'choice') {
          throw new Error('Expected choice dialog');
        }
        const description = renderQueuedMessage(captured.description);
        expect(description).toMatch(/Architect 9/);
        expect(description).not.toMatch(/start screen/i);
      },
    );

    it('offers a download first when the protocol exists only in this tab', async () => {
      const { dispatch, dispatched, openDialog, getCaptured } =
        setup('download-and-leave');
      const performLeave = vi.fn();

      await promptLeaveEditor(
        dispatch,
        openDialog,
        performLeave,
        false,
        'storage-unavailable',
        'architect-9',
      );

      const captured = getCaptured();
      if (captured?.type !== 'choice') {
        throw new Error('Expected choice dialog');
      }
      expect(captured.intent).toBe('warning');
      expect(renderQueuedMessage(captured.title)).toBe('Open Architect 9?');
      expect(renderQueuedMessage(captured.description)).toMatch(
        /could not be saved on this device.*Architect 9 opens/,
      );
      expect({
        ...captured.actions.primary,
        label: renderQueuedMessage(captured.actions.primary.label),
      }).toEqual({
        label: 'Download now and open Architect 9',
        value: 'download-and-leave',
      });
      expect({
        ...captured.actions.secondary,
        label: renderQueuedMessage(captured.actions.secondary?.label),
      }).toEqual({
        label: 'Open Architect 9 without downloading',
        value: 'leave',
      });
      expect(
        dispatched.filter((action) => typeof action === 'function'),
      ).toHaveLength(1);
      expect(performLeave).toHaveBeenCalledTimes(1);
    });

    it('leaves a saved pristine editor without asking', async () => {
      const { dispatch, dispatched, openDialog, getCapturedDialogs } = setup();
      const performLeave = vi.fn();

      await promptLeaveEditor(
        dispatch,
        openDialog,
        performLeave,
        false,
        'saved',
        'architect-9',
      );

      expect(getCapturedDialogs()).toHaveLength(0);
      expect(dispatched).toContainEqual(clearActiveProtocol());
      expect(performLeave).toHaveBeenCalledTimes(1);
    });
  });

  it('never puts a stack trace in a leave-editor dialog', async () => {
    const { dispatch, openDialog, getCapturedDialogs } = setup(
      'download-and-leave',
      'failure',
    );

    await promptLeaveEditor(dispatch, openDialog, vi.fn(), false);

    expect(getCapturedDialogs()).toHaveLength(2);
    for (const dialog of getCapturedDialogs()) {
      const description = renderQueuedMessage(dialog.description);
      expect(description.length).toBeGreaterThan(0);
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
