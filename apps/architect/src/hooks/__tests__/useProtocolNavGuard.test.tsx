import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearActiveProtocol } from '~/ducks/modules/activeProtocol';
import type { DialogConfig } from '~/ducks/modules/dialogs';
import type * as DialogsModule from '~/ducks/modules/dialogs';
import type { AppDispatch } from '~/ducks/store';

import { guardState, promptLeaveEditor } from '../useProtocolNavGuard';

// Replace the openDialog async thunk with a plain-action creator so its return
// value is a serialisable action object (not a thunk function). The guard's
// resetDraft is a thunk (a function), so keeping the dialog stub a non-function
// lets the assertions below detect resetDraft purely by `typeof === 'function'`.
const openDialogStub =
  vi.fn<(config: DialogConfig) => { type: string; payload: DialogConfig }>();

vi.mock('~/ducks/modules/dialogs', async (importActual) => {
  const actual = await importActual<typeof DialogsModule>();
  return {
    ...actual,
    actionCreators: {
      ...actual.actionCreators,
      openDialog: (config: DialogConfig) => openDialogStub(config),
    },
  };
});

// Intercepts the dialog thunk so the test can read the config shown to the user
// and auto-confirm it, and records every dispatched action (resetDraft is a
// thunk, i.e. a function, so we can detect it by type).
const setup = () => {
  const dispatched: unknown[] = [];
  let captured: DialogConfig | undefined;

  openDialogStub.mockImplementation((config: DialogConfig) => {
    captured = config;
    config.onConfirm?.();
    return { type: 'dialogs/openDialog/test-stub', payload: config };
  });

  const dispatch = ((action: unknown) => {
    dispatched.push(action);
    return action;
  }) as unknown as AppDispatch;

  return {
    dispatch,
    dispatched,
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
    const { dispatch, dispatched, getCaptured } = setup();
    const performLeave = vi.fn();

    await promptLeaveEditor(dispatch, performLeave, true);

    const captured = getCaptured();
    // Copy must not falsely claim the (unpersisted) stage draft is saved.
    expect(captured?.type).toBe('Warning');
    expect(captured?.message).not.toMatch(/saved automatically/i);
    expect(captured?.message).toMatch(/unsaved changes/i);

    // resetDraft is a thunk, so a function is dispatched to clear the draft.
    expect(dispatched.some((action) => typeof action === 'function')).toBe(
      true,
    );
    expect(dispatched).toContainEqual(clearActiveProtocol());
    expect(performLeave).toHaveBeenCalledTimes(1);
  });

  it('keeps the reassuring copy and does NOT reset the draft when the editor is pristine', async () => {
    const { dispatch, dispatched, getCaptured } = setup();
    const performLeave = vi.fn();

    await promptLeaveEditor(dispatch, performLeave, false);

    const captured = getCaptured();
    expect(captured?.type).toBe('Confirm');
    expect(captured?.message).toMatch(/saved automatically/i);

    // No draft-reset thunk for a pristine editor.
    expect(dispatched.some((action) => typeof action === 'function')).toBe(
      false,
    );
    expect(dispatched).toContainEqual(clearActiveProtocol());
    expect(performLeave).toHaveBeenCalledTimes(1);
  });
});
