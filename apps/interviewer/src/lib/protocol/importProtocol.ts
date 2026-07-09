import JSZip from 'jszip';

import {
  type CurrentProtocol,
  detectSchemaVersion,
  type ExtractedAsset,
  getMigrationInfo,
  hashProtocol,
  migrateProtocol,
  validateProtocol,
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

type AssetManifestEntry = {
  type: string;
  name: string;
  source?: string;
  value?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAssetManifestEntry(value: unknown): value is AssetManifestEntry {
  if (!isRecord(value)) return false;
  const { type, name, source, value: entryValue } = value;
  return (
    typeof type === 'string' &&
    typeof name === 'string' &&
    (source === undefined || typeof source === 'string') &&
    (entryValue === undefined || typeof entryValue === 'string')
  );
}

function getAssetManifest(
  protocol: unknown,
): Record<string, AssetManifestEntry> {
  if (!isRecord(protocol) || !isRecord(protocol.assetManifest)) return {};

  return Object.fromEntries(
    Object.entries(protocol.assetManifest).filter(
      (entry): entry is [string, AssetManifestEntry] =>
        isAssetManifestEntry(entry[1]),
    ),
  );
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

async function extractZip(
  buffer: Uint8Array,
): Promise<{ protocol: unknown; assets: ExtractedAsset[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const protocolJson = await zip.file('protocol.json')?.async('string');
  if (!protocolJson) {
    throw new Error('protocol.json not found in archive');
  }
  const protocol: unknown = JSON.parse(protocolJson);
  const manifest = getAssetManifest(protocol);
  const assets: ExtractedAsset[] = [];
  for (const [assetId, def] of Object.entries(manifest)) {
    if (def.type === 'apikey') {
      assets.push({ id: assetId, name: def.name, data: def.value ?? '' });
      continue;
    }
    if (!def.source) continue;
    const fileData = await zip.file(`assets/${def.source}`)?.async('blob');
    if (!fileData) {
      throw new Error(`Asset file "${def.source}" not found for "${assetId}"`);
    }
    assets.push({ id: assetId, name: def.name, data: fileData });
  }
  return { protocol, assets };
}

async function importParsedProtocol(
  document: unknown,
  assets: ExtractedAsset[],
  sourceName: string,
  onProgress?: OnImportProgress,
  nameOverride?: string,
): Promise<ImportProtocolResult> {
  const version = detectSchemaVersion(document);

  let migratedDocument: unknown = document;
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
        message: cause instanceof Error ? cause.message : String(cause),
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
  const hash = hashProtocol(validated);

  onProgress?.({ phase: 'saving' });

  try {
    await saveProtocol(validated, hash, assets);
  } catch (cause) {
    return {
      success: false,
      error: 'save-failed',
      message: cause instanceof Error ? cause.message : String(cause),
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

  let extracted: { protocol: unknown; assets: ExtractedAsset[] };
  try {
    extracted = await extractZip(buffer);
  } catch (cause) {
    return {
      success: false,
      error: 'extract-failed',
      message: cause instanceof Error ? cause.message : String(cause),
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
