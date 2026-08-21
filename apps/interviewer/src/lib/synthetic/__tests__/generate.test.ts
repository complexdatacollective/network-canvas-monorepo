import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AssetData,
  GenerateInterviewsOptions,
  SyntheticInterviewResult,
} from '@codaco/protocol-utilities';
import { SyntheticDataConstraintError } from '@codaco/protocol-utilities';
import type * as ProtocolUtilities from '@codaco/protocol-utilities';
import type { CurrentProtocol } from '@codaco/protocol-validation';

import type { StoredProtocol } from '../../db/types';

const {
  mockGenerateInterviews,
  mockGetProtocolByHash,
  mockCreateSession,
  mockUpdateSession,
  mockDeleteSessions,
  mockLoadAssetData,
} = vi.hoisted(() => ({
  mockGenerateInterviews: vi.fn(),
  mockGetProtocolByHash: vi.fn(),
  mockCreateSession: vi.fn(),
  mockUpdateSession: vi.fn(),
  mockDeleteSessions: vi.fn(),
  mockLoadAssetData: vi.fn(),
}));

vi.mock('@codaco/protocol-utilities', async () => {
  const actual = await vi.importActual<typeof ProtocolUtilities>(
    '@codaco/protocol-utilities',
  );
  return { ...actual, generateInterviews: mockGenerateInterviews };
});

vi.mock('../../db/api', () => ({
  getProtocolByHash: mockGetProtocolByHash,
  createSession: mockCreateSession,
  updateSession: mockUpdateSession,
  deleteSessions: mockDeleteSessions,
}));

// Progress is the interview package's to compute (it owns the appended finish
// stage), so the host only has to pass the right arguments. Echoing them back
// is what lets the envelope test prove it passed the SESSION's step rather
// than a batch-wide constant.
vi.mock('@codaco/interview', () => ({
  getInterviewProgress: (stages: readonly unknown[], currentStep: number) => ({
    progress: (currentStep / (stages.length + 1)) * 100,
    totalSteps: stages.length + 1,
  }),
}));

vi.mock('../loadAssetData', () => ({
  loadSyntheticAssetData: mockLoadAssetData,
}));

const { generateSyntheticSessions } = await import('../generate');

const HASH = 'protocol-hash';

/**
 * A real protocol document, because the generation boundary re-parses it: the
 * engine refuses a stage that carries no `synthetic` descriptor, and those
 * descriptors exist only because the schema put them there.
 */
const STORED_DOCUMENT = {
  name: 'Test Protocol',
  schemaVersion: 8,
  codebook: {},
  stages: [
    {
      id: 'stage-info',
      type: 'Information',
      label: 'Welcome',
      title: 'Welcome',
      items: [{ id: 'item-1', type: 'text', content: '# Welcome' }],
    },
    {
      id: 'stage-info-2',
      type: 'Information',
      label: 'Goodbye',
      title: 'Goodbye',
      items: [{ id: 'item-2', type: 'text', content: '# Thanks' }],
    },
  ],
};

function storedProtocol(document: unknown = STORED_DOCUMENT): StoredProtocol {
  return {
    id: HASH,
    hash: HASH,
    name: 'Test Protocol',
    schemaVersion: 8,
    importedAt: '2026-08-01T00:00:00.000Z',
    codebook: {},
    protocol: document,
  } as unknown as StoredProtocol;
}

// Stands in for IndexedDB: `createSession` inserts, `deleteSessions` removes,
// so a test can assert on exactly what a batch left behind.
const store = new Map<string, { id: string }>();

function interview(
  index: number,
  overrides: Partial<SyntheticInterviewResult> = {},
): SyntheticInterviewResult {
  return {
    session: {
      id: `engine-session-${index}`,
      startTime: `2026-08-1${index}T09:00:00.000Z`,
      finishTime: `2026-08-1${index}T09:20:00.000Z`,
      exportTime: null,
      lastUpdated: `2026-08-1${index}T09:20:00.000Z`,
      network: {
        nodes: [],
        edges: [],
        ego: { _uid: `ego-${index}`, attributes: {} },
      },
      promptIndex: 0,
    },
    currentStep: 2,
    droppedOut: false,
    visitedStages: [0, 1],
    ...overrides,
  };
}

