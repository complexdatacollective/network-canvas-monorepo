import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashProtocol } from '@codaco/protocol-validation';

type InsertProtocolInput = {
  protocol: { codebook: unknown; stages: unknown };
  protocolHash: string;
  protocolName: string;
  newAssets: unknown[];
  existingAssetIds: string[];
  originalFile: { key: string; url: string };
};

type UploadedFile = { key: string; url: string; name: string; size: number };

const {
  cleanupUploadedFiles,
  getNewAssetIds,
  getProtocolByHash,
  insertProtocol,
  loadAsync,
  toast,
  uploadAssets,
} = vi.hoisted(() => ({
  cleanupUploadedFiles: vi.fn<(keys: string[]) => Promise<void>>(),
  getNewAssetIds: vi.fn<(assetIds: string[]) => Promise<string[]>>(),
  getProtocolByHash: vi.fn<(hash: string) => Promise<unknown>>(),
  insertProtocol:
    vi.fn<(input: InsertProtocolInput) => Promise<{ error: string | null }>>(),
  loadAsync: vi.fn<(buffer: ArrayBuffer) => Promise<unknown>>(),
  toast: { add: vi.fn(), update: vi.fn(), close: vi.fn() },
  uploadAssets:
    vi.fn<
      (
        files: File[],
        onProgress?: (progress: number) => void,
      ) => Promise<UploadedFile[]>
    >(),
}));

vi.mock('~/actions/protocols', () => ({
  cleanupUploadedFiles,
  getNewAssetIds,
  getProtocolByHash,
  insertProtocol,
}));

vi.mock('~/hooks/useUploadAssets', () => ({
  useUploadAssets: () => ({ uploadAssets }),
}));

vi.mock('@codaco/fresco-ui/Toast', () => ({ useToast: () => toast }));

vi.mock('jszip', () => ({ default: { loadAsync } }));

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn(), captureException: vi.fn() },
}));

import { useProtocolImport } from '~/hooks/useProtocolImport';

/**
 * A minimal but non-empty v8 protocol. The stage matters: the hash covers
 * `codebook` and `stages`, so a protocol with no stages could not tell a hash
 * of the raw document apart from a hash of the parse output.
 */
const MINIMAL_PROTOCOL = {
  schemaVersion: 8,
  name: 'Hashable',
  description: '',
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          'var-name': { name: 'name', type: 'text', component: 'Text' },
        },
      },
    },
    edge: {},
    ego: {},
  },
  stages: [
    {
      id: 'stage-people',
      type: 'NameGenerator',
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'Add a person',
        fields: [{ variable: 'var-name', prompt: 'Their name' }],
      },
      prompts: [{ id: 'prompt-people', text: 'Who do you know?' }],
    },
  ],
  assetManifest: {},
};

/**
 * The showcase protocol carrying authored stage/panel/prompt/variable
 * `synthetic` blocks, bundled under `packages/protocols/e2e/` with its own
 * manifest entry.
 */
const SYNTHETIC_SHOWCASE = path.resolve(
  import.meta.dirname,
  '../../../../packages/protocols/e2e/synthetic-showcase/protocol.json',
);

/**
 * A zip stand-in exposing only what the import flow reads from one:
 * protocol.json as a string, and any `assets/<source>` entries as Blobs (the
 * asset fetch calls `.async('blob')` and throws on a manifest source the
 * archive lacks).
 */
const zipContaining = (
  document: unknown,
  assets: Record<string, string> = {},
) => ({
  file: (name: string) => {
    if (name === 'protocol.json') {
      return { async: () => Promise.resolve(JSON.stringify(document)) };
    }
    const asset = assets[name.replace(/^assets\//, '')];
    return asset === undefined
      ? null
      : { async: () => Promise.resolve(new Blob([asset])) };
  },
});

const runImport = async (
  document: unknown,
  assets: Record<string, string> = {},
) => {
  loadAsync.mockResolvedValue(zipContaining(document, assets));

  const { result } = renderHook(() => useProtocolImport());
  result.current.importProtocols([
    new File([JSON.stringify(document)], 'study.netcanvas'),
  ]);

  await waitFor(() => {
    expect(toast.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ variant: 'success' }),
    );
  });
};

describe('hash boundary (plan §1.3)', () => {
  beforeEach(() => {
    getProtocolByHash.mockResolvedValue(null);
    getNewAssetIds.mockResolvedValue([]);
    insertProtocol.mockResolvedValue({ error: null });
    cleanupUploadedFiles.mockResolvedValue(undefined);
    uploadAssets.mockImplementation((files) =>
      Promise.resolve(
        files.map((file) => ({
          key: `key-${file.name}`,
          url: `url-${file.name}`,
          name: file.name,
          size: file.size,
        })),
      ),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dedupe hash and stored hash agree and equal the raw document's", async () => {
    await runImport(MINIMAL_PROTOCOL);

    // One computation, threaded: the hash a duplicate is detected by and the
    // hash a protocol is stored under must be the same number, and it must
    // describe the document the researcher shipped rather than whatever
    // defaults the current schema resolves onto it.
    const rawHash = hashProtocol(MINIMAL_PROTOCOL);
    expect(getProtocolByHash).toHaveBeenCalledWith(rawHash);
    expect(insertProtocol.mock.calls[0]?.[0]?.protocolHash).toBe(rawHash);

    // Paired with the equality above so neither half can pass vacuously: the
    // parse output this protocol validates to is a different document, so a
    // hash taken from it — at either site — would be a different number.
    const parsed = insertProtocol.mock.calls[0]?.[0]?.protocol;
    expect(parsed).toBeDefined();
    if (!parsed) return;
    expect(hashProtocol(parsed)).not.toBe(rawHash);
  });

  // Still skipped after Phase 1.3: the showcase protocol this reads lands in
  // the parallel §1.5 workstream. Un-skip when integrating that work — the
  // hash boundary it depends on is already in place.
  it('imports a protocol carrying authored synthetic blocks cleanly', async () => {
    const showcase: unknown = JSON.parse(
      readFileSync(SYNTHETIC_SHOWCASE, 'utf8'),
    );
    // The showcase's assetManifest names its roster; the asset fetch throws
    // on a manifest source the archive lacks, so the stand-in must carry it.
    const roster = readFileSync(
      path.resolve(
        path.dirname(SYNTHETIC_SHOWCASE),
        'assets/colleagues-roster.json',
      ),
      'utf8',
    );

    await runImport(showcase, { 'colleagues-roster.json': roster });

    expect(insertProtocol).toHaveBeenCalledTimes(1);
  });
});
