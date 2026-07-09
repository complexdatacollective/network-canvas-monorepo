import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

import type { Plugin } from 'vite';

import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

const PROTOCOL_SOURCE_ENDPOINT = '/__architect/protocol-source/save';
const PROTOCOL_SOURCE_AUTHORING_HEADER =
  'x-architect-protocol-source-authoring';
const MAX_BODY_BYTES = 128 * 1024 * 1024;

type ProtocolSourceKind = 'template' | 'sample' | 'development' | 'e2e';
type ProtocolManifestKind = ProtocolSourceKind | 'documentation';

type ProtocolSourceRef = {
  kind: ProtocolSourceKind;
  id: string;
};

type SourceSaveAsset = {
  id: string;
  name: string;
  source: string;
  dataBase64: string;
  mimeType?: string;
};

export type SourceSaveRequest = {
  sourceRef: ProtocolSourceRef;
  protocol: CurrentProtocol;
  assets: SourceSaveAsset[];
};

export type SourceSaveResponse =
  | {
      ok: true;
      writtenProtocolPath: string;
      writtenAssets: string[];
      removedAssets: string[];
    }
  | { ok: false; error: string; issues?: string[] };

type ProtocolManifestEntry = {
  id: string;
  kind: ProtocolManifestKind;
  protocolPath: string;
  assetDir: string;
  architectTemplate: boolean;
};