/** The engine returns `count` finished interviews. */
function completeBatch() {
  mockGenerateInterviews.mockImplementation(
    (
      _protocol: CurrentProtocol,
      options: GenerateInterviewsOptions,
      _assetData: AssetData,
      onProgress?: (done: number, total: number) => void,
    ) => {
      const results = Array.from({ length: options.count }, (_, index) => {
        onProgress?.(index + 1, options.count);
        return interview(index);
      });
      return results;
    },
  );
}

function refusal() {
  return new SyntheticDataConstraintError(
    [
      {
        entity: 'node',
        entityType: 'person',
        entityTypeName: 'Person',
        variableIds: ['band-var'],
        variableNames: ['Band'],
        rules: ['unique'],
        reason: 'the draw exhausted every remaining distinct value',
      },
    ],
    'this protocol declares validation rules that cannot all be satisfied together',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();

  mockGetProtocolByHash.mockResolvedValue(storedProtocol());
  mockLoadAssetData.mockResolvedValue({});

  let next = 0;
  mockCreateSession.mockImplementation(async () => {
    const session = { id: `session-${++next}` };
    store.set(session.id, session);
    return session;
  });
  mockUpdateSession.mockResolvedValue(undefined);
  mockDeleteSessions.mockImplementation(async (ids: readonly string[]) => {
    for (const id of ids) store.delete(id);
  });
});

const BATCH = {
  protocolHash: HASH,
  count: 5,
  simulateDropOut: false,
  respectSkipLogic: true,
} as const;

