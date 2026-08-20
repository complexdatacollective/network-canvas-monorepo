import JSZip from 'jszip';

import {
  type CurrentProtocol,
  describeProtocolFileError,
  detectSchemaVersion,
  type ExtractedAsset,
  extractProtocolFromZip,
  getMigrationInfo,
  hashProtocol,
  loadNetcanvasArchive,
  migrateProtocol,
  validateProtocol,
  type VersionedProtocol,
  VersionedProtocolSchema,
} from '@codaco/protocol-validation';

import { saveProtocol } from '../db/api';

const APP_SCHEMA_VERSION = 8;

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
    const zip = await JSZip.loadAsync(buffer);
    const json = await zip.file('protocol.json')?.async('string');
    if (!json) return null;
    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed)) return null;
    if (typeof parsed.name === 'string' && parsed.name.trim().length > 0) {
      return parsed.name;
    }
    return null;
  } catch {
    return null;
  }
}

// `extractProtocolFromZip` genuinely returns a `VersionedProtocol` (asserted
// where it parses `protocol.json`, validated below); this wrapper used to widen
// it back to `unknown`, which is what forced the hash to be taken from the
// parse output. Keeping the type is what lets the document be hashed as it
// arrived.
async function extractZip(
  buffer: Uint8Array,
): Promise<{ protocol: VersionedProtocol; assets: ExtractedAsset[] }> {
  const zip = await loadNetcanvasArchive(buffer);
  return extractProtocolFromZip(zip);
}

/**
 * What the "Import failed" toast says.
 *
 * `@codaco/protocol-validation` describes the failures it recognises — an
 * unreadable archive, a missing protocol, a failed migration — in words written
 * for the person holding the device. Anything else gets a plain sentence rather
 * than the thrower's own message: a JSZip rejection naming a zip's central
 * directory and linking to its own documentation is not something to put in
 * front of a researcher mid-fieldwork.
 */
function describeImportFailure(cause: unknown, fallback: string): string {
  return describeProtocolFileError(cause) ?? fallback;
}

async function importParsedProtocol(
  document: VersionedProtocol,
  assets: ExtractedAsset[],
  sourceName: string,
  onProgress?: OnImportProgress,
  nameOverride?: string,
): Promise<ImportProtocolResult> {
  const version = detectSchemaVersion(document);

  let migratedDocument: VersionedProtocol = document;
  let didMigrate = false;
  if (version !== APP_SCHEMA_VERSION) {
    const info = getMigrationInfo(version, APP_SCHEMA_VERSION);
    if (!info.canMigrate) {
      return {
        success: false,
        error: 'unsupported-version',
        message: `Protocol schema version ${version} cannot be migrated to ${APP_SCHEMA_VERSION}.`,
      };
    }
    try {
      migratedDocument = migrateProtocol(document, APP_SCHEMA_VERSION, {
        name: nameOverride ?? sourceName.replace(/\.netcanvas$/i, ''),
      });
      didMigrate = true;
    } catch (cause) {
      return {
        success: false,
        error: 'validation-failed',
        message: describeImportFailure(
          cause,
          'This protocol could not be upgraded to the current version.',
        ),
      };
    }
  }

  const versionedProtocol = VersionedProtocolSchema.safeParse(migratedDocument);
  if (!versionedProtocol.success) {
    return {
      success: false,
      error: 'validation-failed',
      message: 'Protocol failed schema validation.',
      issues: formatValidationIssues(versionedProtocol.error.issues),
    };
  }

  const validation = await validateProtocol(versionedProtocol.data);
  if (!validation.success) {
    return {
      success: false,
      error: 'validation-failed',
      message: 'Protocol failed schema validation.',
      issues: formatValidationIssues(validation.error.issues),
    };
  }

  // `VersionedProtocol` is a schemaVersion-discriminated union (v7 | v8);
  // migration always targets `APP_SCHEMA_VERSION` (8), so a successful
  // validation here is always the current (v8) shape.
  if (validation.data.schemaVersion !== APP_SCHEMA_VERSION) {
    return {
      success: false,
      error: 'validation-failed',
      message: 'Protocol failed schema validation.',
    };
  }

  const validated: CurrentProtocol = validation.data;
  // Hashed from the document as it arrived (post-migration, pre-validation),
  // never from `validation.data`. A researcher's authored `synthetic` blocks
  // live in the file and must move the hash; defaults the schema injects during
  // parsing must not (spec decision 15). The hash is this protocol's Dexie row
  // id and the prefix of every one of its asset row ids, so a hash that drifted
  // with the schema would turn a re-import of an installed protocol into a
  // second row and orphan the sessions pointing at the first.
  const hash = hashProtocol(migratedDocument);

  onProgress?.({ phase: 'saving' });

  try {
    await saveProtocol(validated, hash, assets);
  } catch (cause) {
    // An IndexedDB or quota rejection reads as machine output. What the
    // researcher needs is that the protocol is fine and the device is not.
    console.error('Protocol import failed while saving', cause);
    return {
      success: false,
      error: 'save-failed',
      message:
        'This protocol could not be saved. This device may be out of space.',
    };
  }

  return { success: true, protocol: validated, hash, migrated: didMigrate };
}

async function importFromBuffer(
  buffer: Uint8Array,
  sourceName: string,
  onProgress?: OnImportProgress,
  nameOverride?: string,
): Promise<ImportProtocolResult> {
  onProgress?.({ phase: 'extracting' });

  let extracted: { protocol: VersionedProtocol; assets: ExtractedAsset[] };
  try {
    extracted = await extractZip(buffer);
  } catch (cause) {
    console.error('Protocol import failed while extracting', cause);
    return {
      success: false,
      error: 'extract-failed',
      message: describeImportFailure(
        cause,
        'This protocol could not be opened.',
      ),
    };
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
  bundled: {
    document: VersionedProtocol;
    assets: ExtractedAsset[];
    name: string;
  },
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
