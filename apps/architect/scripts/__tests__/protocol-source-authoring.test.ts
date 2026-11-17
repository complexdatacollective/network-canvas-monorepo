import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withInterfaceText } from '@codaco/interview/supplied-wording';
import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation/schema-version';

import {
  createTempRepoRoot,
  isAuthorizedSourceSaveRequest,
  saveProtocolSource,
  type SourceSaveRequest,
  type SourceSaveResponse,
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
): CurrentProtocol =>
  withInterfaceText({
    name: 'Test Template',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    stages: [
      {
        id: 'finish',
        type: 'FinishSession',
        label: { en: 'Finish' },
        mode: 'confirmation',
        content: { en: '# All done\n\nThank you.' },
        finishedContent: { en: 'This interview is finished.' },
        finishLabel: { en: 'Finish' },
        finishConfirmation: { en: 'Finish this interview?' },
        finishFailed: { en: 'The interview could not be finished.' },
        outcome: 'completed',
      },
    ],
    codebook: {
      node: {},
      edge: {},
      ego: {},
    },
    assetManifest,
  });

const refused = (result: SourceSaveResponse) => {
  if (result.ok) throw new Error('expected the save to be refused');
  return result;
};

// Resolves to the asset directory's parent for both the temporary and the
// final file, so a save that ignored it would leave a file there to find.
const ESCAPING_SOURCE = 'a/../../image.png';

const listEntries = async (root: string): Promise<string[]> =>
  (await readdir(root, { recursive: true, withFileTypes: true }))
    .map(
      (entry) =>
        `${join(entry.parentPath, entry.name)}${entry.isDirectory() ? '/' : ''}`,
    )
    .toSorted();

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

    expect(refused(result).issues).toContain(
      'Asset image has no uploaded data.',
    );
  });

  it('rejects path-like asset sources', async () => {
    const protocol = makeProtocol({
      image: {
        id: 'image',
        name: 'Image',
        type: 'image',
        source: ESCAPING_SOURCE,
      },
    });

    const result = await saveProtocolSource(
      repoRoot,
      makeRequest(protocol, [
        {
          id: 'image',
          name: 'Image',
          source: ESCAPING_SOURCE,
          dataBase64: btoa('new image'),
        },
      ]),
    );

    expect(refused(result).issues).toContain(
      'assetManifest.image.source: Asset source must be a filename without path separators or ".."',
    );
    await expect(readFile(join(assetDir, '../image.png'))).rejects.toThrow();
  });

  it('refuses a valid schema 8 document without touching the file system', async () => {
    await writeFile(join(assetDir, 'stale.png'), 'old');
    const schema8Protocol = {
      schemaVersion: 8,
      stages: [],
      codebook: { node: {}, edge: {}, ego: {} },
      assetManifest: {
        image: {
          id: 'image',
          name: 'Image',
          type: 'image',
          source: 'image.png',
        },
      },
    };
    // The refusal must come from the version, not from a schema 8 rule.
    await expect(validateProtocol(schema8Protocol)).resolves.toMatchObject({
      success: true,
    });
    const filesBefore = await listEntries(protocolsRoot);

    const result = await saveProtocolSource(repoRoot, {
      sourceRef,
      protocol: schema8Protocol,
      assets: [
        {
          id: 'image',
          name: 'Image',
          source: 'image.png',
          dataBase64: btoa('new image'),
        },
      ],
    });

    expect(refused(result).error).toBe(
      `Protocol sources must use schema version ${CURRENT_SCHEMA_VERSION}; received 8.`,
    );
    await expect(listEntries(protocolsRoot)).resolves.toEqual(filesBefore);
    await expect(readFile(join(assetDir, 'stale.png'), 'utf8')).resolves.toBe(
      'old',
    );
  });

  it.each([
    [
      'a newer schema version',
      { schemaVersion: CURRENT_SCHEMA_VERSION + 1 },
      `${CURRENT_SCHEMA_VERSION + 1}`,
    ],
    [
      'a schema version that is not a number',
      { schemaVersion: `${CURRENT_SCHEMA_VERSION}` },
      `"${CURRENT_SCHEMA_VERSION}"`,
    ],
    ['a null schema version', { schemaVersion: null }, 'null'],
    [
      'an oversized schema version',
      { schemaVersion: 'x'.repeat(1000) },
      `"${'x'.repeat(19)}...`,
    ],
    ['no schema version', { schemaVersion: undefined }, 'none'],
  ])('refuses a document with %s', async (_label, override, received) => {
    const filesBefore = await listEntries(protocolsRoot);

    // The sample source's directories do not exist yet, so creating them
    // before the refusal would show up in the listing.
    const result = await saveProtocolSource(repoRoot, {
      sourceRef: sampleSourceRef,
      protocol: { ...makeProtocol(), ...override },
      assets: [],
    });

    expect(refused(result).error).toBe(
      `Protocol sources must use schema version ${CURRENT_SCHEMA_VERSION}; received ${received}.`,
    );
    await expect(listEntries(protocolsRoot)).resolves.toEqual(filesBefore);
  });

  describe('when a path-like asset source passes validation', () => {
    beforeEach(() => {
      vi.doMock('@codaco/protocol-validation', async (importOriginal) => ({
        ...(await importOriginal<Record<string, unknown>>()),
        validateProtocol: () => Promise.resolve({ success: true }),
      }));
    });

    afterEach(() => {
      vi.doUnmock('@codaco/protocol-validation');
    });

    it.each(['../image.png', 'a/image.png', 'a\\image.png'])(
      "refuses %s with the save's own filename check",
      async (source) => {
        const filesBefore = await listEntries(protocolsRoot);

        const result = await saveProtocolSource(
          repoRoot,
          makeRequest(
            makeProtocol({
              image: { id: 'image', name: 'Image', type: 'image', source },
            }),
            [{ id: 'image', name: 'Image', source, dataBase64: btoa('x') }],
            sampleSourceRef,
          ),
        );

        expect(refused(result)).toEqual({
          ok: false,
          error: 'Protocol assets could not be saved.',
          issues: ['Asset image has an unsafe source filename.'],
        });
        await expect(listEntries(protocolsRoot)).resolves.toEqual(filesBefore);
      },
    );
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

    expect(refused(result).issues).toContain(
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
