import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import {
  createTempRepoRoot,
  isAuthorizedSourceSaveRequest,
  saveProtocolSource,
  type SourceSaveRequest,
} from '../protocol-source-authoring';

const sourceRef = { kind: 'template' as const, id: 'test-template' };
const sampleSourceRef = { kind: 'sample' as const, id: 'sample' };
const developmentSourceRef = {
  kind: 'development' as const,
  id: 'development',
};

const manifest = {
  protocols: [
    {
      id: sourceRef.id,
      kind: sourceRef.kind,
      name: 'Test Template',
      description: 'A test template',
      protocolPath: 'templates/test-template/protocol.json',
      assetDir: 'templates/test-template/assets',
      architectTemplate: true,
    },
    {
      id: sampleSourceRef.id,
      kind: sampleSourceRef.kind,
      name: 'Sample Protocol',
      description: 'Sample protocol',
      protocolPath: 'sample/protocol.json',
      assetDir: 'sample/assets',
      architectTemplate: false,
    },
    {
      id: developmentSourceRef.id,
      kind: developmentSourceRef.kind,
      name: 'Development Protocol',
      description: 'Development protocol',
      protocolPath: 'development/protocol.json',
      assetDir: 'development/assets',
      architectTemplate: false,
    },
  ],
};

const makeProtocol = (
  assetManifest: CurrentProtocol['assetManifest'] = {},
): CurrentProtocol => ({
  name: 'Test Template',
  schemaVersion: 8,
  stages: [],
  codebook: {
    node: {},
    edge: {},
    ego: {},
  },
  assetManifest,
});

const makeRequest = (
  protocol: CurrentProtocol,
  assets: SourceSaveRequest['assets'] = [],
  ref: SourceSaveRequest['sourceRef'] = sourceRef,
): SourceSaveRequest => ({
  sourceRef: ref,
  protocol,
  assets,
});

describe('protocol source authoring', () => {
  let repoRoot: string;
  let protocolsRoot: string;
  let assetDir: string;

  beforeEach(async () => {
    repoRoot = await createTempRepoRoot();
    protocolsRoot = join(repoRoot, 'packages', 'protocols');
    assetDir = join(protocolsRoot, 'templates', sourceRef.id, 'assets');
    await mkdir(assetDir, { recursive: true });
    await writeFile(
      join(protocolsRoot, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('writes protocol JSON and asset files, then removes stale source assets', async () => {
    await writeFile(join(assetDir, 'stale.png'), 'old');
    const protocol = makeProtocol({
      image: {
        id: 'image',
        name: 'Image',
        type: 'image',
        source: 'image.png',
      },
    });

    const result = await saveProtocolSource(
      repoRoot,
      makeRequest(protocol, [
        {
          id: 'image',
          name: 'Image',
          source: 'image.png',
          dataBase64: btoa('new image'),
        },
      ]),
    );

    expect(result).toEqual({
      ok: true,
      writtenProtocolPath: 'templates/test-template/protocol.json',
      writtenAssets: ['templates/test-template/assets/image.png'],
      removedAssets: ['templates/test-template/assets/stale.png'],
    });
    await expect(
      readFile(
        join(protocolsRoot, 'templates', sourceRef.id, 'protocol.json'),
        'utf8',
      ),
    ).resolves.toBe(`${JSON.stringify(protocol, null, 2)}\n`);
    await expect(readFile(join(assetDir, 'image.png'), 'utf8')).resolves.toBe(
      'new image',
    );
    await expect(readFile(join(assetDir, 'stale.png'))).rejects.toThrow();
  });

  it('does not require file data for apikey assets', async () => {
    const protocol = makeProtocol({
      key: {
        id: 'key',
        name: 'API key',
        type: 'apikey',
        value: 'token',
      },
    });

    const result = await saveProtocolSource(repoRoot, makeRequest(protocol));

    expect(result).toEqual({
      ok: true,
      writtenProtocolPath: 'templates/test-template/protocol.json',
      writtenAssets: [],
      removedAssets: [],
    });
  });

  it('allows sample and development sources to use the same save path', async () => {
    const sampleResult = await saveProtocolSource(
      repoRoot,
      makeRequest(makeProtocol(), [], sampleSourceRef),
    );
    const developmentResult = await saveProtocolSource(
      repoRoot,
      makeRequest(makeProtocol(), [], developmentSourceRef),
    );

    expect(sampleResult).toMatchObject({
      ok: true,
      writtenProtocolPath: 'sample/protocol.json',
    });
    expect(developmentResult).toMatchObject({
      ok: true,
      writtenProtocolPath: 'development/protocol.json',
    });
  });

  it('rejects file assets with no uploaded data', async () => {
    const protocol = makeProtocol({
      image: {
        id: 'image',
        name: 'Image',
        type: 'image',
        source: 'image.png',
      },
    });

    const result = await saveProtocolSource(repoRoot, makeRequest(protocol));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain('Asset image has no uploaded data.');
  });

  it('rejects path-like asset sources', async () => {
    const protocol = makeProtocol({
      image: {
        id: 'image',
        name: 'Image',
        type: 'image',
        source: '../image.png',
      },
    });

    const result = await saveProtocolSource(
      repoRoot,
      makeRequest(protocol, [
        {
          id: 'image',
          name: 'Image',
          source: '../image.png',
          dataBase64: btoa('new image'),
        },
      ]),
    );

    expect(result.ok).toBe(false);
  });

  it('rejects duplicate asset source filenames', async () => {
    const protocol = makeProtocol({
      image: {
        id: 'image',
        name: 'Image',
        type: 'image',
        source: 'shared.png',
      },
      secondImage: {
        id: 'secondImage',
        name: 'Second image',
        type: 'image',
        source: 'shared.png',
      },
    });

    const result = await saveProtocolSource(
      repoRoot,
      makeRequest(protocol, [
        {
          id: 'image',
          name: 'Image',
          source: 'shared.png',
          dataBase64: btoa('first image'),
        },
        {
          id: 'secondImage',
          name: 'Second image',
          source: 'shared.png',
          dataBase64: btoa('second image'),
        },
      ]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain(
      'Asset source shared.png is used more than once.',
    );
  });
});

describe('source-save request authorization', () => {
  it('accepts same-origin JSON requests with the authoring header', () => {
    expect(
      isAuthorizedSourceSaveRequest({
        headers: {
          'content-type': 'application/json',
          'host': 'localhost:5173',
          'origin': 'http://localhost:5173',
          'sec-fetch-site': 'same-origin',
          'x-architect-protocol-source-authoring': 'true',
        },
      }),
    ).toBe(true);
  });

  it('rejects requests without the authoring header', () => {
    expect(
      isAuthorizedSourceSaveRequest({
        headers: {
          'content-type': 'application/json',
          'host': 'localhost:5173',
          'origin': 'http://localhost:5173',
        },
      }),
    ).toBe(false);
  });

  it('rejects cross-site browser requests', () => {
    expect(
      isAuthorizedSourceSaveRequest({
        headers: {
          'content-type': 'application/json',
          'host': 'localhost:5173',
          'origin': 'https://example.com',
          'sec-fetch-site': 'cross-site',
          'x-architect-protocol-source-authoring': 'true',
        },
      }),
    ).toBe(false);
  });
});
