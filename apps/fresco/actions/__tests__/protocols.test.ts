import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CurrentProtocolSchema,
  hashProtocol,
} from '@codaco/protocol-validation';

// Mock server-only first to prevent import errors
vi.mock('server-only', () => ({}));

const { mockProtocolCreate, mockSafeUpdateTag } = vi.hoisted(() => ({
  mockProtocolCreate:
    vi.fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>(),
  mockSafeUpdateTag: vi.fn(),
}));

vi.mock('~/lib/db', () => ({
  prisma: {
    protocol: {
      create: mockProtocolCreate,
    },
  },
}));

vi.mock('~/lib/cache', () => ({
  safeUpdateTag: mockSafeUpdateTag,
  safeRevalidateTag: vi.fn(),
  safeCacheTag: vi.fn(),
}));

vi.mock('~/lib/auth/guards', () => ({
  requireApiAuth: vi.fn().mockResolvedValue({ user: { username: 'admin' } }),
}));

vi.mock('~/lib/activityFeed', () => ({
  addEvent: vi.fn(),
  addEvents: vi.fn(),
}));

// insertProtocol never touches storage; mocked because the real module's
// import graph reaches storage-provider configuration.
vi.mock('~/lib/storage/layers/StorageLayer', () => ({
  getStorageLayer: vi.fn(),
}));

import { insertProtocol } from '~/actions/protocols';

/**
 * Mirrors the useProtocolImport test fixture: minimal, valid, and carrying a
 * stage — the parse output resolves defaults onto stages, making it a
 * DIFFERENT document from this one, which is what lets these tests tell a
 * hash of the document apart from a hash of the parse output.
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

const validInput = () => ({
  protocolDocument: MINIMAL_PROTOCOL,
  protocolName: 'study.netcanvas',
  newAssets: [],
  existingAssetIds: [],
  originalFile: { key: 'original-key', url: 'original-url' },
});

describe('insertProtocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProtocolCreate.mockResolvedValue({});
  });

  it('derives the stored hash and the stored row from the document alone', async () => {
    // A direct caller can decorate the payload however it likes — the insert
    // schema strips anything it does not name, and it no longer names a hash
    // field at all. (A variable rather than a literal argument so the extra
    // property survives to runtime, as it would over the wire.)
    const payload = { ...validInput(), protocolHash: 'attacker-chosen-hash' };
    const result = await insertProtocol(payload);

    expect(result).toEqual({ error: null, success: true });
    expect(mockProtocolCreate).toHaveBeenCalledTimes(1);
    const data = mockProtocolCreate.mock.calls[0]?.[0]?.data;
    expect(data).toBeDefined();
    if (!data) return;

    // The stored hash is the pre-parse document's — never the caller's claim.
    expect(data.hash).toBe(hashProtocol(MINIMAL_PROTOCOL));
    expect(data.hash).not.toBe('attacker-chosen-hash');

    // The stored row is the schema's parse of that same document (defaults
    // are deterministic, so a fresh parse reproduces it exactly).
    const parsed = CurrentProtocolSchema.parse(MINIMAL_PROTOCOL);
    expect(data.stages).toEqual(parsed.stages);
    expect(data.codebook).toEqual(parsed.codebook);

    // Non-vacuity guard for the pair above: the parse output is a different
    // document from the one the hash describes, so had the hash been derived
    // from the stored row instead, it would be a different number (spec
    // decision 15 — schema-injected defaults must not move protocol identity).
    expect(
      hashProtocol({ codebook: data.codebook, stages: data.stages }),
    ).not.toBe(data.hash);
  });

  it('rejects a document that is not a valid protocol, without writing', async () => {
    const result = await insertProtocol({
      ...validInput(),
      protocolDocument: { codebook: {}, stages: [] },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(mockProtocolCreate).not.toHaveBeenCalled();
    expect(mockSafeUpdateTag).not.toHaveBeenCalled();
  });

  it('rejects a payload the insert schema cannot parse, without writing', async () => {
    // NaN is `number` to the type system but rejected by the schema — a typed
    // stand-in for the arbitrary JSON a direct caller can put on the wire.
    const result = await insertProtocol({
      ...validInput(),
      newAssets: [
        {
          key: 'k',
          assetId: 'a',
          name: 'n',
          type: 't',
          url: 'u',
          size: Number.NaN,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(mockProtocolCreate).not.toHaveBeenCalled();
  });
});
