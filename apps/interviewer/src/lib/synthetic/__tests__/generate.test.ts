import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyntheticDataConstraintError } from '@codaco/protocol-utilities';
import type * as ProtocolUtilities from '@codaco/protocol-utilities';

import type { StoredProtocol } from '../../db/types';

const {
  mockGenerateNetwork,
  mockGetProtocolByHash,
  mockCreateSession,
  mockUpdateSession,
  mockDeleteSessions,
} = vi.hoisted(() => ({
  mockGenerateNetwork: vi.fn(),
  mockGetProtocolByHash: vi.fn(),
  mockCreateSession: vi.fn(),
  mockUpdateSession: vi.fn(),
  mockDeleteSessions: vi.fn(),
}));

vi.mock('@codaco/protocol-utilities', async () => {
  const actual = await vi.importActual<typeof ProtocolUtilities>(
    '@codaco/protocol-utilities',
  );
  return { ...actual, generateNetwork: mockGenerateNetwork };
});

vi.mock('../../db/api', () => ({
  getProtocolByHash: mockGetProtocolByHash,
  createSession: mockCreateSession,
  updateSession: mockUpdateSession,
  deleteSessions: mockDeleteSessions,
}));

vi.mock('@codaco/interview', () => ({
  getInterviewProgress: () => ({ progress: 100 }),
}));

vi.mock('../loadRosterData', () => ({
  loadRosterNodesForStages: async () => ({}),
}));

const { generateSyntheticSessions } = await import('../generate');

const HASH = 'protocol-hash';

// Stands in for IndexedDB: `createSession` inserts, `deleteSessions` removes,
// so a test can assert on exactly what a batch left behind.
const store = new Map<string, { id: string }>();

function emptyNetwork() {
  return { nodes: [], edges: [], ego: undefined };
}

function generationResult() {
  return {
    network: emptyNetwork(),
    stageMetadata: undefined,
    currentStep: 0,
    droppedOut: false,
  };
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

/** Succeeds `successes` times, then refuses — the draw-time exhaustion shape. */
function throwAfter(successes: number) {
  let calls = 0;
  mockGenerateNetwork.mockImplementation(() => {
    calls += 1;
    if (calls > successes) throw refusal();
    return generationResult();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();

  mockGetProtocolByHash.mockResolvedValue({
    hash: HASH,
    name: 'Test Protocol',
    codebook: {},
    protocol: { stages: [] },
  } as unknown as StoredProtocol);

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

describe('generateSyntheticSessions', () => {
  it('persists the whole batch when every draw succeeds', async () => {
    mockGenerateNetwork.mockImplementation(generationResult);

    const created = await generateSyntheticSessions({
      protocolHash: HASH,
      count: 5,
      simulateDropOut: false,
      respectSkipLogicAndFiltering: false,
    });

    expect(created).toBe(5);
    expect(store.size).toBe(5);
    expect(mockDeleteSessions).not.toHaveBeenCalled();
  });

  it('leaves nothing stored when a draw is refused part-way through', async () => {
    throwAfter(3);

    await expect(
      generateSyntheticSessions({
        protocolHash: HASH,
        count: 10,
        simulateDropOut: false,
        respectSkipLogicAndFiltering: false,
      }),
    ).rejects.toBeInstanceOf(SyntheticDataConstraintError);

    // Three sessions were written before the refusal landed; none survive it.
    expect(mockCreateSession).toHaveBeenCalledTimes(3);
    expect(mockDeleteSessions).toHaveBeenCalledWith([
      'session-1',
      'session-2',
      'session-3',
    ]);
    expect(store.size).toBe(0);
  });

  it('still surfaces the refusal, so the researcher sees why it failed', async () => {
    throwAfter(1);

    await expect(
      generateSyntheticSessions({
        protocolHash: HASH,
        count: 4,
        simulateDropOut: false,
        respectSkipLogicAndFiltering: false,
      }),
    ).rejects.toThrow(/cannot all be satisfied together/);
  });

  it('rolls back sessions written before the drop-out top-up fails', async () => {
    // Every session drops out, so the 10%-completed top-up runs and re-draws —
    // the second place `generateNetwork` can refuse after rows already exist.
    let calls = 0;
    mockGenerateNetwork.mockImplementation(() => {
      calls += 1;
      if (calls > 4) throw refusal();
      return { ...generationResult(), droppedOut: true };
    });

    await expect(
      generateSyntheticSessions({
        protocolHash: HASH,
        count: 4,
        simulateDropOut: true,
        respectSkipLogicAndFiltering: false,
      }),
    ).rejects.toBeInstanceOf(SyntheticDataConstraintError);

    expect(mockCreateSession).toHaveBeenCalledTimes(4);
    expect(store.size).toBe(0);
  });

  it('reports the generation failure even when the rollback itself fails', async () => {
    throwAfter(2);
    mockDeleteSessions.mockRejectedValue(new Error('database is closed'));

    await expect(
      generateSyntheticSessions({
        protocolHash: HASH,
        count: 5,
        simulateDropOut: false,
        respectSkipLogicAndFiltering: false,
      }),
    ).rejects.toBeInstanceOf(SyntheticDataConstraintError);
  });

  it('rolls back the row whose own update failed, not just its predecessors', async () => {
    // `createSession` inserts the row; `updateSession` fills it in. A failure
    // between the two — a rejected encryption or IndexedDB write — leaves a
    // committed row that the batch never finished. It has to roll back too.
    mockGenerateNetwork.mockImplementation(generationResult);
    mockUpdateSession.mockRejectedValueOnce(new Error('database write failed'));

    await expect(
      generateSyntheticSessions({
        protocolHash: HASH,
        count: 5,
        simulateDropOut: false,
        respectSkipLogicAndFiltering: false,
      }),
    ).rejects.toThrow('database write failed');

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockDeleteSessions).toHaveBeenCalledWith(['session-1']);
    expect(store.size).toBe(0);
  });

  it('rolls back every earlier row when a later update fails', async () => {
    mockGenerateNetwork.mockImplementation(generationResult);
    mockUpdateSession
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('database write failed'));

    await expect(
      generateSyntheticSessions({
        protocolHash: HASH,
        count: 5,
        simulateDropOut: false,
        respectSkipLogicAndFiltering: false,
      }),
    ).rejects.toThrow('database write failed');

    expect(mockDeleteSessions).toHaveBeenCalledWith([
      'session-1',
      'session-2',
      'session-3',
    ]);
    expect(store.size).toBe(0);
  });

  it('does not attempt a rollback when nothing was written yet', async () => {
    throwAfter(0);

    await expect(
      generateSyntheticSessions({
        protocolHash: HASH,
        count: 3,
        simulateDropOut: false,
        respectSkipLogicAndFiltering: false,
      }),
    ).rejects.toBeInstanceOf(SyntheticDataConstraintError);

    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockDeleteSessions).toHaveBeenCalledWith([]);
  });
});
