import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUniqueMock, getAppSettingMock, updateMock, updateManyMock } =
  vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    getAppSettingMock: vi.fn(),
    updateMock: vi.fn(),
    updateManyMock: vi.fn(),
  }));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, after: vi.fn() };
});

vi.mock('~/lib/db', () => ({
  prisma: {
    interview: {
      findUnique: findUniqueMock,
      update: updateMock,
      updateMany: updateManyMock,
    },
  },
}));

vi.mock('~/queries/appSettings', () => ({
  getAppSetting: getAppSettingMock,
}));

vi.mock('~/lib/posthog-server', () => ({
  captureException: vi.fn(),
  flushPostHog: vi.fn(),
}));

import { POST } from '../route';

const legacyNetwork = {
  nodes: [
    {
      _uid: 'node-1',
      type: 'person',
      attributes: { name: 'Ada', unanswered: null },
    },
  ],
  edges: [],
  ego: {
    _uid: 'ego-1',
    attributes: {
      unanswered: null,
      falseValue: false,
      zeroValue: 0,
      emptyValue: '',
      emptySelection: [],
    },
  },
};

function makeRequest(network: unknown, extra: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/interview/interview-1/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'interview-1',
      network,
      currentStep: 2,
      lastUpdated: '2026-08-12T00:00:00.000Z',
      ...extra,
    }),
  });
}

function post(request: NextRequest) {
  return POST(request, {
    params: Promise.resolve({ interviewId: 'interview-1' }),
  });
}

function networkNamed(name: string) {
  return {
    nodes: [{ _uid: 'node-1', type: 'person', attributes: { name } }],
    edges: [],
    ego: { _uid: 'ego-1', attributes: {} },
  };
}

/**
 * A stand-in for the row the route writes to, applying the same predicate
 * Postgres does: `updateMany` commits only when the stored revision is lower
 * than the incoming one. Asserting on the call arguments alone would pass just
 * as happily against a route that built the predicate and then ignored it.
 */
function installInterviewRow(
  initial: { syncRevision: number; network: unknown } | null,
) {
  const row = initial ? { ...initial, currentStep: 0 } : null;

  updateManyMock.mockImplementation(
    ({
      where,
      data,
    }: {
      where: { id: string; syncRevision: { lt: number } };
      data: { syncRevision: number; network: unknown; currentStep: number };
    }) => {
      if (!row || where.id !== 'interview-1')
        return Promise.resolve({ count: 0 });
      if (row.syncRevision >= where.syncRevision.lt) {
        return Promise.resolve({ count: 0 });
      }
      row.syncRevision = data.syncRevision;
      row.network = data.network;
      row.currentStep = data.currentStep;
      return Promise.resolve({ count: 1 });
    },
  );
  findUniqueMock.mockImplementation(() => Promise.resolve(row));

  return () => row;
}

describe('interview sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppSettingMock.mockResolvedValue(false);
    updateMock.mockResolvedValue({});
    updateManyMock.mockResolvedValue({ count: 1 });
    findUniqueMock.mockResolvedValue(null);
  });

  it('accepts legacy null attributes and persists a canonical sparse network', async () => {
    const response = await POST(makeRequest(legacyNetwork), {
      params: Promise.resolve({ interviewId: 'interview-1' }),
    });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'interview-1' },
      data: {
        network: {
          nodes: [
            {
              _uid: 'node-1',
              type: 'person',
              attributes: { name: 'Ada' },
            },
          ],
          edges: [],
          ego: {
            _uid: 'ego-1',
            attributes: {
              falseValue: false,
              zeroValue: 0,
              emptyValue: '',
              emptySelection: [],
            },
          },
        },
        currentStep: 2,
        stageMetadata: undefined,
      },
    });
  });

  it('keeps the generic HTTP 400 response for invalid defined values', async () => {
    const response = await POST(
      makeRequest({
        ...legacyNetwork,
        ego: {
          ...legacyNetwork.ego,
          attributes: { invalid: { nested: 'value' } },
        },
      }),
      { params: Promise.resolve({ interviewId: 'interview-1' }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid request body',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('keeps the generic HTTP 400 response for malformed JSON', async () => {
    const request = new NextRequest(
      'http://localhost/interview/interview-1/sync',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ interviewId: 'interview-1' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid request body',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });
  describe('write ordering', () => {
    it('discards a write that lands after a newer one instead of rolling the interview back', async () => {
      const readRow = installInterviewRow({
        syncRevision: 0,
        network: networkNamed('initial'),
      });

      // The newer snapshot lands first: an `unloading` write is issued rather
      // than queued, so it can overtake the ordinary write in front of it.
      const newer = await post(
        makeRequest(networkNamed('newer'), { syncRevision: 2 }),
      );
      expect(newer.status).toBe(200);
      await expect(newer.json()).resolves.toEqual({
        success: true,
        applied: true,
        syncRevision: 2,
      });

      // The request it overtook arrives afterwards. Aborting it client-side
      // cannot stop a handler the server has already started, so the row has to
      // refuse it.
      const older = await post(
        makeRequest(networkNamed('older'), { syncRevision: 1 }),
      );
      expect(older.status).toBe(200);
      await expect(older.json()).resolves.toEqual({
        success: true,
        applied: false,
        syncRevision: 2,
      });

      expect(readRow()?.network).toEqual(networkNamed('newer'));
      expect(readRow()?.syncRevision).toBe(2);
    });

    it('applies writes that arrive in order', async () => {
      const readRow = installInterviewRow({
        syncRevision: 4,
        network: networkNamed('initial'),
      });

      await post(makeRequest(networkNamed('first'), { syncRevision: 5 }));
      await post(makeRequest(networkNamed('second'), { syncRevision: 6 }));

      expect(readRow()?.network).toEqual(networkNamed('second'));
      expect(readRow()?.syncRevision).toBe(6);
    });

    it('refuses a numbered write when there is no such interview, rather than reporting success', async () => {
      installInterviewRow(null);

      const response = await post(
        makeRequest(networkNamed('orphan'), { syncRevision: 1 }),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'Interview not found',
      });
    });

    it('still applies a write from a tab that sends no revision', async () => {
      // A bundle loaded before this guard shipped keeps syncing across a
      // deployment. Rejecting those requests would lose the rest of that
      // participant's interview; they give up ordering, not the write.
      const response = await post(makeRequest(networkNamed('legacy')));

      expect(response.status).toBe(200);
      expect(updateManyMock).not.toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'interview-1' },
        data: expect.objectContaining({ network: networkNamed('legacy') }),
      });
    });

    it('reports the stored revision when a finished interview is frozen', async () => {
      // The route writes nothing here, so the client would otherwise keep
      // counting up from a number the row never reaches.
      getAppSettingMock.mockResolvedValue(true);
      findUniqueMock.mockResolvedValue({
        finishTime: new Date('2026-08-12T00:00:00.000Z'),
        syncRevision: 9,
      });

      const response = await post(
        makeRequest(networkNamed('after-finish'), { syncRevision: 3 }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        applied: false,
        syncRevision: 9,
      });
      expect(updateManyMock).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
    });
  });
});
