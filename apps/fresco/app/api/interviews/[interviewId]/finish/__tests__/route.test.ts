import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addEventMock,
  cookieSetMock,
  findUniqueMock,
  getAppSettingMock,
  revalidateMock,
  updateManyMock,
} = vi.hoisted(() => ({
  addEventMock: vi.fn(),
  cookieSetMock: vi.fn(),
  findUniqueMock: vi.fn(),
  getAppSettingMock: vi.fn(),
  revalidateMock: vi.fn(),
  updateManyMock: vi.fn(),
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
      updateMany: updateManyMock,
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
    finishLabel: { en: 'Finish' },
    finishConfirmation: { en: 'Finish this interview?' },
    finishedNotice: { en: 'This interview is finished.' },
    finishFailed: { en: 'The interview could not be finished.' },
    outcome: 'ineligible',
  },
  {
    id: 'finish-completed',
    type: 'FinishSession',
    label: { en: 'Done' },
    title: { en: 'Done' },
    content: { en: 'Thank you.' },
    finishLabel: { en: 'Finish' },
    finishConfirmation: { en: 'Finish this interview?' },
    finishedNotice: { en: 'This interview is finished.' },
    finishFailed: { en: 'The interview could not be finished.' },
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

// The row as the route re-reads it after its write, with the participant.
const FINISHED_ROW = {
  protocolId: 'protocol-1',
  network: {
    nodes: [{ _uid: 'node-1', type: 'person', attributes: {} }],
    edges: [],
    ego: { _uid: 'ego-1', attributes: {} },
  },
  stageMetadata: null,
  participant: { label: null, identifier: 'P001' },
};

type FindUniqueArgs = { include?: unknown };

/**
 * The first read is of the interview and its protocol; the re-read after the
 * write (the one that includes the participant) is of the row it left.
 */
function installInterview(
  finishTime: Date | null = null,
  afterWrite: object | null = FINISHED_ROW,
) {
  findUniqueMock.mockImplementation((args: FindUniqueArgs) =>
    Promise.resolve(
      args.include
        ? afterWrite
        : { finishTime, protocolId: 'protocol-1', protocol: STORED_PROTOCOL },
    ),
  );
}

const freezeOnCompletion = () =>
  getAppSettingMock.mockImplementation((key: string) =>
    Promise.resolve(key === 'freezeInterviewsAfterCompletion'),
  );

beforeEach(() => {
  vi.clearAllMocks();
  getAppSettingMock.mockResolvedValue(false);
  updateManyMock.mockResolvedValue({ count: 1 });
});

describe('interview finish route', () => {
  it('records the finish time, stage and outcome together', async () => {
    installInterview();

    const response = await post({
      stageId: 'finish-ineligible',
      outcome: 'ineligible',
    });

    expect(response.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: 'interview-1' },
      data: {
        finishTime: expect.any(Date),
        finishStageId: 'finish-ineligible',
        finishOutcome: 'ineligible',
      },
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
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it.each([
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
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  // A tab opened before an upgrade keeps running the previous bundle, whose
  // finish is a POST with no body at all.
  const postWithoutBody = () =>
    POST(
      new NextRequest('http://localhost/api/interviews/interview-1/finish', {
        method: 'POST',
      }),
      { params: Promise.resolve({ interviewId: 'interview-1' }) },
    );

  it('records the previous bundle’s bodyless finish at the protocol’s finish stage', async () => {
    findUniqueMock.mockImplementation((args: FindUniqueArgs) =>
      Promise.resolve(
        args.include
          ? FINISHED_ROW
          : {
              finishTime: null,
              protocolId: 'protocol-1',
              protocol: {
                ...STORED_PROTOCOL,
                stages: STAGES.filter(
                  (stage) => stage.id !== 'finish-ineligible',
                ),
              },
            },
      ),
    );

    const response = await postWithoutBody();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, applied: true });
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: 'interview-1' },
      data: {
        finishTime: expect.any(Date),
        finishStageId: 'finish-completed',
        finishOutcome: 'completed',
      },
    });
  });

  it('refuses a bodyless finish when the protocol does not have exactly one finish stage', async () => {
    installInterview();

    const response = await postWithoutBody();

    expect(response.status).toBe(400);
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(cookieSetMock).not.toHaveBeenCalled();
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
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it('answers 404 for an interview id that does not exist', async () => {
    findUniqueMock.mockResolvedValue(null);

    const response = await post({
      stageId: 'finish-completed',
      outcome: 'completed',
    });

    expect(response.status).toBe(404);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('keeps a frozen interview’s recorded finish', async () => {
    installInterview(new Date('2026-01-01T00:00:00.000Z'));
    freezeOnCompletion();

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
    expect(updateManyMock).not.toHaveBeenCalled();
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
    expect(updateManyMock).toHaveBeenCalledWith(
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
    updateManyMock.mockRejectedValue(new Error('database unavailable'));

    const response = await post({
      stageId: 'finish-completed',
      outcome: 'completed',
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to finish interview',
    });
  });

  it('makes the freeze part of the write when interviews freeze on completion', async () => {
    freezeOnCompletion();
    installInterview();

    const response = await post({
      stageId: 'finish-completed',
      outcome: 'completed',
    });

    expect(await response.json()).toEqual({ success: true, applied: true });
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'interview-1', finishTime: null },
      }),
    );
  });

  it('keeps the first of two overlapping finishes, and reports only that one as a completion', async () => {
    freezeOnCompletion();
    // Both requests read the interview unfinished; the database lets only the
    // first write match the unfinished row.
    installInterview(null, {
      ...FINISHED_ROW,
      finishTime: new Date('2026-01-01T00:00:00.000Z'),
    });
    updateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const body = { stageId: 'finish-completed', outcome: 'completed' };

    const [first, second] = await Promise.all([post(body), post(body)]);

    expect(await first.json()).toEqual({ success: true, applied: true });
    expect(await second.json()).toEqual({
      success: true,
      applied: false,
      frozen: true,
    });
    expect(addEventMock).toHaveBeenCalledTimes(1);
    // The browser that lost the race is still sent to the finished interview.
    expect(cookieSetMock).toHaveBeenCalledTimes(2);
  });

  it('answers 404 when the interview is deleted before the write', async () => {
    freezeOnCompletion();
    installInterview(null, null);
    updateManyMock.mockResolvedValue({ count: 0 });

    const response = await post({
      stageId: 'finish-completed',
      outcome: 'completed',
    });

    expect(response.status).toBe(404);
    expect(addEventMock).not.toHaveBeenCalled();
  });
});
