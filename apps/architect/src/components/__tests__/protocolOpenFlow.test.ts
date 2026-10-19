import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderQueuedMessage } from '~/test/renderQueuedMessage';

const mocks = vi.hoisted(() => ({
  showProtocolOpenResultDialog: vi.fn(),
  openLocalNetcanvas: vi.fn((arg: unknown) => ({ type: 'open-file', arg })),
  upgradeLegacyProtocol: vi.fn((arg: unknown) => ({ type: 'upgrade', arg })),
  planLegacyProtocolOpen: vi.fn(),
  getBundledLegacyArchitect: vi.fn(),
  goToLegacyArchitect: vi.fn(),
  stageHandoff: vi.fn(),
  discardHandoff: vi.fn(),
  recordLegacyProtocolKept: vi.fn(),
  whenCriticalOperationsSettle: vi.fn(),
  getLeavePersistence: vi.fn(),
  promptLeaveEditor: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock('~/components/protocolOpenDialogs', () => ({
  showProtocolOpenResultDialog: mocks.showProtocolOpenResultDialog,
}));
vi.mock('~/ducks/modules/userActions/userActions', () => ({
  openLocalNetcanvas: mocks.openLocalNetcanvas,
  upgradeLegacyProtocol: mocks.upgradeLegacyProtocol,
  planLegacyProtocolOpen: mocks.planLegacyProtocolOpen,
}));
vi.mock('~/ducks/store', () => ({ store: { getState: () => ({}) } }));
vi.mock('~/hooks/useProtocolNavGuard', () => ({
  getLeavePersistence: mocks.getLeavePersistence,
  isProtocolPath: (path: string) => path.startsWith('/protocol'),
  promptLeaveEditor: mocks.promptLeaveEditor,
}));
vi.mock('~/components/StageEditor/stageDraftBeacon', () => ({
  readStageDraft: () => ({ dirty: false }),
}));
vi.mock('~/components/DialogForm/nestedDraftRegistry', () => ({
  hasDirtyNestedDraft: () => false,
}));
vi.mock('~/utils/legacyArchitect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/legacyArchitect')>()),
  getBundledLegacyArchitect: mocks.getBundledLegacyArchitect,
  goToLegacyArchitect: mocks.goToLegacyArchitect,
}));
vi.mock('~/utils/handoffStore', () => ({
  stageHandoff: mocks.stageHandoff,
  discardHandoff: mocks.discardHandoff,
}));
vi.mock('~/utils/protocolLibrary', () => ({
  recordLegacyProtocolKept: mocks.recordLegacyProtocolKept,
}));
vi.mock('~/utils/criticalOperation', () => ({
  whenCriticalOperationsSettle: mocks.whenCriticalOperationsSettle,
}));
vi.mock('~/utils/reportError', () => ({ reportError: mocks.reportError }));

import {
  confirmLegacyProtocolUpgrade,
  openLegacyLibraryProtocol,
  openNetcanvasFile,
} from '../protocolOpenFlow';

type DialogArgs = {
  result: { status: string };
  onApproveMigration?: () => Promise<void>;
  onKeepLegacy?: () => Promise<void>;
};

const LEGACY_ID = '0b6c1f8e-6c0e-4d2a-9a51-2f7d3c9e8a10';
const HANDOFF_KEY = '5f0e1f8e-6c0e-4d2a-9a51-2f7d3c9e8a11';
const ARCHITECT_8 = { version: '8.5.0', path: '/v8/' as const };

const migrationRequired = {
  status: 'migration-required',
  protocolSchemaVersion: 8,
  targetSchemaVersion: 9,
  migrationNotes: [],
};

const openDialog = vi.fn();
// Thunks are plain action objects here; the dispatch answers each by type.
const results: Record<string, unknown[]> = {};
const dispatch = vi.fn((action: { type: string }) => ({
  unwrap: () => Promise.resolve(results[action.type]?.shift()),
}));
const context = () => ({
  dispatch: dispatch as never,
  openDialog,
});

/** The arguments of the last result dialog shown. */
const lastDialog = (): DialogArgs =>
  mocks.showProtocolOpenResultDialog.mock.calls.at(-1)![0] as DialogArgs;

const setPath = (path: string) => window.history.replaceState(null, '', path);

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.openLocalNetcanvas.mockImplementation((arg: unknown) => ({
    type: 'open-file',
    arg,
  }));
  mocks.upgradeLegacyProtocol.mockImplementation((arg: unknown) => ({
    type: 'upgrade',
    arg,
  }));
  mocks.whenCriticalOperationsSettle.mockResolvedValue(undefined);
  mocks.stageHandoff.mockResolvedValue(HANDOFF_KEY);
  mocks.discardHandoff.mockResolvedValue(undefined);
  mocks.recordLegacyProtocolKept.mockResolvedValue(undefined);
  mocks.getLeavePersistence.mockReturnValue('no-protocol');
  mocks.getBundledLegacyArchitect.mockReturnValue(null);
  openDialog.mockReset();
  openDialog.mockResolvedValue(true);
  dispatch.mockClear();
  for (const key of Object.keys(results)) delete results[key];
  setPath('/');
});

