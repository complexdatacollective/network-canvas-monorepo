import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AnyDialog,
  DialogContextType,
} from '@codaco/fresco-ui/dialogs/DialogProvider';
import { clearActiveProtocol } from '~/ducks/modules/activeProtocol';
import type { AppDispatch } from '~/ducks/store';

import { guardState, promptLeaveEditor } from '../useProtocolNavGuard';

// Intercepts the fresco dialog request so the test can read the config shown to
// the user and auto-confirm it. Records every dispatched action (resetDraft is a
// thunk, i.e. a function, so we can detect it by type).
const setup = (
  dialogAction: 'leave' | 'download-and-leave' | null = 'leave',
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

  it('warns about data loss and resets the dirty stage draft when leaving to the start screen', async () => {
    const { dispatch, dispatched, openDialog, getCaptured } = setup();
    const performLeave = vi.fn();

    await promptLeaveEditor(dispatch, openDialog, performLeave, true);

    const captured = getCaptured();
    // Copy must not falsely claim the (unpersisted) stage draft is saved.
    expect(captured?.type).toBe('choice');
    if (captured?.type !== 'choice') throw new Error('Expected choice dialog');
    expect(captured.intent).toBe('warning');
    expect(captured.size).toBe('readable');
    expect(captured.description).not.toMatch(/saved automatically/i);
    expect(captured.description).toMatch(/unsaved changes/i);
    expect(captured.actions.secondary).toEqual({
      label: 'Return and download now',
      value: 'download-and-leave',
    });

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
      title: 'Failed to export protocol',
      description: 'Export failed',
    });
  });
});