type ProtocolManifest = {
  protocols: ProtocolManifestEntry[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isProtocolSourceKind = (value: unknown): value is ProtocolSourceKind =>
  value === 'template' ||
  value === 'sample' ||
  value === 'development' ||
  value === 'e2e';

const isProtocolManifestKind = (
  value: unknown,
): value is ProtocolManifestKind =>
  isProtocolSourceKind(value) || value === 'documentation';

const isSafeFilename = (source: string): boolean =>
  source.length > 0 &&
  source === basename(source) &&
  source !== '..' &&
  !source.includes('/') &&
  !source.includes('\\');

const assertInside = (root: string, target: string): void => {
  const rel = relative(root, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Resolved path escapes protocols package: ${target}`);
  }
};

const parseManifest = (value: unknown): ProtocolManifest => {
  if (!isRecord(value) || !Array.isArray(value.protocols)) {
    throw new Error('Protocol manifest must contain a protocols array.');
  }

  const protocols = value.protocols.map((entry): ProtocolManifestEntry => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      !isProtocolManifestKind(entry.kind) ||
      typeof entry.protocolPath !== 'string' ||
      typeof entry.assetDir !== 'string' ||
      typeof entry.architectTemplate !== 'boolean'
    ) {
      throw new Error('Protocol manifest contains an invalid entry.');
    }

    return {
      id: entry.id,
      kind: entry.kind,
      protocolPath: entry.protocolPath,
      assetDir: entry.assetDir,
      architectTemplate: entry.architectTemplate,
    };
  });

  return { protocols };
};

const loadManifest = async (protocolsRoot: string): Promise<ProtocolManifest> =>
  parseManifest(
    JSON.parse(await readFile(join(protocolsRoot, 'manifest.json'), 'utf8')),
  );

const parseRequest = (value: unknown): SourceSaveRequest => {
  if (
    !isRecord(value) ||
    !isRecord(value.sourceRef) ||
    !isProtocolSourceKind(value.sourceRef.kind) ||
    typeof value.sourceRef.id !== 'string' ||
    !isRecord(value.protocol) ||
    !Array.isArray(value.assets)
  ) {
    throw new Error('Request body does not match the source-save contract.');
  }

  const assets = value.assets.map((asset): SourceSaveAsset => {
    if (
      !isRecord(asset) ||
      typeof asset.id !== 'string' ||
      typeof asset.name !== 'string' ||
      typeof asset.source !== 'string' ||
      typeof asset.dataBase64 !== 'string' ||
      (asset.mimeType !== undefined && typeof asset.mimeType !== 'string')
    ) {
      throw new Error('Request contains an invalid asset payload.');
    }

    return {
      id: asset.id,
      name: asset.name,
      source: asset.source,
      dataBase64: asset.dataBase64,
      mimeType: asset.mimeType,
    };
  });

  return {
    sourceRef: {
      kind: value.sourceRef.kind,
      id: value.sourceRef.id,
    },
    protocol: value.protocol as CurrentProtocol,
    assets,
  };
};

const decodeBase64 = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('Asset payload is not valid base64.');
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> =>
  new Promise((resolveBody, rejectBody) => {
    let body = '';
    let bytes = 0;
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      bytes += new TextEncoder().encode(chunk).byteLength;
      if (bytes > MAX_BODY_BYTES) {
        rejectBody(new Error('Source-save request body is too large.'));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('error', rejectBody);
    request.on('end', () => {
      try {
        resolveBody(JSON.parse(body));
      } catch (error) {
        rejectBody(error);
      }
    });
  });

const getHeader = (
  request: Pick<IncomingMessage, 'headers'>,
  name: string,
): string | undefined => {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const isSameOrigin = (origin: string, host: string | undefined): boolean => {
  if (!host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return (
      (originUrl.protocol === 'http:' || originUrl.protocol === 'https:') &&
      originUrl.host.toLowerCase() === host.toLowerCase()
    );
  } catch (_error) {
    return false;
  }
};

export const isAuthorizedSourceSaveRequest = (
  request: Pick<IncomingMessage, 'headers'>,
): boolean => {
  const authoringHeader = getHeader(request, PROTOCOL_SOURCE_AUTHORING_HEADER);
  if (authoringHeader !== 'true') {
    return false;
  }

  const contentType = getHeader(request, 'content-type');
  if (contentType?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return false;
  }

  const secFetchSite = getHeader(request, 'sec-fetch-site');
  if (secFetchSite === 'cross-site') {
    return false;
  }

  const origin = getHeader(request, 'origin');
  return (
    origin === undefined || isSameOrigin(origin, getHeader(request, 'host'))
  );
};

const findSourceEntry = (
  manifest: ProtocolManifest,
  sourceRef: ProtocolSourceRef,
): ProtocolManifestEntry => {
  const entry = manifest.protocols.find(
    (candidate) =>
      candidate.id === sourceRef.id && candidate.kind === sourceRef.kind,
  );

  if (!entry) {
    throw new Error(
      `Unknown protocol source: ${sourceRef.kind}/${sourceRef.id}`,
    );
  }

  const canSave =
    (entry.kind === 'template' && entry.architectTemplate) ||
    entry.kind === 'sample' ||
    entry.kind === 'development';

  if (!canSave) {
    throw new Error(
      'Only Architect template, sample, and development sources can be saved from the app.',
    );
  }

  return entry;
};

const listAssetFiles = async (assetDir: string): Promise<string[]> => {
  try {
    const entries = await readdir(assetDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
      .map((entry) => entry.name);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      if (code === 'ENOENT') {
        return [];
      }
    }
    throw error;
  }
};

type FileAssetToWrite = {
  id: string;
  source: string;
  data: Uint8Array;
};

type PendingAssetWrite = {
  source: string;
  temporaryPath: string;
  finalPath: string;
};

const collectFileAssets = (
  request: SourceSaveRequest,
): { assets: FileAssetToWrite[]; issues: string[] } => {
  const issues: string[] = [];
  const requestAssetsById = new Map(
    request.assets.map((asset) => [asset.id, asset]),
  );
  const expectedAssetIds = new Set<string>();
  const seenSources = new Set<string>();
  const assets: FileAssetToWrite[] = [];

  for (const [assetId, definition] of Object.entries(
    request.protocol.assetManifest ?? {},
  )) {
    if (definition.type === 'apikey') {
      continue;
    }

    expectedAssetIds.add(assetId);

    if (!('source' in definition) || typeof definition.source !== 'string') {
      issues.push(`Asset ${assetId} is missing a source filename.`);
      continue;
    }

    if (!isSafeFilename(definition.source)) {
      issues.push(`Asset ${assetId} has an unsafe source filename.`);
      continue;
    }

    if (seenSources.has(definition.source)) {
      issues.push(`Asset source ${definition.source} is used more than once.`);
      continue;
    }
    seenSources.add(definition.source);

    const asset = requestAssetsById.get(assetId);
    if (!asset) {
      issues.push(`Asset ${assetId} has no uploaded data.`);
      continue;
    }

    if (asset.source !== definition.source) {
      issues.push(`Asset ${assetId} source does not match the protocol.`);
      continue;
    }

    assets.push({
      id: asset.id,
      source: definition.source,
      data: decodeBase64(asset.dataBase64),
    });
  }

  for (const asset of request.assets) {
    if (!expectedAssetIds.has(asset.id)) {
      issues.push(
        `Uploaded asset ${asset.id} is not referenced by the protocol.`,
      );
    }
  }

  return { assets, issues };
};

export const saveProtocolSource = async (
  repoRoot: string,
  rawRequest: unknown,
): Promise<SourceSaveResponse> => {
  const temporaryPaths: string[] = [];
  try {
    const request = parseRequest(rawRequest);
    const protocolsRoot = resolve(repoRoot, 'packages/protocols');
    const manifest = await loadManifest(protocolsRoot);
    const sourceEntry = findSourceEntry(manifest, request.sourceRef);
    const protocolPath = resolve(protocolsRoot, sourceEntry.protocolPath);
    const assetDir = resolve(protocolsRoot, sourceEntry.assetDir);
    assertInside(protocolsRoot, protocolPath);
    assertInside(protocolsRoot, assetDir);

    const validationResult = await validateProtocol(request.protocol);
    if (!validationResult.success) {
      return {
        ok: false,
        error: 'Protocol validation failed.',
        issues: validationResult.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`,
        ),
      };
    }

    const { assets, issues } = collectFileAssets(request);
    if (issues.length > 0) {
      return {
        ok: false,
        error: 'Protocol assets could not be saved.',
        issues,
      };
    }

    await mkdir(dirname(protocolPath), { recursive: true });
    await mkdir(assetDir, { recursive: true });

    const saveId = randomUUID();
    const protocolTemporaryPath = join(
      dirname(protocolPath),
      `.protocol.${saveId}.tmp`,
    );
    temporaryPaths.push(protocolTemporaryPath);
    await writeFile(
      protocolTemporaryPath,
      `${JSON.stringify(request.protocol, null, 2)}\n`,
    );

    const pendingAssetWrites: PendingAssetWrite[] = assets.map((asset) => ({
      source: asset.source,
      temporaryPath: join(assetDir, `.${asset.source}.${saveId}.tmp`),
      finalPath: join(assetDir, asset.source),
    }));

    for (const asset of assets) {
      const pendingWrite = pendingAssetWrites.find(
        (write) => write.source === asset.source,
      );
      if (!pendingWrite) {
        throw new Error(`No pending write prepared for ${asset.source}.`);
      }
      temporaryPaths.push(pendingWrite.temporaryPath);
      await writeFile(pendingWrite.temporaryPath, asset.data);
    }

    for (const pendingWrite of pendingAssetWrites) {
      await rename(pendingWrite.temporaryPath, pendingWrite.finalPath);
    }

    await rename(protocolTemporaryPath, protocolPath);

    const existingAssets = await listAssetFiles(assetDir);
    const referencedSources = new Set(assets.map((asset) => asset.source));
    const removedAssets: string[] = [];
    for (const filename of existingAssets) {
      if (!referencedSources.has(filename)) {
        await rm(join(assetDir, filename));
        removedAssets.push(`${sourceEntry.assetDir}/${filename}`);
      }
    }

    return {
      ok: true,
      writtenProtocolPath: sourceEntry.protocolPath,
      writtenAssets: assets.map(
        (asset) => `${sourceEntry.assetDir}/${asset.source}`,
      ),
      removedAssets,
    };
  } catch (error) {
    await Promise.all(
      temporaryPaths.map((temporaryPath) =>
        rm(temporaryPath, { force: true }).catch(() => undefined),
      ),
    );
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const sendJson = (
  response: ServerResponse,
  body: SourceSaveResponse,
  statusCode = body.ok ? 200 : 400,
) => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
};

export const createProtocolSourceAuthoringPlugin = ({
  repoRoot,
  enabled,
}: {
  repoRoot: string;
  enabled: boolean;
}): Plugin => ({
  name: 'architect-protocol-source-authoring',
  apply: 'serve',
  configureServer(server) {
    if (!enabled) {
      return;
    }

    server.middlewares.use(
      PROTOCOL_SOURCE_ENDPOINT,
      async (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify({
              ok: false,
              error: 'Method not allowed.',
            } satisfies SourceSaveResponse),
          );
          return;
        }

        if (!isAuthorizedSourceSaveRequest(request)) {
          sendJson(
            response,
            {
              ok: false,
              error: 'Source-save request is not authorized.',
            },
            403,
          );
          return;
        }

        try {
          const body = await readJsonBody(request);
          sendJson(response, await saveProtocolSource(repoRoot, body));
        } catch (error) {
          sendJson(response, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
  },
});

// Exported for tests that need an isolated repository layout.
export const createTempRepoRoot = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), 'architect-protocol-source-'));