describe('openNetcanvasFile', () => {
  const file = new File(['zip'], 'study.netcanvas');

  it('reopens the file with the upgrade approved, and offers no Architect 8 when none is bundled', async () => {
    results['open-file'] = [migrationRequired, { status: 'opened' }];
    mocks.showProtocolOpenResultDialog.mockImplementation(
      async ({ result, onApproveMigration }: DialogArgs) => {
        if (result.status === 'migration-required') {
          await onApproveMigration?.();
        }
      },
    );

    await openNetcanvasFile({ file, ...context() });

    expect(mocks.openLocalNetcanvas.mock.calls.map(([arg]) => arg)).toEqual([
      { file, migrationApproved: false },
      { file, migrationApproved: true },
    ]);
    expect(mocks.showProtocolOpenResultDialog.mock.calls[0]![0]).toHaveProperty(
      'onKeepLegacy',
      undefined,
    );
  });

  it('stages the file for Architect 8 and navigates there only once commits and transfers have landed', async () => {
    mocks.getBundledLegacyArchitect.mockReturnValue(ARCHITECT_8);
    results['open-file'] = [migrationRequired];
    let commitsLanded: () => void = () => undefined;
    mocks.whenCriticalOperationsSettle.mockReturnValue(
      new Promise<void>((resolve) => {
        commitsLanded = resolve;
      }),
    );

    await openNetcanvasFile({ file, ...context() });
    const keeping = lastDialog().onKeepLegacy!();
    await vi.waitFor(() =>
      expect(mocks.whenCriticalOperationsSettle).toHaveBeenCalled(),
    );

    expect(mocks.stageHandoff).toHaveBeenCalledExactlyOnceWith({
      targetMajor: 8,
      file,
      fileName: 'study.netcanvas',
    });
    expect(mocks.goToLegacyArchitect).not.toHaveBeenCalled();

    commitsLanded();
    await keeping;
    expect(mocks.goToLegacyArchitect).toHaveBeenCalledExactlyOnceWith(
      `/v8/?import=${HANDOFF_KEY}`,
    );
  });

  it('says so, and stays, when the file cannot be staged', async () => {
    mocks.getBundledLegacyArchitect.mockReturnValue(ARCHITECT_8);
    mocks.stageHandoff.mockRejectedValue(new Error('QuotaExceededError'));
    results['open-file'] = [migrationRequired];

    await openNetcanvasFile({ file, ...context() });
    await lastDialog().onKeepLegacy!();

    expect(mocks.goToLegacyArchitect).not.toHaveBeenCalled();
    const [config] = openDialog.mock.calls[0] as [
      { intent: string; title: unknown },
    ];
    expect(config.intent).toBe('destructive');
    expect(renderQueuedMessage(config.title as never)).toBe(
      'Could not open in Architect 8',
    );
  });

  it('asks before leaving an open protocol, and withdraws the staged file when told not to', async () => {
    mocks.getBundledLegacyArchitect.mockReturnValue(ARCHITECT_8);
    mocks.getLeavePersistence.mockReturnValue('saved');
    setPath('/protocol');
    results['open-file'] = [migrationRequired];
    // The researcher cancels the leave-editor prompt.
    mocks.promptLeaveEditor.mockResolvedValue(undefined);

    await openNetcanvasFile({ file, ...context() });
    await lastDialog().onKeepLegacy!();

    expect(mocks.promptLeaveEditor).toHaveBeenCalledOnce();
    expect(mocks.goToLegacyArchitect).not.toHaveBeenCalled();
    expect(mocks.discardHandoff).toHaveBeenCalledExactlyOnceWith(HANDOFF_KEY);
  });

  it('leaves an open protocol for Architect 8 once the researcher agrees', async () => {
    mocks.getBundledLegacyArchitect.mockReturnValue(ARCHITECT_8);
    mocks.getLeavePersistence.mockReturnValue('saved');
    setPath('/protocol');
    results['open-file'] = [migrationRequired];
    mocks.promptLeaveEditor.mockImplementation(
      async (
        _dispatch: unknown,
        _openDialog: unknown,
        performLeave: () => Promise<void>,
      ) => {
        await performLeave();
      },
    );

    await openNetcanvasFile({ file, ...context() });
    await lastDialog().onKeepLegacy!();

    expect(mocks.goToLegacyArchitect).toHaveBeenCalledExactlyOnceWith(
      `/v8/?import=${HANDOFF_KEY}`,
    );
    expect(mocks.discardHandoff).not.toHaveBeenCalled();
    // The prompt names Architect 8 as where leaving goes, not the start
    // screen.
    expect(mocks.promptLeaveEditor.mock.calls[0]?.[5]).toEqual({
      kind: 'legacy-architect',
      version: 8,
    });
  });
});

