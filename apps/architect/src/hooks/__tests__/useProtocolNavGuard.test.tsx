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
const setup = () => {
  const dispatched: unknown[] = [];
  let captured: AnyDialog | undefined;

  const openDialog = (async (config: AnyDialog) => {
    captured = config;
    return true;
  }) as DialogContextType['openDialog'];

  const dispatch = ((action: unknown) => {
    dispatched.push(action);
    return action;
  }) as unknown as AppDispatch;

  return {
    dispatch,
    dispatched,
    openDialog,
    getCaptured: () => captured,
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
    expect(captured.description).not.toMatch(/saved automatically/i);
    expect(captured.description).toMatch(/unsaved changes/i);

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
    expect(captured.description).toMatch(/saved automatically/i);

    // No draft-reset thunk for a pristine editor.
    expect(dispatched.some((action) => typeof action === 'function')).toBe(
      false,
    );
    expect(dispatched).toContainEqual(clearActiveProtocol());
    expect(performLeave).toHaveBeenCalledTimes(1);
  });
});
