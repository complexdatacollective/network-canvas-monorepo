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
import type { Schema8Protocol, StoredProtocol } from '../db/types';

const messages = defineMessages({
  unsupportedVersion: {
    id: 'interviewer.protocolImport.unsupportedVersion',
    defaultMessage:
      'Protocol schema version {version} cannot be migrated to {targetVersion}.',
    description:
      'Import refusal when the embedded interview engine cannot run or migrate the protocol schema version. Version values are technical schema identifiers.',
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
  protocol: StoredProtocol['protocol'];
  /** The protocol's name, as its card shows it. */
  name: string;
  hash: string;
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

export type ImportProtocolResult =
  | ImportProtocolSuccess
  | ImportProtocolFailure;

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

  const name = nameOverride ?? sourceName.replace(/\.netcanvas$/i, '');

  // Interviewer never upgrades a protocol to this app's schema: a file below
  // it is kept on schema 8, where its interviews run in the bundled
  // Interviewer 8.
  if (version < APP_SCHEMA_VERSION) {
    return keepOnSchema8(document, version, assets, name, onProgress);
  }

  const validation = await validateProtocol(document);
  if (!validation.success) {
    return importFailure(
      'validation-failed',
      { descriptor: messages.invalidProtocol },
      formatValidationIssues(validation.error.issues),
    );
  }

  // `VersionedProtocol` is a schemaVersion-discriminated union spanning every
  // version the validator still accepts; this comparison is what narrows a
  // validated document to the one shape the embedded interview engine can
  // execute.
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

  return {
    success: true,
    protocol: validated,
    name: validated.name,
    hash,
  };
}

const SCHEMA_8: Schema8Protocol['schemaVersion'] = 8;

/**
 * Keep a file below this app's schema on schema 8, stored as Interviewer 8
 * stores what it imports, so the bundled Interviewer 8 runs its interviews
 * from the same row: the document as Interviewer 8's validation returns it,
 * hashed by `hashProtocol`, named by the document's own `name`. A schema 7 (or
 * older) file is migrated to schema 8 and no further, as Interviewer 8's own
 * import does.
 *
 * Validated as Interviewer 8 validates an import, with the schema 8 validator
 * it ships (`@codaco/protocol-validation` 15.0.0, frozen under the
 * `protocol-validation-schema-8` alias): the versioned schema first, then the
 * full validation with its cross-references. The schema 8 schema this app's
 * own package carries checks only the outline, so a file it accepts can be
 * one Interviewer 8 refuses (an unknown stage type, a node type without a
 * shape) and would then fail on at /v8/. Loaded on demand: only keeping a
 * file needs it.
 */
async function keepOnSchema8(
  document: unknown,
  version: SchemaVersion,
  assets: ExtractedAsset[],
  name: string,
  onProgress?: OnImportProgress,
): Promise<ImportProtocolResult> {
  let schema8Document: unknown = document;
  if (version !== SCHEMA_8) {
    if (!getMigrationInfo(version, SCHEMA_8).canMigrate) {
      return importFailure('unsupported-version', {
        descriptor: messages.unsupportedVersion,
        values: { version, targetVersion: SCHEMA_8 },
      });
    }
    try {
      schema8Document = migrateProtocol(document, SCHEMA_8, { name });
    } catch (cause) {
      return importFailure(
        'validation-failed',
        describeProtocolFileErrorMessage(cause) ?? {
          descriptor: messages.cannotOpen,
        },
      );
    }
  }

  const interviewer8Validation = await import('protocol-validation-schema-8');
  const versioned =
    interviewer8Validation.VersionedProtocolSchema.safeParse(schema8Document);
  if (!versioned.success) {
    return importFailure(
      'validation-failed',
      { descriptor: messages.invalidProtocol },
      formatValidationIssues(versioned.error.issues),
    );
  }
  const validation = await interviewer8Validation.validateProtocol(
    versioned.data,
  );
  if (!validation.success) {
    return importFailure(
      'validation-failed',
      { descriptor: messages.invalidProtocol },
      formatValidationIssues(validation.error.issues),
    );
  }
  const validated = validation.data;
  if (validated.schemaVersion !== SCHEMA_8) {
    return importFailure('validation-failed', {
      descriptor: messages.invalidProtocol,
    });
  }
  // Interviewer 8's schema requires the name, which its rows and cards are
  // named by; a blank one is refused here as well.
  const protocolName = validated.name;
  if (protocolName.trim().length === 0) {
    return importFailure(
      'validation-failed',
      { descriptor: messages.invalidProtocol },
      [{ path: 'name', message: 'A schema 8 protocol must have a name.' }],
    );
  }
  const schema8: Schema8Protocol = validated;
  const hash = hashProtocol(schema8);

  onProgress?.({ phase: 'saving' });

  try {
    await saveProtocol(schema8, hash, assets);
  } catch (cause) {
    // oxlint-disable-next-line no-console -- the raw cause is deliberately kept out of the user-facing message above; this is the only place it survives for debugging
    console.error('Protocol import failed while saving', cause);
    return importFailure('save-failed', { descriptor: messages.cannotSave });
  }

  return {
    success: true,
    protocol: schema8,
    name: protocolName,
    hash,
  };
}

async function importFromBuffer(
  buffer: Uint8Array,
  sourceName: string,
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
    onProgress,
    nameOverride,
  );
}

export async function importProtocolFromFile(
  file: File,
  onProgress?: OnImportProgress,
  nameOverride?: string,
): Promise<ImportProtocolResult> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  return importFromBuffer(buffer, file.name, onProgress, nameOverride);
}

export function importBundledProtocol(
  bundled: { document: unknown; assets: ExtractedAsset[]; name: string },
  onProgress?: OnImportProgress,
): Promise<ImportProtocolResult> {
  onProgress?.({ phase: 'extracting' });
  return importParsedProtocol(
    bundled.document,
    bundled.assets,
    bundled.name,
    onProgress,
    bundled.name,
  );
}
