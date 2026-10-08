import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addEventMock,
  cookieSetMock,
  findUniqueMock,
  getAppSettingMock,
  revalidateMock,
  updateMock,
} = vi.hoisted(() => ({
  addEventMock: vi.fn(),
  cookieSetMock: vi.fn(),
  findUniqueMock: vi.fn(),
  getAppSettingMock: vi.fn(),
  revalidateMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, after: vi.fn() };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ set: cookieSetMock })),
}));

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

vi.mock('~/lib/activityFeed', () => ({
  addEvent: addEventMock,
}));

vi.mock('~/lib/cache', () => ({
  safeRevalidateTag: revalidateMock,
}));

vi.mock('~/lib/posthog-server', () => ({
  captureException: vi.fn(),
  flushPostHog: vi.fn(),
}));

import { POST } from '../route';

// A stored schema 9 design, which the route parses before it trusts it.
const STAGES = [
  {
    id: 'intro',
    type: 'Information',
    label: { en: 'Intro' },
    title: { en: 'Intro' },
    items: [],
  },
  {
    id: 'finish-ineligible',
    type: 'FinishSession',
    label: { en: 'Ineligible' },
    title: { en: 'Ineligible' },
    content: { en: 'Thank you.' },
    outcome: 'ineligible',
  },
  {
    id: 'finish-completed',
    type: 'FinishSession',
    label: { en: 'Done' },
    title: { en: 'Done' },
    content: { en: 'Thank you.' },
    outcome: 'completed',
  },
];

const STORED_PROTOCOL = {
  stages: STAGES,
  codebook: { node: {}, edge: {} },
  localization: { defaultLocale: 'en', locales: ['en'] },
  experiments: null,
};

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/interviews/interview-1/finish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ interviewId: 'interview-1' }) },
  );
}

function installInterview(finishTime: Date | null = null) {
  findUniqueMock.mockResolvedValue({
    finishTime,
    protocolId: 'protocol-1',
    protocol: STORED_PROTOCOL,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppSettingMock.mockResolvedValue(false);
  updateMock.mockResolvedValue({
    protocolId: 'protocol-1',
    network: {
      nodes: [{ _uid: 'node-1', type: 'person', attributes: {} }],
      edges: [],
      ego: { _uid: 'ego-1', attributes: {} },
    },
    stageMetadata: null,
    participant: { label: null, identifier: 'P001' },
  });
});

describe('interview finish route', () => {
  it('records the finish time, stage and outcome together', async () => {
    installInterview();

    const response = await post({
      stageId: 'finish-ineligible',
      outcome: 'ineligible',
    });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'interview-1' },
      data: {
        finishTime: expect.any(Date),
        finishStageId: 'finish-ineligible',
        finishOutcome: 'ineligible',
      },
      include: { participant: true },
    });
    expect(addEventMock).toHaveBeenCalledWith(
      'Interview Completed',
      expect.any(String),
      expect.objectContaining({ kind: 'interviewCompleted' }),
      { nodeCount: 1, edgeCount: 0 },
    );
    expect(revalidateMock).toHaveBeenCalled();
  });

  it('names the finished interview in the protocol’s limit cookie', async () => {
    installInterview();

    await post({ stageId: 'finish-completed', outcome: 'completed' });

    expect(cookieSetMock).toHaveBeenCalledWith(
      'protocol-1',
      'interview-1',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it.each([
    [
      'an outcome its stage does not declare',
      { stageId: 'finish-completed', outcome: 'ineligible' },
    ],
    [
      'a stage that is not a finish stage',
      { stageId: 'intro', outcome: 'completed' },
    ],
    [
      'a stage the protocol does not have',
      { stageId: 'elsewhere', outcome: 'completed' },
    ],
  ])('refuses %s without touching the row', async (_case, body) => {
    installInterview();

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid request body' });
    expect(updateMock).not.toHaveBeenCalled();
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', ''],
    ['unparseable JSON', '{'],
    ['an empty object', {}],
    ['a missing outcome', { stageId: 'finish-completed' }],
    ['a missing stage', { outcome: 'completed' }],
    ['an unknown outcome', { stageId: 'finish-completed', outcome: 'done' }],
  ])('refuses %s before reading the interview', async (_case, body) => {
    installInterview();

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('refuses to finish against a stored protocol that does not parse, without touching the row', async () => {
    findUniqueMock.mockResolvedValue({
      finishTime: null,
      protocolId: 'protocol-1',
      protocol: {
        ...STORED_PROTOCOL,
        stages: [...STAGES, { id: 'broken', type: 'NotAnInterface' }],
      },
    });

    const response = await post({
      stageId: 'finish-completed',
      outcome: 'completed',
    });

    expect(response.status).toBe(500);
    expect(updateMock).not.toHaveBeenCalled();
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it('answers 404 for an interview id that does not exist', async () => {
    findUniqueMock.mockResolvedValue(null);

    const response = await post({
      stageId: 'finish-completed',
      outcome: 'completed',
    });

    expect(response.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('keeps a frozen interview’s recorded finish', async () => {
    installInterview(new Date('2026-01-01T00:00:00.000Z'));
    getAppSettingMock.mockImplementation((key: string) =>
      Promise.resolve(key === 'freezeInterviewsAfterCompletion'),
    );

    const response = await post({
      stageId: 'finish-ineligible',
      outcome: 'ineligible',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      applied: false,
      frozen: true,
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(addEventMock).not.toHaveBeenCalled();
    expect(cookieSetMock).toHaveBeenCalledWith(
      'protocol-1',
      'interview-1',
      expect.anything(),
    );
  });

  it('records a second finish when the interview is not frozen', async () => {
    installInterview(new Date('2026-01-01T00:00:00.000Z'));

    const response = await post({
      stageId: 'finish-completed',
      outcome: 'completed',
    });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          finishStageId: 'finish-completed',
          finishOutcome: 'completed',
        }),
      }),
    );
  });

  it('answers 500 when the write fails', async () => {
    installInterview();
    updateMock.mockRejectedValue(new Error('database unavailable'));

    const response = await post({
      stageId: 'finish-completed',
      outcome: 'completed',
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to finish interview',
    });
  });
});
