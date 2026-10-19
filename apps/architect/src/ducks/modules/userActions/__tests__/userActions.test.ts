import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDefaultFinishSessionStage,
  type CurrentProtocol,
  DEFAULT_FINISH_SESSION_TEXT,
  ProtocolValidationError,
} from '@codaco/protocol-validation';
import { messageFields } from '~/test/messageText';

const capture = vi.fn();
const setImportInProgress = vi.fn();
const setExportInProgress = vi.fn();
const validateProtocol = vi.fn();
const migrateProtocol = vi.fn();
const setActiveProtocol = vi.fn();
const putStoredProtocol = vi.fn();
const getStoredProtocol = vi.fn();
const markStoredProtocolValidated = vi.fn();
const saveProtocolAssets = vi.fn();
const deleteStoredProtocol = vi.fn();
const getLegacyProtocolChoice = vi.fn();
const writeUpgradedLegacyCopy = vi.fn();
const readLegacyProtocolSnapshot = vi.fn();
const getLegacyProtocol = vi.fn();
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
    // The migration itself is protocol-validation's own contract and is tested
    // there; what these tests own is what Architect does with its outcome.
    migrateProtocol: (...args: unknown[]) => migrateProtocol(...args),
  };
});

vi.mock('~/utils/protocolLibrary', () => ({
  putStoredProtocol: (...args: unknown[]) => putStoredProtocol(...args),
  markStoredProtocolValidated: (...args: unknown[]) =>
    markStoredProtocolValidated(...args),
  deleteStoredProtocol: (...args: unknown[]) => deleteStoredProtocol(...args),
  getStoredProtocol: (...args: unknown[]) => getStoredProtocol(...args),
  getLegacyProtocolChoice: (...args: unknown[]) =>
    getLegacyProtocolChoice(...args),
  writeUpgradedLegacyCopy: (...args: unknown[]) =>
    writeUpgradedLegacyCopy(...args),
}));