describe('openLegacyLibraryProtocol', () => {
  const plan = (choice?: 'legacy' | 'upgraded') => ({
    status: 'ready',
    choice: choice ? { legacyId: LEGACY_ID, choice, updatedAt: 1 } : undefined,
    result: migrationRequired,
  });

  it('goes straight to Architect 8 for a protocol the researcher kept there', async () => {
    mocks.getBundledLegacyArchitect.mockReturnValue(ARCHITECT_8);
    mocks.planLegacyProtocolOpen.mockResolvedValue(plan('legacy'));

    await openLegacyLibraryProtocol({ legacyId: LEGACY_ID, ...context() });

    expect(mocks.showProtocolOpenResultDialog).not.toHaveBeenCalled();
    expect(mocks.goToLegacyArchitect).toHaveBeenCalledExactlyOnceWith(
      `/v8/?open=${LEGACY_ID}`,
    );
  });

  it('offers only the upgrade when no Architect 8 is bundled, whatever was remembered', async () => {
    mocks.planLegacyProtocolOpen.mockResolvedValue(plan('legacy'));

    await openLegacyLibraryProtocol({ legacyId: LEGACY_ID, ...context() });

    expect(lastDialog().result).toBe(migrationRequired);
    expect(lastDialog().onKeepLegacy).toBeUndefined();
    expect(mocks.goToLegacyArchitect).not.toHaveBeenCalled();
  });

  it('remembers a decision to keep it in Architect 8, then opens it there', async () => {
    mocks.getBundledLegacyArchitect.mockReturnValue(ARCHITECT_8);
    mocks.planLegacyProtocolOpen.mockResolvedValue(plan());

    await openLegacyLibraryProtocol({ legacyId: LEGACY_ID, ...context() });
    expect(mocks.goToLegacyArchitect).not.toHaveBeenCalled();
    await lastDialog().onKeepLegacy!();

    expect(mocks.recordLegacyProtocolKept).toHaveBeenCalledExactlyOnceWith(
      LEGACY_ID,
    );
    expect(mocks.goToLegacyArchitect).toHaveBeenCalledExactlyOnceWith(
      `/v8/?open=${LEGACY_ID}`,
    );
    expect(mocks.stageHandoff).not.toHaveBeenCalled();
  });

  it('still opens it in Architect 8 when the decision cannot be remembered', async () => {
    mocks.getBundledLegacyArchitect.mockReturnValue(ARCHITECT_8);
    mocks.planLegacyProtocolOpen.mockResolvedValue(plan());
    mocks.recordLegacyProtocolKept.mockRejectedValue(new Error('blocked'));

    await openLegacyLibraryProtocol({ legacyId: LEGACY_ID, ...context() });
    await lastDialog().onKeepLegacy!();

    expect(mocks.reportError).toHaveBeenCalled();
    expect(mocks.goToLegacyArchitect).toHaveBeenCalledOnce();
  });

  it('upgrades a copy and reports how it went', async () => {
    mocks.planLegacyProtocolOpen.mockResolvedValue(plan('upgraded'));
    const refusal = { status: 'validation-error', message: 'bad' };
    results.upgrade = [refusal];

    await openLegacyLibraryProtocol({ legacyId: LEGACY_ID, ...context() });
    await lastDialog().onApproveMigration!();

    expect(mocks.upgradeLegacyProtocol).toHaveBeenCalledExactlyOnceWith({
      legacyId: LEGACY_ID,
    });
    expect(lastDialog().result).toBe(refusal);
  });

  it('shows why it could not be opened', async () => {
    const refusal = { status: 'error', title: 'Protocol Not Found' };
    mocks.planLegacyProtocolOpen.mockResolvedValue({
      status: 'refused',
      result: refusal,
    });

    await openLegacyLibraryProtocol({ legacyId: LEGACY_ID, ...context() });

    expect(lastDialog().result).toBe(refusal);
    expect(lastDialog().onApproveMigration).toBeUndefined();
  });
});

describe('confirmLegacyProtocolUpgrade', () => {
  it('offers the upgrade even for a protocol kept in Architect 8, and nothing else', async () => {
    mocks.getBundledLegacyArchitect.mockReturnValue(ARCHITECT_8);
    mocks.planLegacyProtocolOpen.mockResolvedValue({
      status: 'ready',
      choice: { legacyId: LEGACY_ID, choice: 'legacy', updatedAt: 1 },
      result: migrationRequired,
    });

    await confirmLegacyProtocolUpgrade({ legacyId: LEGACY_ID, ...context() });

    expect(mocks.goToLegacyArchitect).not.toHaveBeenCalled();
    expect(lastDialog().result).toBe(migrationRequired);
    expect(lastDialog().onKeepLegacy).toBeUndefined();
    expect(lastDialog().onApproveMigration).toBeTypeOf('function');
  });
});
