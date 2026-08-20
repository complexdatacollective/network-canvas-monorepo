import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUniqueMock, getAppSettingMock, updateMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  getAppSettingMock: vi.fn(),
  updateMock: vi.fn(),
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

function makeRequest(network: unknown) {
  return new NextRequest('http://localhost/interview/interview-1/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'interview-1',
      network,
      currentStep: 2,
      lastUpdated: '2026-08-12T00:00:00.000Z',
    }),
  });
}

describe('interview sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppSettingMock.mockResolvedValue(false);
    updateMock.mockResolvedValue({});
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
});
