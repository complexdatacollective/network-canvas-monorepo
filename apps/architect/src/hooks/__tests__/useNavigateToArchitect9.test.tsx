import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LeavePersistence } from '~/hooks/useProtocolNavGuard';
import {
  beginProtocolCommit,
  isCriticalOperationInProgress,
} from '~/utils/criticalOperation';

import { useNavigateToArchitect9 } from '../useNavigateToArchitect9';

const mocks = vi.hoisted(() => ({
  leave: vi.fn(),
  stageDirty: false,
  nestedDirty: false,
  persistence: 'saved' as LeavePersistence,
  // What the researcher answers in the leave-editor prompt.
  confirmLeave: true,
  promptLeaveEditor: vi.fn(),
  navigateApp: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock('~/utils/architect9Handoff', () => ({
  leaveForArchitect9: mocks.leave,
}));

vi.mock('~/components/StageEditor/stageDraftBeacon', () => ({
  readStageDraft: () => ({ dirty: mocks.stageDirty }),
}));

vi.mock('~/components/DialogForm/nestedDraftRegistry', () => ({
  hasDirtyNestedDraft: () => mocks.nestedDirty,
}));

vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppStore: () => ({ getState: () => ({}) }),
}));

vi.mock('~/utils/appBase', () => ({
  navigateApp: mocks.navigateApp,
  toBrowserPath: (path: string) => `/v8${path}`,
}));

vi.mock('~/hooks/useProtocolNavGuard', () => ({
  getLeavePersistence: () => mocks.persistence,
  collapseProtocolHistory: (_target: string, replace: () => void) => {
    replace();
  },
  promptLeaveEditor: mocks.promptLeaveEditor,
}));

const URL = '/?upgrade=3f0c1f7e-8a8e-4f43-9d6a-1d2c3b4a5e6f';

const navigate = () => renderHook(() => useNavigateToArchitect9()).result;

beforeEach(() => {
  mocks.leave.mockReset();
  mocks.navigateApp.mockReset();
  mocks.stageDirty = false;
  mocks.nestedDirty = false;
  mocks.persistence = 'saved';
  mocks.confirmLeave = true;
  mocks.promptLeaveEditor.mockReset();
  mocks.promptLeaveEditor.mockImplementation(
    async (
      _dispatch: unknown,
      _openDialog: unknown,
      performLeave: () => void | Promise<void>,
    ) => {
      if (!mocks.confirmLeave) return;
      // The real prompt clears the protocol, which unmounts the editors.
      mocks.stageDirty = false;
      mocks.nestedDirty = false;
      await performLeave();
    },
  );
});

describe('useNavigateToArchitect9', () => {
  it('navigates straight away when nothing is unsaved or in flight', async () => {
    const result = navigate();

    await expect(result.current(URL)).resolves.toBe(true);

    expect(mocks.promptLeaveEditor).not.toHaveBeenCalled();
    expect(mocks.leave).toHaveBeenCalledWith(URL);
  });

  it('waits for an in-flight commit before navigating', async () => {
    const finishCommit = beginProtocolCommit();
    const result = navigate();

    const navigating = result.current(URL);
    await Promise.resolve();
    expect(mocks.leave).not.toHaveBeenCalled();

    finishCommit();
    await expect(navigating).resolves.toBe(true);
    expect(isCriticalOperationInProgress()).toBe(false);
    expect(mocks.leave).toHaveBeenCalledWith(URL);
  });

  it.each([
    ['the stage editor', 'stageDirty'],
    ['a nested editor', 'nestedDirty'],
  ] as const)(
    'asks before discarding unsaved work in %s, and stays on cancel',
    async (_label, flag) => {
      mocks[flag] = true;
      mocks.confirmLeave = false;
      const result = navigate();

      await expect(result.current(URL)).resolves.toBe(false);

      expect(mocks.promptLeaveEditor).toHaveBeenCalledTimes(1);
      // The discard variant of the prompt, with this tab's persistence copy.
      expect(mocks.promptLeaveEditor.mock.calls[0]?.slice(3)).toEqual([
        true,
        'saved',
      ]);
      expect(mocks.leave).not.toHaveBeenCalled();
    },
  );

  it('on a confirmed discard, leaves the editor for the start screen, then navigates', async () => {
    mocks.stageDirty = true;
    const result = navigate();

    await expect(result.current(URL)).resolves.toBe(true);

    expect(mocks.navigateApp).toHaveBeenCalledWith('/', { replace: true });
    expect(mocks.leave).toHaveBeenCalledWith(URL);
    expect(mocks.navigateApp.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.leave.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it.each([
    'open-elsewhere',
    'reclaim-blocked',
    'storage-unavailable',
  ] as const)(
    'refuses an upgrade from a tab whose protocol is %s',
    async (persistence) => {
      mocks.persistence = persistence;
      const result = navigate();

      await expect(
        result.current(URL, { requireSavedProtocol: true }),
      ).resolves.toBe(false);

      expect(mocks.promptLeaveEditor).not.toHaveBeenCalled();
      expect(mocks.leave).not.toHaveBeenCalled();
    },
  );

  it('allows an upgrade from the start screen, where no protocol is open', async () => {
    mocks.persistence = 'no-protocol';
    const result = navigate();

    await expect(
      result.current(URL, { requireSavedProtocol: true }),
    ).resolves.toBe(true);
    expect(mocks.leave).toHaveBeenCalledWith(URL);
  });

  it('refuses if the tab lost its lock while the prompt was open', async () => {
    mocks.stageDirty = true;
    mocks.promptLeaveEditor.mockImplementationOnce(
      async (
        _dispatch: unknown,
        _openDialog: unknown,
        performLeave: () => void | Promise<void>,
      ) => {
        mocks.stageDirty = false;
        mocks.persistence = 'open-elsewhere';
        await performLeave();
      },
    );
    const result = navigate();

    await expect(
      result.current(URL, { requireSavedProtocol: true }),
    ).resolves.toBe(false);
    expect(mocks.leave).not.toHaveBeenCalled();
  });
});
