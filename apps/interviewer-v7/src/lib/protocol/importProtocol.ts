import JSZip from 'jszip';

import {
  type CurrentProtocol,
  detectSchemaVersion,
  type ExtractedAsset,
  getMigrationInfo,
  hashProtocol,
  migrateProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import { saveProtocol } from '../db/api';

const APP_SCHEMA_VERSION = 8;

export type ImportPhase = 'fetching' | 'extracting' | 'saving';

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
    | 'fetch-failed'
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

async function extractZip(
  buffer: Uint8Array,
): Promise<{ protocol: unknown; assets: ExtractedAsset[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const protocolJson = await zip.file('protocol.json')?.async('string');
  if (!protocolJson) {
    throw new Error('protocol.json not found in archive');
  }
  const protocol = JSON.parse(protocolJson) as Record<string, unknown>;
  const manifest =
    (protocol.assetManifest as Record<
      string,
      { type: string; name: string; source?: string; value?: string }
    >) ?? {};
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

async function importFromBuffer(
  buffer: Uint8Array,
  sourceName: string,
  onProgress?: OnImportProgress,
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

  const version = detectSchemaVersion(extracted.protocol);

  let migratedDocument: unknown = extracted.protocol;
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
      migratedDocument = migrateProtocol(
        extracted.protocol,
        APP_SCHEMA_VERSION,
        {
          name: sourceName.replace(/\.netcanvas$/i, ''),
        },
      );
      didMigrate = true;
    } catch (cause) {
      return {
        success: false,
        error: 'validation-failed',
        message: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  const validation = await validateProtocol(
    migratedDocument as Parameters<typeof validateProtocol>[0],
  );
  if (!validation.success) {
    return {
      success: false,
      error: 'validation-failed',
      message: 'Protocol failed schema validation.',
      issues: validation.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }

  const validated = validation.data as CurrentProtocol;
  const hash = hashProtocol(validated);

  onProgress?.({ phase: 'saving' });

  try {
    await saveProtocol(validated, hash, extracted.assets);
  } catch (cause) {
    return {
      success: false,
      error: 'save-failed',
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }

  return { success: true, protocol: validated, hash, migrated: didMigrate };
}

export async function importProtocolFromFile(
  file: File,
  onProgress?: OnImportProgress,
): Promise<ImportProtocolResult> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  return importFromBuffer(buffer, file.name, onProgress);
}

export function deriveNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // fall through
  }
  return 'protocol.netcanvas';
}

async function readStreamedBuffer(
  response: Response,
  onProgress?: OnImportProgress,
): Promise<Uint8Array> {
  const body = response.body;
  if (!body) {
    onProgress?.({ phase: 'fetching' });
    return new Uint8Array(await response.arrayBuffer());
  }
  const reader = body.getReader();
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader
    ? Number.parseInt(contentLengthHeader, 10)
    : Number.NaN;
  const hasContentLength = Number.isFinite(contentLength) && contentLength > 0;
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.({
      phase: 'fetching',
      progress: hasContentLength ? received / contentLength : undefined,
    });
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

export async function importProtocolFromUrl(
  url: string,
  onProgress?: OnImportProgress,
): Promise<ImportProtocolResult> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: 'follow' });
  } catch (cause) {
    return {
      success: false,
      error: 'fetch-failed',
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
  if (!response.ok) {
    return {
      success: false,
      error: 'fetch-failed',
      message: `Server responded with ${response.status} ${response.statusText}`,
    };
  }
  const buffer = await readStreamedBuffer(response, onProgress);
  return importFromBuffer(buffer, deriveNameFromUrl(url), onProgress);
}