vi.mock('~/utils/legacyProtocolLibrary', () => ({
  readLegacyProtocolSnapshot: (...args: unknown[]) =>
    readLegacyProtocolSnapshot(...args),
  getLegacyProtocol: (...args: unknown[]) => getLegacyProtocol(...args),
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

vi.mock('../../activeProtocol', () => ({
  clearActiveProtocol: vi.fn(() => ({ type: 'clearActiveProtocol' })),
  setActiveProtocol: (...args: unknown[]) => {
    setActiveProtocol(...args);
    return { type: 'setActiveProtocol' };
  },
}));

vi.mock('../../app', () => ({
  getActiveProtocolId: vi.fn(),
  setActiveProtocolId: vi.fn(() => ({ type: 'setActiveProtocolId' })),
  setStorageUnavailable: vi.fn(() => ({ type: 'setStorageUnavailable' })),
}));

// Imported after mocks so the thunks pick up the mocked collaborators.
const {
  createNetcanvas,
  openBundledTemplate,
  openLibraryProtocol,
  openLocalNetcanvas,
  planLegacyProtocolOpen,
  upgradeLegacyProtocol,
} = await import('../userActions');
const { APP_SCHEMA_VERSION } = await import('~/config');
const { navigate } = await import('wouter/use-browser-location');
const { setActiveProtocolId, setStorageUnavailable } =
  await import('../../app');

const dispatch = vi.fn((action: unknown) => {
  // `instantiateProtocol` dispatches plain action objects; the thunks under
  // test never `.unwrap()` a nested thunk in these scenarios.
  if (typeof action === 'function') {
    return { unwrap: () => Promise.resolve(undefined) };
  }
  return action;
});

const runThunk = (
  thunk:
    | ReturnType<typeof createNetcanvas>
    | ReturnType<typeof openBundledTemplate>
    | ReturnType<typeof openLibraryProtocol>
    | ReturnType<typeof upgradeLegacyProtocol>,
) => thunk(dispatch, () => ({}) as never, undefined);

const makeProtocol = (): CurrentProtocol => ({
  name: 'My Study',
  schemaVersion: APP_SCHEMA_VERSION,
  localization: { defaultLocale: 'en', locales: ['en'] },
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
});

describe('userActions', () => {
  beforeEach(() => {
    capture.mockReset();
    // Asserted as "not called" below, so it must not carry another test's calls.
    reportError.mockClear();
    setImportInProgress.mockReset();
    validateProtocol.mockReset();
    migrateProtocol.mockReset();
    setActiveProtocol.mockReset();
    putStoredProtocol.mockReset().mockResolvedValue(undefined);
    getStoredProtocol.mockReset();
    markStoredProtocolValidated.mockReset().mockResolvedValue(undefined);
    saveProtocolAssets.mockReset().mockResolvedValue(undefined);
    deleteStoredProtocol.mockReset().mockResolvedValue(undefined);
    getLegacyProtocolChoice.mockReset().mockResolvedValue(undefined);
    writeUpgradedLegacyCopy.mockReset();
    readLegacyProtocolSnapshot.mockReset();
    getLegacyProtocol.mockReset();
    vi.mocked(navigate).mockClear();
    vi.mocked(setActiveProtocolId).mockClear();
    vi.mocked(setStorageUnavailable).mockClear();
    dispatch.mockClear();
  });

  describe('createNetcanvas', () => {
    it('declares the chosen languages and default language', async () => {
      await runThunk(
        createNetcanvas({
          name: 'Étude',
          localization: { defaultLocale: 'fr', locales: ['en', 'fr'] },
        }),
      );

      expect(putStoredProtocol).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: expect.objectContaining({
            localization: { defaultLocale: 'fr', locales: ['en', 'fr'] },
          }),
        }),
      );
    });
  });

  describe('a new protocol', () => {
    it('starts with one finish stage, with the supplied closing text in each language that has it', async () => {
      await runThunk(
        createNetcanvas({
          name: 'Étude',
          localization: { defaultLocale: 'fr', locales: ['fr', 'en', 'ja'] },
        }),
      );

      const [[{ protocol }]] = putStoredProtocol.mock.calls as [
        [{ protocol: CurrentProtocol }],
      ];
      expect(protocol.stages).toEqual([
        {
          id: expect.any(String),
          type: 'FinishSession',
          label: {
            fr: DEFAULT_FINISH_SESSION_TEXT.fr.label,
            en: DEFAULT_FINISH_SESSION_TEXT.en.label,
          },
          mode: 'confirmation',
          content: {
            fr: DEFAULT_FINISH_SESSION_TEXT.fr.content,
            en: DEFAULT_FINISH_SESSION_TEXT.en.content,
          },
          finishedContent: {
            fr: DEFAULT_FINISH_SESSION_TEXT.fr.finishedContent,
            en: DEFAULT_FINISH_SESSION_TEXT.en.finishedContent,
          },
          // The screen's own words, which Network Canvas also supplies.
          finishLabel: { fr: 'Terminer', en: 'Finish' },
          finishConfirmation: {
            fr: 'Voulez-vous vraiment terminer l’entretien ?',
            en: 'Are you sure you want to finish the interview?',
          },
          finishFailed: {
            fr: 'L’entretien n’a pas pu être terminé. Veuillez réessayer. Si le problème persiste, contactez l’équipe responsable de l’étude.',
            en: 'The interview could not be finished. Please try again. If the problem continues, contact the study organizer.',
          },
          outcome: 'completed',
        },
      ]);
    });
  });

  // Network Canvas supplies no closing text in Japanese, so the finish stage
  // starts with none rather than with English recorded as Japanese. The
  // protocol is written and reopened like any other; only downloading it is
  // refused until the text is written (`bundleProtocol`).
  describe('a new protocol in a language with no supplied closing text', () => {
    it('is created with an empty finish stage, saved, and reopened', async () => {
      const actual = await vi.importActual<
        typeof import('@codaco/protocol-validation')
      >('@codaco/protocol-validation');
      validateProtocol.mockImplementation(actual.validateProtocol);
      const localization = { defaultLocale: 'ja', locales: ['ja'] };

      await runThunk(createNetcanvas({ name: '研究', localization }));

      const [[{ protocol }]] = putStoredProtocol.mock.calls as [
        [{ protocol: CurrentProtocol }],
      ];
      expect(protocol.stages).toEqual([
        {
          id: expect.any(String),
          type: 'FinishSession',
          label: {},
          mode: 'confirmation',
          content: {},
          finishedContent: {},
          // The screen's own words are required, so they are English under
          // Japanese until the researcher translates them.
          finishLabel: { ja: 'Finish' },
          finishConfirmation: {
            ja: 'Are you sure you want to finish the interview?',
          },
          finishFailed: {
            ja: 'The interview could not be finished. Please try again. If the problem continues, contact the study organizer.',
          },
          outcome: 'completed',
        },
      ]);

      // Reopened from the library as a row whose validity is not yet proven,
      // so it goes through validation again.
      getStoredProtocol.mockResolvedValue({
        id: 'ja',
        name: protocol.name,
        schemaVersion: protocol.schemaVersion,
        protocol,
        createdAt: 0,
        updatedAt: 0,
      });
      setActiveProtocol.mockReset();

      const result = await runThunk(openLibraryProtocol({ id: 'ja' }));

      expect(result.payload).toEqual({ status: 'opened' });
      expect(setActiveProtocol).toHaveBeenCalledWith(protocol);
      expect(validateProtocol).toHaveBeenLastCalledWith(protocol, {
        draft: true,
      });
    });
  });

  // A protocol may end with several finish stages, so one that arrives with
  // two at its end opens; one with a stage after a finish stage, which no
  // participant could reach, is refused rather than opened.
  describe('opening a protocol with two finish stages', () => {
    const localization = { defaultLocale: 'en', locales: ['en'] };
    const finish = (id: string) =>
      createDefaultFinishSessionStage({ id, localization });

    beforeEach(async () => {
      const actual = await vi.importActual<
        typeof import('@codaco/protocol-validation')
      >('@codaco/protocol-validation');
      validateProtocol.mockImplementation(actual.validateProtocol);
    });

    it('opens it when both are at the end', async () => {
      const protocol: CurrentProtocol = {
        ...makeProtocol(),
        stages: [finish('finish'), finish('finish-2')],
      };

      const result = await runThunk(openBundledTemplate({ protocol }));

      expect(result.payload).toEqual({ status: 'opened' });
      expect(setActiveProtocol).toHaveBeenCalled();
    });

    it('refuses one with a stage between them, naming the rule', async () => {
      const protocol: CurrentProtocol = {
        ...makeProtocol(),
        stages: [
          finish('finish'),
          {
            id: 'information',
            type: 'Information',
            label: { en: 'After the end' },
            title: { en: 'After the end' },
            items: [],
          },
          finish('finish-2'),
        ],
      };

      const result = await runThunk(openBundledTemplate({ protocol }));

      expect(result.payload).toEqual({
        status: 'validation-error',
        message: expect.stringContaining(
          'This stage comes after the finish stage at position 1, so no participant can reach it.',
        ),
      });
      expect(setActiveProtocol).not.toHaveBeenCalled();
    });
  });

  describe('import validation-failure analytics redaction (#766)', () => {
    it('never sends protocol-derived strings to analytics on a failed import', async () => {
      // A real codebook uniqueness failure embeds the raw variable record key
      // (a protocol-derived identifier) in its message.
      const secretVariableName = 'participant_hiv_status';
      const error = new ProtocolValidationError([
        {
          code: 'custom',
          message: `Variable record key "${secretVariableName}" is reused across entity types`,
          path: ['codebook'],
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

  describe('failures in the file are not reported as Architect defects', () => {
    // Builds a real .netcanvas whose manifest names a media file the archive
    // does not contain. This is the archive shape behind the missing-asset
    // reports in error tracking, so the thunk runs against the genuine
    // article rather than a stubbed rejection.
    const netcanvasMissingItsAsset = async (assetName: string) => {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      zip.file(
        'protocol.json',
        JSON.stringify({
          ...makeProtocol(),
          assetManifest: {
            'asset-1': {
              type: 'image',
              name: assetName,
              source: 'absent-from-the-zip.png',
            },
          },
        }),
      );
      const bytes = await zip.generateAsync({ type: 'arraybuffer' });
      return new File([bytes], 'My Study.netcanvas');
    };

    it('records the kind of file failure without reporting an exception', async () => {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      zip.file('notes.txt', 'no protocol in here');
      const file = new File(
        [await zip.generateAsync({ type: 'arraybuffer' })],
        'My Study.netcanvas',
      );

      const result = await openLocalNetcanvas({ file })(
        dispatch,
        () => ({}) as never,
        undefined,
      );

      expect(result.payload).toMatchObject({ status: 'error' });

      // A file the researcher chose being unreadable is an answer about that
      // file. Reporting it as an exception buries Architect's own bugs.
      expect(reportError).not.toHaveBeenCalled();

      const failureCall = capture.mock.calls.find(
        ([event]) => event === 'protocol_import_failed',
      );
      // A fixed vocabulary, carrying nothing from inside the researcher's file.
      expect(failureCall?.[1]).toEqual({
        source: 'local',
        reason: 'file',
        error_kind: 'missingProtocol',
      });
    });

    it('opens a protocol whose archive was missing a file, naming the resource', async () => {
      const researcherAuthoredName = 'Clinic Intake Photo';
      const file = await netcanvasMissingItsAsset(researcherAuthoredName);
      validateProtocol.mockImplementation(
        async (candidate: CurrentProtocol) => ({
          success: true,
          data: candidate,
        }),
      );

      const result = await openLocalNetcanvas({ file })(
        dispatch,
        () => ({}) as never,
        undefined,
      );

      // Refusing the whole protocol would leave the researcher with a file
      // only the tool that broke it can repair, when everything else is
      // intact. Export refuses until they supply the file, so an incomplete
      // protocol still cannot travel any further.
      expect(result.payload).toEqual({
        status: 'opened',
        unresolvedAssetNames: [researcherAuthoredName],
      });
      expect(setActiveProtocol).toHaveBeenCalled();
      expect(reportError).not.toHaveBeenCalled();
    });

    it('still reports a failure it cannot describe', async () => {
      validateProtocol.mockResolvedValue({
        success: true,
        data: makeProtocol(),
      });
      // Deliberately worded so `isStorageUnavailableError` does not claim it
      // (it matches /quota|indexeddb|idbdatabase/): this must land in the
      // unclassified branch, which is the one under test.
      putStoredProtocol.mockRejectedValue(new Error('library write failed'));

      await runThunk(openBundledTemplate({ protocol: makeProtocol() }));

      expect(reportError).toHaveBeenCalled();
      const failureCall = capture.mock.calls.find(
        ([event]) => event === 'protocol_import_failed',
      );
      expect(failureCall?.[1]).toMatchObject({
        source: 'bundled',
        reason: 'error',
      });
    });
  });

  describe('critical-operation guard on bundled-template open (#813)', () => {
    it('validates the final protocol after applying its requested name', async () => {
      const protocol = makeProtocol();
      validateProtocol.mockImplementation(
        async (candidate: CurrentProtocol) => ({
          success: true,
          data: candidate,
        }),
      );

      await runThunk(
        openBundledTemplate({ protocol, name: 'Renamed Template' }),
      );

      expect(validateProtocol).toHaveBeenCalledWith(
        { ...protocol, name: 'Renamed Template' },
        { draft: true },
      );
    });

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

  describe('stored protocol admission', () => {
    it('opens a provenance-marked row without repeat validation', async () => {
      const protocol = makeProtocol();
      getStoredProtocol.mockResolvedValue({
        id: 'p1',
        name: protocol.name,
        schemaVersion: protocol.schemaVersion,
        protocol,
        validated: true,
        createdAt: 0,
        updatedAt: 0,
      });

      const result = await runThunk(openLibraryProtocol({ id: 'p1' }));

      expect(result.payload).toEqual({ status: 'opened' });
      expect(validateProtocol).not.toHaveBeenCalled();
      expect(markStoredProtocolValidated).not.toHaveBeenCalled();
      // A row already at this build's schema is opened exactly as stored —
      // nothing is migrated and nothing is written back.
      expect(migrateProtocol).not.toHaveBeenCalled();
      expect(putStoredProtocol).not.toHaveBeenCalled();
      expect(setActiveProtocol).toHaveBeenCalledWith(protocol);
    });

    it('hard-blocks an invalid unproven row', async () => {
      const protocol = makeProtocol();
      getStoredProtocol.mockResolvedValue({
        id: 'legacy',
        name: protocol.name,
        schemaVersion: protocol.schemaVersion,
        protocol,
        createdAt: 0,
        updatedAt: 0,
      });
      const error = new ProtocolValidationError([
        { code: 'custom', path: [], message: 'Legacy row is invalid' },
      ]);
      validateProtocol.mockResolvedValue({ success: false, error });

      const result = await runThunk(openLibraryProtocol({ id: 'legacy' }));

      expect(result.payload).toEqual({
        status: 'validation-error',
        message: error.message,
      });
      expect(markStoredProtocolValidated).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalledWith({ type: 'setActiveProtocol' });
    });
  });

  // This library holds only this schema's protocols. Architect 8's are
  // upgraded into a new row, never in place, so an out-of-date row here is
  // refused rather than migrated.
  describe('stored protocol schema compatibility', () => {
    const olderRow = {
      id: 'older',
      name: 'Older study',
      description: 'From a previous Architect',
      schemaVersion: APP_SCHEMA_VERSION - 1,
      protocol: {
        ...makeProtocol(),
        schemaVersion: APP_SCHEMA_VERSION - 1,
      } as CurrentProtocol,
      // Marked valid under the schema of its own day: provenance must not let
      // it past the version gate.
      validated: true as const,
      createdAt: 0,
      updatedAt: 0,
    };

    it('refuses a below-version row as invalid and changes nothing', async () => {
      getStoredProtocol.mockResolvedValue(olderRow);

      const result = await runThunk(openLibraryProtocol({ id: 'older' }));

      expect(result.payload).toEqual({
        status: 'validation-error',
        message: expect.stringContaining(
          `schema version ${APP_SCHEMA_VERSION - 1}`,
        ),
      });
      expect(migrateProtocol).not.toHaveBeenCalled();
      expect(validateProtocol).not.toHaveBeenCalled();
      expect(putStoredProtocol).not.toHaveBeenCalled();
      expect(markStoredProtocolValidated).not.toHaveBeenCalled();
      expect(setActiveProtocol).not.toHaveBeenCalled();
    });

    it('refuses a row written by a newer Architect', async () => {
      getStoredProtocol.mockResolvedValue({
        ...olderRow,
        id: 'newer',
        schemaVersion: APP_SCHEMA_VERSION + 1,
      });

      const result = await runThunk(openLibraryProtocol({ id: 'newer' }));

      expect(result.payload).toEqual({
        status: 'app-upgrade-required',
        protocolSchemaVersion: APP_SCHEMA_VERSION + 1,
      });
      expect(migrateProtocol).not.toHaveBeenCalled();
      expect(putStoredProtocol).not.toHaveBeenCalled();
      expect(setActiveProtocol).not.toHaveBeenCalled();
    });
  });

  // Architect 8's protocol is copied into this library, never changed: the
  // snapshot is read, migrated and validated, and only then written as a new
  // protocol, which is what opens.
  describe('planLegacyProtocolOpen', () => {
    const row = {
      id: 'legacy-1',
      name: 'Older study',
      schemaVersion: 7,
      protocol: { schemaVersion: 7, codebook: {}, stages: [] },
      createdAt: 0,
      updatedAt: 5,
    };

    it('offers the upgrade from the document’s own version, with the earlier decision', async () => {
      const { getMigrationInfo } = await import('@codaco/protocol-validation');
      const choice = { legacyId: 'legacy-1', choice: 'legacy', updatedAt: 1 };
      getLegacyProtocol.mockResolvedValue(row);
      getLegacyProtocolChoice.mockResolvedValue(choice);

      expect(await planLegacyProtocolOpen('legacy-1')).toEqual({
        status: 'ready',
        choice,
        result: {
          status: 'migration-required',
          protocolSchemaVersion: 7,
          targetSchemaVersion: APP_SCHEMA_VERSION,
          migrationNotes: getMigrationInfo(7, APP_SCHEMA_VERSION).notes,
        },
      });
      // Reads only: Architect 8's row is never written.
      expect(writeUpgradedLegacyCopy).not.toHaveBeenCalled();
    });

    it('refuses a protocol that is no longer in Architect 8’s library', async () => {
      getLegacyProtocol.mockResolvedValue(undefined);

      const plan = await planLegacyProtocolOpen('legacy-1');

      expect(plan.status).toBe('refused');
      expect(plan.result).toMatchObject({
        status: 'error',
        title: 'Protocol Not Found',
      });
    });

    it('describes, and reports, a library it cannot read', async () => {
      getLegacyProtocol.mockRejectedValue(new Error('UnknownError'));

      const plan = await planLegacyProtocolOpen('legacy-1');

      expect(plan.status).toBe('refused');
      expect(plan.result).toMatchObject({
        status: 'error',
        title: 'Protocol Open Error',
      });
      expect(reportError).toHaveBeenCalled();
      // A failure to read another app's library says nothing about this one.
      expect(setStorageUnavailable).not.toHaveBeenCalled();
    });
  });

  describe('upgradeLegacyProtocol', () => {
    const legacyProtocol = {
      schemaVersion: 8,
      codebook: {},
      stages: [],
      assetManifest: { a1: { id: 'a1', type: 'image', name: 'map.png' } },
    };
    const snapshot = {
      row: {
        id: 'legacy-1',
        name: 'Older study',
        schemaVersion: 8,
        protocol: legacyProtocol,
        createdAt: 0,
        updatedAt: 5,
      },
      assets: [
        {
          id: 'legacy-1::a1',
          assetId: 'a1',
          protocolId: 'legacy-1',
          name: 'map.png',
          data: 'blob',
        },
      ],
    };

    it('writes the migrated copy as a new protocol and opens it', async () => {
      const upgraded = { ...makeProtocol(), name: 'Older study' };
      readLegacyProtocolSnapshot.mockResolvedValue(snapshot);
      getLegacyProtocolChoice.mockResolvedValue({
        legacyId: 'legacy-1',
        choice: 'upgraded',
        upgradedId: 'earlier-copy',
        updatedAt: 1,
      });
      migrateProtocol.mockReturnValue(upgraded);
      validateProtocol.mockResolvedValue({ success: true, data: upgraded });
      writeUpgradedLegacyCopy.mockResolvedValue({
        protocolId: 'new-copy',
        created: true,
      });

      const result = await runThunk(
        upgradeLegacyProtocol({ legacyId: 'legacy-1' }),
      );

      expect(result.payload).toEqual({ status: 'opened' });
      expect(readLegacyProtocolSnapshot).toHaveBeenCalledWith('legacy-1');
      expect(migrateProtocol).toHaveBeenCalledWith(
        legacyProtocol,
        APP_SCHEMA_VERSION,
        { name: 'Older study' },
      );
      expect(validateProtocol).toHaveBeenCalledWith(upgraded, { draft: true });
      expect(writeUpgradedLegacyCopy).toHaveBeenCalledWith({
        snapshot,
        protocol: upgraded,
        upgradedIdBefore: 'earlier-copy',
      });
      // Written only after it was migrated and validated.
      expect(
        writeUpgradedLegacyCopy.mock.invocationCallOrder[0]!,
      ).toBeGreaterThan(validateProtocol.mock.invocationCallOrder[0]!);
      // Nothing goes through the ordinary save path, which would also
      // garbage-collect assets.
      expect(putStoredProtocol).not.toHaveBeenCalled();
      expect(saveProtocolAssets).not.toHaveBeenCalled();
      expect(setActiveProtocolId).toHaveBeenCalledWith('new-copy');
      expect(setActiveProtocol).toHaveBeenCalledWith(upgraded);
      expect(navigate).toHaveBeenCalledWith('/protocol');
      expect(setImportInProgress).toHaveBeenCalledWith(true);
      expect(setImportInProgress).toHaveBeenLastCalledWith(false);
    });

    it('opens the copy another tab made meanwhile instead of a second one', async () => {
      const upgraded = makeProtocol();
      readLegacyProtocolSnapshot.mockResolvedValue(snapshot);
      migrateProtocol.mockReturnValue(upgraded);
      validateProtocol.mockResolvedValue({ success: true, data: upgraded });
      writeUpgradedLegacyCopy.mockResolvedValue({
        protocolId: 'other-tab-copy',
        created: false,
      });

      await runThunk(upgradeLegacyProtocol({ legacyId: 'legacy-1' }));

      // Handed to the library open, which admits and opens that row.
      expect(dispatch).toHaveBeenCalledWith(expect.any(Function));
      expect(setActiveProtocol).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('reports a protocol that is no longer in Architect 8’s library', async () => {
      readLegacyProtocolSnapshot.mockResolvedValue(undefined);

      const result = await runThunk(
        upgradeLegacyProtocol({ legacyId: 'gone' }),
      );

      expect(messageFields(result.payload)).toMatchObject({
        status: 'error',
        title: 'Protocol Not Found',
        message: 'This protocol could not be found in your library.',
      });
      expect(migrateProtocol).not.toHaveBeenCalled();
      expect(writeUpgradedLegacyCopy).not.toHaveBeenCalled();
    });

    it('writes nothing and explains a migration that fails', async () => {
      readLegacyProtocolSnapshot.mockResolvedValue(snapshot);
      migrateProtocol.mockImplementation(() => {
        throw new Error('Migration resulted in invalid protocol: nope');
      });

      const result = await runThunk(
        upgradeLegacyProtocol({ legacyId: 'legacy-1' }),
      );

      expect(messageFields(result.payload)).toEqual({
        status: 'error',
        title: 'Failed to Open Protocol',
        message:
          'This protocol could not be brought up to date. Open it in the version of Architect that created it, check its settings, and try again.',
        detail: 'Migration resulted in invalid protocol: nope',
      });
      expect(writeUpgradedLegacyCopy).not.toHaveBeenCalled();
      expect(setActiveProtocol).not.toHaveBeenCalled();
    });

    it('writes nothing when the upgraded protocol fails validation', async () => {
      const error = new ProtocolValidationError([
        { code: 'custom', path: [], message: 'Upgraded protocol is invalid' },
      ]);
      readLegacyProtocolSnapshot.mockResolvedValue(snapshot);
      migrateProtocol.mockReturnValue(makeProtocol());
      validateProtocol.mockResolvedValue({ success: false, error });

      const result = await runThunk(
        upgradeLegacyProtocol({ legacyId: 'legacy-1' }),
      );

      expect(result.payload).toEqual({
        status: 'validation-error',
        message: error.message,
      });
      expect(writeUpgradedLegacyCopy).not.toHaveBeenCalled();
      expect(setActiveProtocol).not.toHaveBeenCalled();
    });

    // There is no in-memory fallback: a copy that cannot be saved is not
    // opened, and this library's own autosave is not switched off for it.
    it('refuses, without opening anything, when the copy cannot be saved', async () => {
      readLegacyProtocolSnapshot.mockResolvedValue(snapshot);
      migrateProtocol.mockReturnValue(makeProtocol());
      validateProtocol.mockResolvedValue({
        success: true,
        data: makeProtocol(),
      });
      writeUpgradedLegacyCopy.mockRejectedValue(
        new DOMException('Quota exceeded', 'QuotaExceededError'),
      );

      const result = await runThunk(
        upgradeLegacyProtocol({ legacyId: 'legacy-1' }),
      );

      expect(messageFields(result.payload)).toMatchObject({
        status: 'error',
        title: 'Protocol Open Error',
        message: expect.stringContaining(
          'Architect could not save this protocol on this device.',
        ),
      });
      expect(setStorageUnavailable).not.toHaveBeenCalledWith(true);
      expect(setActiveProtocol).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(setImportInProgress).toHaveBeenLastCalledWith(false);
    });

    it('refuses, without touching this library, when Architect 8’s cannot be read', async () => {
      readLegacyProtocolSnapshot.mockRejectedValue(
        new Error('UnknownError: backing store'),
      );

      const result = await runThunk(
        upgradeLegacyProtocol({ legacyId: 'legacy-1' }),
      );

      expect(result.payload).toMatchObject({ status: 'error' });
      expect(writeUpgradedLegacyCopy).not.toHaveBeenCalled();
      expect(setStorageUnavailable).not.toHaveBeenCalled();
    });
  });
});
