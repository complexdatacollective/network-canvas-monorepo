import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { CurrentProtocol } from '@codaco/protocol-validation';

const capture = vi.fn();
const setImportInProgress = vi.fn();
const setExportInProgress = vi.fn();
const validateProtocol = vi.fn();
const putStoredProtocol = vi.fn();
const saveProtocolAssets = vi.fn();
const deleteStoredProtocol = vi.fn();
const reportError = vi.fn((error: unknown) => ({
  message: error instanceof Error ? error.message : String(error),
}));

vi.mock('~/analytics', () => ({
  posthog: { capture: (...args: unknown[]) => capture(...args) },
}));

vi.mock('~/utils/criticalOperation', () => ({
  setImportInProgress: (value: boolean) => setImportInProgress(value),
  setExportInProgress: (value: boolean) => setExportInProgress(value),
}));

vi.mock('@codaco/protocol-validation', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@codaco/protocol-validation')>();
  return {
    ...actual,
    validateProtocol: (...args: unknown[]) => validateProtocol(...args),
  };
});

vi.mock('~/utils/protocolLibrary', () => ({
  putStoredProtocol: (...args: unknown[]) => putStoredProtocol(...args),
  deleteStoredProtocol: (...args: unknown[]) => deleteStoredProtocol(...args),
  getStoredProtocol: vi.fn(),
}));

vi.mock('~/utils/assetUtils', () => ({
  saveProtocolAssets: (...args: unknown[]) => saveProtocolAssets(...args),
  saveProtocolAssetsToMemory: vi.fn(),
}));

vi.mock('~/utils/reportError', () => ({
  reportError: (error: unknown) => reportError(error),
}));

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}));

vi.mock('~/utils/beforeUnloadGuard', () => ({
  armInMemoryUnloadGuard: vi.fn(),
  disarmInMemoryUnloadGuard: vi.fn(),
}));

vi.mock('~/ducks/modules/userActions/dialogs', () => ({
  appUpgradeRequiredDialog: vi.fn(() => ({ type: 'dialog' })),
  generalErrorDialog: vi.fn(() => ({ type: 'dialog' })),
  mayUpgradeProtocolDialog: vi.fn(() => ({ type: 'dialog' })),
  validationErrorDialog: vi.fn(() => ({ type: 'dialog' })),
}));

vi.mock('../../activeProtocol', () => ({
  clearActiveProtocol: vi.fn(() => ({ type: 'clearActiveProtocol' })),
  setActiveProtocol: vi.fn(() => ({ type: 'setActiveProtocol' })),
}));

vi.mock('../../app', () => ({
  getActiveProtocolId: vi.fn(),
  setActiveProtocolId: vi.fn(() => ({ type: 'setActiveProtocolId' })),
  setStorageUnavailable: vi.fn(() => ({ type: 'setStorageUnavailable' })),
}));

// Imported after mocks so the thunks pick up the mocked collaborators.
const { openBundledTemplate } = await import('../userActions');

const dispatch = vi.fn((action: unknown) => {
  // `instantiateProtocol` dispatches plain action objects; the thunks under
  // test never `.unwrap()` a nested thunk in these scenarios.
  if (typeof action === 'function') {
    return { unwrap: () => Promise.resolve(undefined) };
  }
  return action;
});

const runThunk = (thunk: ReturnType<typeof openBundledTemplate>) =>
  thunk(dispatch, () => ({}) as never, undefined);

const makeProtocol = (): CurrentProtocol =>
  ({
    name: 'My Study',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  }) as CurrentProtocol;

describe('userActions', () => {
  beforeEach(() => {
    capture.mockReset();
    setImportInProgress.mockReset();
    validateProtocol.mockReset();
    putStoredProtocol.mockReset().mockResolvedValue(undefined);
    saveProtocolAssets.mockReset().mockResolvedValue(undefined);
    deleteStoredProtocol.mockReset().mockResolvedValue(undefined);
    dispatch.mockClear();
  });

  describe('import validation-failure analytics redaction (#766)', () => {
    it('never sends protocol-derived strings to analytics on a failed import', async () => {
      // A real codebook uniqueness failure embeds the raw variable record key
      // (a protocol-derived identifier) in its message.
      const secretVariableName = 'participant_hiv_status';
      const error = new z.ZodError([
        {
          code: 'custom',
          message: `Variable record key "${secretVariableName}" is reused across entity types`,
          path: ['codebook'],
          input: undefined,
        },
      ]);
      validateProtocol.mockResolvedValue({ success: false, error });

      await runThunk(openBundledTemplate({ protocol: makeProtocol() }));

      const failureCall = capture.mock.calls.find(
        ([event]) => event === 'protocol_import_failed',
      );
      expect(failureCall).toBeDefined();

      const payload = JSON.stringify(failureCall?.[1] ?? {});
      // The secret must not leak through any field (message, form/field errors).
      expect(payload).not.toContain(secretVariableName);

      // And the payload must still carry structural, non-identifying signal.
      const props = failureCall?.[1] as Record<string, unknown>;
      expect(props.error_count).toBe(1);
    });
  });

  describe('critical-operation guard on bundled-template open (#813)', () => {
    it('guards the whole open in setImportInProgress(true)/finally(false)', async () => {
      validateProtocol.mockResolvedValue({
        success: true,
        data: makeProtocol(),
      });

      await runThunk(openBundledTemplate({ protocol: makeProtocol() }));

      expect(setImportInProgress).toHaveBeenCalledWith(true);
      expect(setImportInProgress).toHaveBeenLastCalledWith(false);

      // The guard must be armed before assets are written, and disarmed after.
      const armOrder = setImportInProgress.mock.invocationCallOrder[0]!;
      const disarmCalls = setImportInProgress.mock.calls
        .map((call, index) => ({ value: call[0], index }))
        .filter((entry) => entry.value === false);
      const disarmOrder =
        setImportInProgress.mock.invocationCallOrder[disarmCalls[0]!.index]!;
      const writeOrder = saveProtocolAssets.mock.invocationCallOrder[0]!;
      expect(armOrder).toBeLessThan(writeOrder);
      expect(disarmOrder).toBeGreaterThan(writeOrder);
    });

    it('clears the guard even when the import throws', async () => {
      validateProtocol.mockRejectedValue(new Error('boom'));

      await runThunk(openBundledTemplate({ protocol: makeProtocol() }));

      expect(setImportInProgress).toHaveBeenCalledWith(true);
      expect(setImportInProgress).toHaveBeenLastCalledWith(false);
    });
  });
});