describe('generateSyntheticSessions', () => {
  it('persists one session per generated interview', async () => {
    completeBatch();

    const summary = await generateSyntheticSessions(BATCH);

    expect(summary.created).toBe(5);
    expect(store.size).toBe(5);
    expect(mockDeleteSessions).not.toHaveBeenCalled();
  });

  it('hands the engine a protocol the schema has parsed, not the stored row', async () => {
    completeBatch();

    await generateSyntheticSessions(BATCH);

    const [protocol] = mockGenerateInterviews.mock.calls[0] as [
      CurrentProtocol,
    ];
    // The row carries no `synthetic` anywhere; re-parsing is what puts the
    // per-stage descriptors there, and without them the engine refuses.
    expect(protocol.stages).toHaveLength(2);
    for (const stage of protocol.stages) {
      expect(stage).toHaveProperty('synthetic');
    }
  });

  it('refuses a stored protocol the current schema cannot read', async () => {
    mockGetProtocolByHash.mockResolvedValue(
      storedProtocol({ name: 'Test Protocol', schemaVersion: 8 }),
    );

    await expect(generateSyntheticSessions(BATCH)).rejects.toThrow(
      /could not be read by the current protocol schema/,
    );
    expect(mockGenerateInterviews).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('passes the host-resolved asset data through to the engine', async () => {
    completeBatch();
    const assetData = {
      rosterNodes: { 'stage-roster': [] },
      geojsonPropertyValues: { 'stage-map': ['Bishopbriggs'] },
    };
    mockLoadAssetData.mockResolvedValue(assetData);

    await generateSyntheticSessions(BATCH);

    expect(mockGenerateInterviews.mock.calls[0]?.[2]).toBe(assetData);
  });

  it('asks the engine for the batch the researcher configured', async () => {
    completeBatch();

    await generateSyntheticSessions({
      ...BATCH,
      count: 3,
      simulateDropOut: true,
      respectSkipLogic: false,
      seed: 4321,
    });

    expect(mockGenerateInterviews.mock.calls[0]?.[1]).toEqual({
      count: 3,
      seed: 4321,
      simulateDropOut: true,
      respectSkipLogic: false,
    });
  });

  it('reports back the seed it was given, so a batch can be repeated', async () => {
    completeBatch();

    const summary = await generateSyntheticSessions({ ...BATCH, seed: 4321 });

    expect(summary.seed).toBe(4321);
  });

  it('draws a seed when none is pinned, and reports the one it used', async () => {
    completeBatch();

    const first = await generateSyntheticSessions(BATCH);
    const second = await generateSyntheticSessions(BATCH);

    expect(Number.isInteger(first.seed)).toBe(true);
    // The drawn seed is the one the engine actually ran on — otherwise
    // re-entering it would reproduce a different batch.
    expect(mockGenerateInterviews.mock.calls[0]?.[1]).toMatchObject({
      seed: first.seed,
    });
    expect(mockGenerateInterviews.mock.calls[1]?.[1]).toMatchObject({
      seed: second.seed,
    });
    expect(second.seed).not.toBe(first.seed);
  });

  it('stores each session under the envelope the engine produced', async () => {
    mockGenerateInterviews.mockReturnValue([
      interview(1, {
        currentStep: 2,
        session: {
          ...interview(1).session,
          stageMetadata: { 1: [[0, 'node-a', 'node-b', true]] },
        },
      }),
    ]);

    await generateSyntheticSessions({ ...BATCH, count: 1 });

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolHash: HASH,
        protocolName: 'Test Protocol',
        // Derived from the engine's session id, so a pinned seed reproduces
        // the case ids too.
        caseId: 'synthetic-engine-session-1',
        isSynthetic: true,
      }),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith('session-1', {
      currentStep: 2,
      // 2 of (2 stages + the appended finish stage).
      progress: (2 / 3) * 100,
      stageMetadata: { 1: [[0, 'node-a', 'node-b', true]] },
      startedAt: '2026-08-11T09:00:00.000Z',
      finishedAt: '2026-08-11T09:20:00.000Z',
    });
  });

  it('stores a dropped interview as a genuine unfinished session', async () => {
    mockGenerateInterviews.mockReturnValue([
      interview(1, {
        droppedOut: true,
        currentStep: 1,
        session: { ...interview(1).session, finishTime: null },
      }),
    ]);

    await generateSyntheticSessions({ ...BATCH, count: 1 });

    expect(mockUpdateSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ currentStep: 1, finishedAt: null }),
    );
  });

  it('reports generation and storage as separate phases', async () => {
    completeBatch();
    const onProgress = vi.fn();

    await generateSyntheticSessions({ ...BATCH, count: 2, onProgress });

    expect(onProgress.mock.calls.map(([event]) => event)).toEqual([
      { phase: 'generating', current: 1, total: 2 },
      { phase: 'generating', current: 2, total: 2 },
      { phase: 'storing', current: 1, total: 2 },
      { phase: 'storing', current: 2, total: 2 },
    ]);
  });

  it('surfaces a refusal without having written anything to roll back', async () => {
    mockGenerateInterviews.mockImplementation(() => {
      throw refusal();
    });

    await expect(generateSyntheticSessions(BATCH)).rejects.toThrow(
      /cannot all be satisfied together/,
    );

    // The engine refuses before the first row is written, so there is nothing
    // to undo — and nothing that a failed rollback could strand.
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockDeleteSessions).not.toHaveBeenCalled();
  });

  it('rolls back the row whose own update failed, not just its predecessors', async () => {
    // `createSession` inserts the row; `updateSession` fills it in. A failure
    // between the two — a rejected encryption or IndexedDB write — leaves a
    // committed row that the batch never finished. It has to roll back too.
    completeBatch();
    mockUpdateSession.mockRejectedValueOnce(new Error('database write failed'));

    await expect(generateSyntheticSessions(BATCH)).rejects.toThrow(
      'database write failed',
    );

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockDeleteSessions).toHaveBeenCalledWith(['session-1']);
    expect(store.size).toBe(0);
  });

  it('rolls back every earlier row when a later write fails', async () => {
    completeBatch();
    mockUpdateSession
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('database write failed'));

    await expect(generateSyntheticSessions(BATCH)).rejects.toThrow(
      'database write failed',
    );

    expect(mockDeleteSessions).toHaveBeenCalledWith([
      'session-1',
      'session-2',
      'session-3',
    ]);
    expect(store.size).toBe(0);
  });

  it('reports the write failure even when the rollback itself fails', async () => {
    completeBatch();
    mockUpdateSession.mockRejectedValueOnce(new Error('database write failed'));
    mockDeleteSessions.mockRejectedValue(new Error('database is closed'));

    await expect(generateSyntheticSessions(BATCH)).rejects.toThrow(
      'database write failed',
    );
  });

  it('reports a missing protocol rather than generating from nothing', async () => {
    mockGetProtocolByHash.mockResolvedValue(undefined);

    await expect(generateSyntheticSessions(BATCH)).rejects.toThrow(
      'Protocol not found for hash "protocol-hash".',
    );
    expect(mockGenerateInterviews).not.toHaveBeenCalled();
  });
});
