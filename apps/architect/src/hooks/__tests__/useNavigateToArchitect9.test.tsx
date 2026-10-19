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
  storeListeners: new Set<() => void>(),
}));

// A store change, as the lock or the open protocol changing would dispatch.
const notifyStore = () => {
  for (const listener of mocks.storeListeners) listener();
};

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
  useAppStore: () => ({
    getState: () => ({}),
    subscribe: (listener: () => void) => {
      mocks.storeListeners.add(listener);
      return () => {
        mocks.storeListeners.delete(listener);
      };
    },
  }),
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
  mocks.storeListeners.clear();
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

  it('reads a URL function only at the moment of leaving', async () => {
    mocks.stageDirty = true;
    let latest = URL;
    const resolveUrl = vi.fn(() => latest);
    mocks.promptLeaveEditor.mockImplementationOnce(
      async (
        _dispatch: unknown,
        _openDialog: unknown,
        performLeave: () => void | Promise<void>,
      ) => {
        // A newer launch arrives while the prompt is open.
        latest = '/?import=newer';
        mocks.stageDirty = false;
        await performLeave();
      },
    );
    const result = navigate();

    await expect(result.current(resolveUrl)).resolves.toBe(true);

    expect(resolveUrl).toHaveBeenCalledTimes(1);
    expect(mocks.leave).toHaveBeenCalledWith('/?import=newer');
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

  it('refuses if the lock was lost during the prompt, even though the confirmed leave then cleared the protocol', async () => {
    mocks.stageDirty = true;
    mocks.promptLeaveEditor.mockImplementationOnce(
      async (
        _dispatch: unknown,
        _openDialog: unknown,
        performLeave: () => void | Promise<void>,
      ) => {
        mocks.persistence = 'open-elsewhere';
        notifyStore();
        // The real prompt clears the active protocol before it returns.
        mocks.stageDirty = false;
        mocks.persistence = 'no-protocol';
        notifyStore();
        await performLeave();
      },
    );
    const result = navigate();

    await expect(
      result.current(URL, { requireSavedProtocol: true }),
    ).resolves.toBe(false);
    expect(mocks.leave).not.toHaveBeenCalled();
    expect(mocks.storeListeners.size).toBe(0);
  });

  it('refuses if the lock was lost while waiting for an in-flight commit, before the prompt', async () => {
    mocks.stageDirty = true;
    const finishCommit = beginProtocolCommit();
    const result = navigate();

    const navigation = result.current(URL, { requireSavedProtocol: true });
    mocks.persistence = 'open-elsewhere';
    notifyStore();
    finishCommit();
    mocks.promptLeaveEditor.mockImplementationOnce(
      async (
        _dispatch: unknown,
        _openDialog: unknown,
        performLeave: () => void | Promise<void>,
      ) => {
        mocks.stageDirty = false;
        mocks.persistence = 'no-protocol';
        notifyStore();
        await performLeave();
      },
    );

    await expect(navigation).resolves.toBe(false);
    expect(mocks.leave).not.toHaveBeenCalled();
    expect(mocks.storeListeners.size).toBe(0);
  });
});
