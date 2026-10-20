import { defineMessages } from '@codaco/app-i18n/messages';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  createNetcanvasReader,
  type CurrentProtocol,
  detectSchemaVersion,
  type ExtractedAsset,
  extractProtocolFromZip,
  getMigrationInfo,
  getProtocolFileErrorKind,
  hashProtocol,
  loadNetcanvasArchive,
  migrateProtocol,
  missingAssetsError,
  type SchemaVersion,
  validateProtocol,
} from '@codaco/protocol-validation';
import { describeProtocolFileErrorMessage } from '@codaco/protocol-validation/messages';
import { messageFailure, type LocalizedMessage } from '~/i18n/messageResult';

import { saveProtocol } from '../db/api';

const messages = defineMessages({
  unsupportedVersion: {
    id: 'interviewer.protocolImport.unsupportedVersion',
    defaultMessage:
      'Protocol schema version {version} cannot be migrated to {targetVersion}.',
    description:
      'Import refusal when the embedded interview engine cannot run or migrate the protocol schema version. Version values are technical schema identifiers.',
  },
  cannotUpgrade: {
    id: 'interviewer.protocolImport.cannotUpgrade',
    defaultMessage:
      'This protocol could not be upgraded to the current version.',
    description:
      'Fallback guidance when an unrecognized protocol migration error prevents import.',
  },
  invalidProtocol: {
    id: 'interviewer.protocolImport.invalidProtocol',
    defaultMessage: 'Protocol failed schema validation.',
    description:
      'Summary above copyable technical details when an imported protocol fails validation.',
  },
  cannotSave: {
    id: 'interviewer.protocolImport.cannotSave',
    defaultMessage:
      'This protocol could not be saved. This device may be out of space.',
    description:
      'Import failure after validation when device storage rejects the save; suggests the likely remedy.',
  },
  cannotOpen: {
    id: 'interviewer.protocolImport.cannotOpen',
    defaultMessage: 'This protocol could not be opened.',
    description:
      'Fallback guidance when an unrecognized file extraction error prevents import.',
  },
});

/** Failure copy the upgrade of a schema 8 protocol shares with import. */
export const importFailureMessages = {
  cannotUpgrade: messages.cannotUpgrade,
  cannotSave: messages.cannotSave,
};

// What this app can run is what the interview engine it embeds can run, so the
// import pipeline's target version is read from `@codaco/interview` rather than
// written down here. A release that upgrades the engine moves this with it.
const APP_SCHEMA_VERSION = COMPATIBLE_PROTOCOL_SCHEMA_VERSION;

export type ImportPhase = 'extracting' | 'saving';

export type ImportProgressEvent = {
  phase: ImportPhase;
  progress?: number;
};

export type OnImportProgress = (event: ImportProgressEvent) => void;

export type ImportProtocolSuccess = {
  success: true;
  protocol: CurrentProtocol;
  hash: string;
  migrated: boolean;
};

export type ImportProtocolFailure = {
  success: false;
  error:
    | 'extract-failed'
    | 'unsupported-version'
    | 'validation-failed'
    | 'save-failed';
  message: string;
  localizedMessage: LocalizedMessage;
  issues?: { path: string; message: string }[];
};

/**
 * A file below this app's schema, imported without the researcher's say-so.
 * Nothing was saved: the caller offers the choice (keep it on schema 8 in
 * Interviewer 8, or upgrade it) and imports again with `allowMigration` only
 * if the researcher chose to upgrade.
 */
export type ImportProtocolMigrationRequired = {
  success: false;
  error: 'migration-required';
  /** The file's schema version, always below this app's. */
  schemaVersion: SchemaVersion;
  message: string;
  localizedMessage: LocalizedMessage;
  /** No validation ran. */
  issues?: undefined;
};

export type ImportProtocolOptions = {
  /**
   * The researcher chose to upgrade a file below this app's schema. Without
   * it, such a file is never migrated: import resolves `migration-required`.
   */
  allowMigration?: boolean;
};

export type ImportProtocolResult =
  | ImportProtocolSuccess
  | ImportProtocolFailure
  | ImportProtocolMigrationRequired;

