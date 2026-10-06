import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnyDialog } from '@codaco/fresco-ui/dialogs/DialogProvider';
import { renderQueuedMessage } from '~/test/renderQueuedMessage';

const openDialogSpy = globalThis.__architectDialogMocks.openDialog;

let stageDraftDirty = false;
// Partial: the beacon is a module singleton the editor publishes to, and this
// guard reads it imperatively. Only the reading is replaced, so subscribing
// and closing still behave as they do in the app.
vi.mock(
  '~/components/StageEditor/stageDraftBeacon',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('~/components/StageEditor/stageDraftBeacon')
    >()),
    readStageDraft: () => ({
      open: stageDraftDirty,
      dirty: stageDraftDirty,
      stage: undefined,
    }),
  }),
);

let nestedDraftDirty = false;
vi.mock('~/components/DialogForm/nestedDraftRegistry', () => ({
  hasDirtyNestedDraft: () => nestedDraftDirty,
  useNestedDraft: () => undefined,
}));

vi.mock('~/ducks/hooks', () => ({ useAppDispatch: () => vi.fn() }));
// A protocol has to be present, and this tab has to own its lock, or
// `getLeavePersistence` (#1386 + the lock rework) resolves to 'no-protocol' and
// `aroundNav` returns before it ever consults the dirty predicates.
vi.mock('~/ducks/store', () => ({
  store: {
    getState: () => ({
      activeProtocol: { present: { codebook: {} } },
      app: {},
    }),
  },
}));

const useProtocolNavGuard = vi.fn();
const promptLeaveEditor = vi.fn();
vi.mock('~/hooks/useProtocolNavGuard', async () => {
  const actual = await vi.importActual<
    typeof import('~/hooks/useProtocolNavGuard')
  >('~/hooks/useProtocolNavGuard');
  return {
    ...actual,
    useProtocolNavGuard: () => useProtocolNavGuard(),
    promptLeaveEditor: (...args: unknown[]) => promptLeaveEditor(...args),
  };
});

// wouter's Router calls `aroundNav` on navigation; render one and drive it.
const navigateSpy = vi.fn();
vi.mock('wouter', () => ({
  Router: ({
    children,
    aroundNav,
  }: {
    children: React.ReactNode;
    aroundNav: (nav: () => void, to: string, opts: unknown) => void;
  }) => {
    capturedAroundNav = aroundNav;
    return <div>{children}</div>;
  },
}));

let capturedAroundNav:
  | ((nav: () => void, to: string, opts: unknown) => void)
  | null = null;

const { default: ProtocolGuardedRouter } =
  await import('../ProtocolGuardedRouter');

const leaveProtocol = () => {
  window.history.pushState(null, '', '/protocol/stage/abc');
  capturedAroundNav!(navigateSpy, '/', {});
};

describe('ProtocolGuardedRouter', () => {
  beforeEach(() => {
    stageDraftDirty = false;
    nestedDraftDirty = false;
    promptLeaveEditor.mockReset();
    openDialogSpy.mockReset();
    openDialogSpy.mockResolvedValue(null);
    render(<ProtocolGuardedRouter>content</ProtocolGuardedRouter>);
  });

  it('treats a dirty nested editor as unsaved work, even with a pristine stage form', async () => {
    // The stage editor's own draft is the only thing the guard used to read,
    // and a nested editor never reaches it before save — so leaving with a
    // half-typed field editor open showed the reassuring "saved automatically"
    // dialog over a draft that was about to be discarded.
    nestedDraftDirty = true;

    leaveProtocol();

    await waitFor(() => expect(promptLeaveEditor).toHaveBeenCalledTimes(1));
    expect(promptLeaveEditor.mock.calls[0]![3]).toBe(true);
  });

  it('leaves the reassuring copy in place when nothing is unsaved', async () => {
    leaveProtocol();

    await waitFor(() => expect(promptLeaveEditor).toHaveBeenCalledTimes(1));
    expect(promptLeaveEditor.mock.calls[0]![3]).toBe(false);
  });

  it('still reports a dirty stage editor on its own', async () => {
    stageDraftDirty = true;

    leaveProtocol();

    await waitFor(() => expect(promptLeaveEditor).toHaveBeenCalledTimes(1));
    expect(promptLeaveEditor.mock.calls[0]![3]).toBe(true);
  });
});

describe('ProtocolGuardedRouter within the protocol', () => {
  const moveWithinProtocol = (to = '/protocol') => {
    window.history.pushState(null, '', '/protocol/localization');
    capturedAroundNav!(navigateSpy, to, {});
  };

  beforeEach(() => {
    stageDraftDirty = false;
    nestedDraftDirty = false;
    navigateSpy.mockReset();
    promptLeaveEditor.mockReset();
    openDialogSpy.mockReset();
    render(<ProtocolGuardedRouter>content</ProtocolGuardedRouter>);
  });

  it('moves straight to another page when no editor holds unsaved work', () => {
    moveWithinProtocol();

    expect(navigateSpy).toHaveBeenCalledWith('/protocol', {});
    expect(openDialogSpy).not.toHaveBeenCalled();
  });

  it('asks before another page discards an open editor’s unsaved work', async () => {
    // The Languages page's translation editors live on the page itself, so a
    // nav link that leaves it unmounts them and the typed text with them.
    nestedDraftDirty = true;
    openDialogSpy.mockResolvedValue(false);

    moveWithinProtocol();

    await waitFor(() => expect(openDialogSpy).toHaveBeenCalledTimes(1));
    expect(renderQueuedMessage(openDialogSpy.mock.calls[0]![0].title)).toBe(
      'Discard unsaved changes?',
    );
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(promptLeaveEditor).not.toHaveBeenCalled();
  });

  it('moves on once the researcher chooses to discard', async () => {
    nestedDraftDirty = true;
    openDialogSpy.mockResolvedValue(true);

    moveWithinProtocol();

    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith('/protocol', {}),
    );
  });

  it('does not ask when the link stays on the same page', () => {
    nestedDraftDirty = true;

    moveWithinProtocol('/protocol/localization?language=fr');

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(openDialogSpy).not.toHaveBeenCalled();
  });
});

describe('promptLeaveEditor copy', () => {
  it('never claims work is saved automatically once anything is unsaved', async () => {
    const actual = await vi.importActual<
      typeof import('~/hooks/useProtocolNavGuard')
    >('~/hooks/useProtocolNavGuard');
    const captured: AnyDialog[] = [];

    actual.guardState.prompting = false;
    await actual.promptLeaveEditor(
      vi.fn() as never,
      (async (config: AnyDialog) => {
        captured.push(config);
        return null;
      }) as never,
      vi.fn(),
      true,
    );

    const dialog = captured[0];
    expect(renderQueuedMessage(dialog?.description)).not.toMatch(
      /saved automatically/i,
    );
    // The single decision point: this copy has to cover an open editor too,
    // because the researcher is not asked a second time by the editor itself.
    expect(renderQueuedMessage(dialog?.description)).toMatch(
      /editor you still have open/i,
    );
  });
});
