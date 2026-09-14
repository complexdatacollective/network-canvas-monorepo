import {
  createInitialNetwork,
  type InterviewPayload,
  type ProtocolPayload,
  type ResolvedAsset,
  type SessionPayload,
} from '@codaco/interview/contract';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  type CurrentProtocol,
  detectSchemaVersion,
  extractProtocolFromZip,
  getMigrationInfo,
  hashProtocol,
  loadNetcanvasArchive,
  migrateProtocol,
  validateProtocol,
  VersionedProtocolSchema,
} from '@codaco/protocol-validation';

/**
 * A gallery `.netcanvas` "installed" for a browser preview: the protocol in
 * the shape the interview Shell consumes, plus the media the Shell resolves
 * lazily through `onRequestAsset`. Nothing is persisted — the whole install
 * lives in memory for the life of the preview window.
 */
export type PreviewProtocolInstall = {
  protocol: ProtocolPayload;
  /** Asset bytes by manifest id. API-key assets are their string value. */
  assets: ReadonlyMap<string, Blob | string>;
  /** Whether the archive was migrated to the Shell's schema version. */
  migrated: boolean;
};

export type PreviewInstallFailure =
  | 'unreadable'
  | 'unsupported-version'
  | 'invalid';

export type PreviewInstallResult =
  | { ok: true; install: PreviewProtocolInstall }
  | { ok: false; reason: PreviewInstallFailure };

function toProtocolPayload(protocol: CurrentProtocol): ProtocolPayload {
  const { assetManifest, ...rest } = protocol;
  const assets = Object.entries(assetManifest ?? {}).map<ResolvedAsset>(
    ([assetId, asset]) =>
      asset.type === 'apikey'
        ? { assetId, name: asset.name, type: 'apikey', value: asset.value }
        : { assetId, name: asset.name, type: asset.type, source: asset.source },
  );

  return {
    ...rest,
    id: crypto.randomUUID(),
    hash: hashProtocol(protocol),
    importedAt: new Date().toISOString(),
    assets,
  };
}

/**
 * Mirrors the Interviewer's import pipeline (extract, migrate to the Shell's
 * schema version, validate) without its persistence step.
 */
export async function installPreviewProtocol(
  bytes: Uint8Array,
  name: string,
): Promise<PreviewInstallResult> {
  let extracted: Awaited<ReturnType<typeof extractProtocolFromZip>>;
  try {
    extracted = await extractProtocolFromZip(await loadNetcanvasArchive(bytes));
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  let document: unknown = extracted.protocol;
  let migrated = false;
  try {
    const version = detectSchemaVersion(document);
    if (version !== COMPATIBLE_PROTOCOL_SCHEMA_VERSION) {
      if (
        !getMigrationInfo(version, COMPATIBLE_PROTOCOL_SCHEMA_VERSION)
          .canMigrate
      ) {
        return { ok: false, reason: 'unsupported-version' };
      }
      document = migrateProtocol(document, COMPATIBLE_PROTOCOL_SCHEMA_VERSION, {
        name: name.replace(/\.netcanvas$/i, ''),
      });
      migrated = true;
    }
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const versioned = VersionedProtocolSchema.safeParse(document);
  if (!versioned.success) return { ok: false, reason: 'invalid' };
  const validation = await validateProtocol(versioned.data);
  if (
    !validation.success ||
    validation.data.schemaVersion !== COMPATIBLE_PROTOCOL_SCHEMA_VERSION
  ) {
    return { ok: false, reason: 'invalid' };
  }

  return {
    ok: true,
    install: {
      protocol: toProtocolPayload(validation.data),
      assets: new Map(extracted.assets.map(({ id, data }) => [id, data])),
      migrated,
    },
  };
}

/**
 * A fresh, empty session for an installed protocol. Each call starts a new
 * interview: the Shell keys its store on the session id.
 */
export function createPreviewPayload(
  install: PreviewProtocolInstall,
): InterviewPayload {
  const now = new Date().toISOString();
  const session: SessionPayload = {
    id: crypto.randomUUID(),
    startTime: now,
    finishTime: null,
    exportTime: null,
    lastUpdated: now,
    network: createInitialNetwork(),
  };
  return { session, protocol: install.protocol };
}