type ValidationIssue = {
  path: PropertyKey[];
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatValidationIssues(
  issues: readonly ValidationIssue[],
): ImportProtocolFailure['issues'] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

export async function peekProtocolName(
  buffer: Uint8Array,
): Promise<string | null> {
  try {
    // Goes through the package's loader and reader rather than JSZip directly,
    // so naming the pending card costs the same bounded inflation as importing
    // it: this runs on a researcher-supplied file before any size guard, and
    // an unbudgeted `.async('string')` here would inflate a deflate-bombed
    // `protocol.json` in full just to read one field off it.
    const zip = await loadNetcanvasArchive(buffer);
    const parsed: unknown = await createNetcanvasReader(zip).readProtocol();
    if (!isRecord(parsed)) return null;
    if (typeof parsed.name === 'string' && parsed.name.trim().length > 0) {
      return parsed.name;
    }
    return null;
  } catch {
    return null;
  }
}

async function extractZip(
  buffer: Uint8Array,
): Promise<{ protocol: unknown; assets: ExtractedAsset[] }> {
  const zip = await loadNetcanvasArchive(buffer);
  const { protocol, assets, missingAssets } = await extractProtocolFromZip(zip);

  // Extraction reports a manifest entry with no file rather than refusing, so
  // that an authoring tool can open the protocol and let the researcher
  // re-supply it. Interviewer has no such move: the next thing it does with a
  // resource is show it to a participant mid-interview, where a stimulus that
  // never loads is worse than an import that never happened.
  if (missingAssets.length > 0) {
    throw missingAssetsError(missingAssets);
  }

  return { protocol, assets };
}

// Retain message identity for the host to choose a language at render time.
// The English message remains compatible with diagnostic and test consumers.
function importFailure(
  error: ImportProtocolFailure['error'],
  localizedMessage: LocalizedMessage,
  issues?: ImportProtocolFailure['issues'],
): ImportProtocolFailure {
  const failure = messageFailure(
    localizedMessage.descriptor,
    localizedMessage.values,
  );
  return {
    success: false,
    error,
    message: failure.message,
    localizedMessage,
    issues,
  };
}

async function importParsedProtocol(
  document: unknown,
  assets: ExtractedAsset[],
  sourceName: string,
  { allowMigration = false }: ImportProtocolOptions,
  onProgress?: OnImportProgress,
  nameOverride?: string,
): Promise<ImportProtocolResult> {
  let version: SchemaVersion;
  try {
    version = detectSchemaVersion(document);
  } catch (cause) {
    return importFailure(
      getProtocolFileErrorKind(cause) === 'newerVersion'
        ? 'unsupported-version'
        : 'validation-failed',
      describeProtocolFileErrorMessage(cause) ?? {
        descriptor: messages.invalidProtocol,
      },
    );
  }

  // Import never migrates on its own: an older file keeps working in the app
  // made for it unless the researcher chooses to upgrade it.
  if (version < APP_SCHEMA_VERSION && !allowMigration) {
    // Interim wording, until the choice dialog that consumes this result
    // brings its own (verified) strings: true, since it was not upgraded.
    const localizedMessage: LocalizedMessage = {
      descriptor: messages.cannotUpgrade,
    };
    return {
      success: false,
      error: 'migration-required',
      schemaVersion: version,
      message: messageFailure(
        localizedMessage.descriptor,
        localizedMessage.values,
      ).message,
      localizedMessage,
    };
  }

  let migratedDocument: unknown = document;
  let didMigrate = false;
  if (version !== APP_SCHEMA_VERSION) {
    const info = getMigrationInfo(version, APP_SCHEMA_VERSION);
    if (!info.canMigrate) {
      return importFailure('unsupported-version', {
        descriptor: messages.unsupportedVersion,
        values: { version, targetVersion: APP_SCHEMA_VERSION },
      });
    }
    try {
      migratedDocument = migrateProtocol(document, APP_SCHEMA_VERSION, {
        name: nameOverride ?? sourceName.replace(/\.netcanvas$/i, ''),
      });
      didMigrate = true;
    } catch (cause) {
      return importFailure(
        'validation-failed',
        describeProtocolFileErrorMessage(cause) ?? {
          descriptor: messages.cannotUpgrade,
        },
      );
    }
  }

  const validation = await validateProtocol(migratedDocument);
  if (!validation.success) {
    return importFailure(
      'validation-failed',
      { descriptor: messages.invalidProtocol },
      formatValidationIssues(validation.error.issues),
    );
  }

  // `VersionedProtocol` is a schemaVersion-discriminated union spanning every
  // version the validator still accepts; migration above always targets
  // `APP_SCHEMA_VERSION`, so this comparison is what narrows a validated
  // document to the one shape the embedded interview engine can execute.
  if (validation.data.schemaVersion !== APP_SCHEMA_VERSION) {
    return importFailure('validation-failed', {
      descriptor: messages.invalidProtocol,
    });
  }

  const validated: CurrentProtocol = validation.data;
  const hash = hashProtocol(validated);

  onProgress?.({ phase: 'saving' });

  try {
    await saveProtocol(validated, hash, assets);
  } catch (cause) {
    // An IndexedDB or quota rejection reads as machine output. What the
    // researcher needs is that the protocol is fine and the device is not.
    // oxlint-disable-next-line no-console -- the raw cause is deliberately kept out of the user-facing message above; this is the only place it survives for debugging
    console.error('Protocol import failed while saving', cause);
    return importFailure('save-failed', { descriptor: messages.cannotSave });
  }

  return { success: true, protocol: validated, hash, migrated: didMigrate };
}

async function importFromBuffer(
  buffer: Uint8Array,
  sourceName: string,
  options: ImportProtocolOptions,
  onProgress?: OnImportProgress,
  nameOverride?: string,
): Promise<ImportProtocolResult> {
  onProgress?.({ phase: 'extracting' });

  let extracted: { protocol: unknown; assets: ExtractedAsset[] };
  try {
    extracted = await extractZip(buffer);
  } catch (cause) {
    // oxlint-disable-next-line no-console -- the raw cause is deliberately kept out of the user-facing message below; this is the only place it survives for debugging
    console.error('Protocol import failed while extracting', cause);
    return importFailure(
      'extract-failed',
      describeProtocolFileErrorMessage(cause) ?? {
        descriptor: messages.cannotOpen,
      },
    );
  }

  return importParsedProtocol(
    extracted.protocol,
    extracted.assets,
    sourceName,
    options,
    onProgress,
    nameOverride,
  );
}

export async function importProtocolFromFile(
  file: File,
  onProgress?: OnImportProgress,
  nameOverride?: string,
  options: ImportProtocolOptions = {},
): Promise<ImportProtocolResult> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  return importFromBuffer(buffer, file.name, options, onProgress, nameOverride);
}

export function importBundledProtocol(
  bundled: { document: unknown; assets: ExtractedAsset[]; name: string },
  onProgress?: OnImportProgress,
): Promise<ImportProtocolResult> {
  onProgress?.({ phase: 'extracting' });
  // This app's own bundled protocols are at its schema; nothing to choose.
  return importParsedProtocol(
    bundled.document,
    bundled.assets,
    bundled.name,
    { allowMigration: false },
    onProgress,
    bundled.name,
  );
}
