import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUniqueMock, getAppSettingMock, updateManyMock } = vi.hoisted(
  () => ({
    findUniqueMock: vi.fn(),
    getAppSettingMock: vi.fn(),
    updateManyMock: vi.fn(),
  }),
);

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, after: vi.fn() };
});

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

vi.mock('~/lib/posthog-server', () => ({
  captureException: vi.fn(),
  flushPostHog: vi.fn(),
}));

import { POST } from '../route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/interview/interview-1/locale', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function post(body: unknown) {
  return POST(makeRequest(body), {
    params: Promise.resolve({ interviewId: 'interview-1' }),
  });
}

// The time the interview was last worked on, long before it is opened again.
const LAST_UPDATED = new Date('2025-06-01T12:00:00.000Z');

const freezeOnCompletion = () =>
  getAppSettingMock.mockImplementation((key: string) =>
    Promise.resolve(key === 'freezeInterviewsAfterCompletion'),
  );

function installInterview(finishTime: Date | null = null) {
  findUniqueMock.mockResolvedValue({
    finishTime,
    lastUpdated: LAST_UPDATED,
    protocol: {
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppSettingMock.mockResolvedValue(false);
  updateManyMock.mockResolvedValue({ count: 1 });
});

describe('interview locale route', () => {
  it('writes both locale fields to the interview', async () => {
    installInterview();

    const response = await post({ locale: 'fr', localePreference: 'fr' });

    expect(response.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: 'interview-1', lastUpdated: LAST_UPDATED },
      data: { locale: 'fr', localePreference: 'fr', lastUpdated: LAST_UPDATED },
    });
  });

  it('writes a null preference when the participant has not chosen one', async () => {
    installInterview();

    const response = await post({ locale: 'en', localePreference: null });

    expect(response.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: 'interview-1', lastUpdated: LAST_UPDATED },
      data: { locale: 'en', localePreference: null, lastUpdated: LAST_UPDATED },
    });
  });

  it.each([
    ['locale', { locale: 'de', localePreference: null }],
    ['preference', { locale: 'en', localePreference: 'de' }],
  ])('refuses a %s the protocol does not declare', async (_field, change) => {
    installInterview();

    const response = await post(change);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid request body' });
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it.each([
    ['unparseable JSON', '{'],
    ['a missing locale', { localePreference: null }],
    ['a missing preference', { locale: 'en' }],
  ])('refuses %s without touching the row', async (_case, body) => {
    installInterview();

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid request body' });
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('answers 404 for an interview id that does not exist', async () => {
    findUniqueMock.mockResolvedValue(null);

    const response = await post({ locale: 'en', localePreference: null });

    expect(response.status).toBe(404);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('leaves a finished interview untouched when interviews freeze on completion', async () => {
    freezeOnCompletion();
    installInterview(new Date('2026-01-01T00:00:00.000Z'));

    const response = await post({ locale: 'fr', localePreference: 'fr' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      applied: false,
      frozen: true,
    });
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('still writes to a finished interview when interviews do not freeze', async () => {
    installInterview(new Date('2026-01-01T00:00:00.000Z'));

    const response = await post({ locale: 'fr', localePreference: 'fr' });

    expect(response.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the time the interview was last worked on', async () => {
    installInterview();

    await post({ locale: 'fr', localePreference: 'fr' });

    // `@updatedAt` advances the column on every write that does not set it,
    // so the write must set it to the value it already holds.
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastUpdated: LAST_UPDATED }),
      }),
    );
  });

  it('retries against the time left by a sync that landed after the read, rather than winding it back', async () => {
    installInterview();
    const synced = new Date('2026-03-01T09:30:00.000Z');
    updateManyMock
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    findUniqueMock.mockResolvedValueOnce({
      finishTime: null,
      lastUpdated: LAST_UPDATED,
      protocol: {
        localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
      },
    });
    findUniqueMock.mockResolvedValueOnce({
      finishTime: null,
      lastUpdated: synced,
    });

    const response = await post({ locale: 'fr', localePreference: 'fr' });

    expect(await response.json()).toEqual({ success: true, applied: true });
    expect(updateManyMock).toHaveBeenCalledTimes(2);
    expect(updateManyMock).toHaveBeenLastCalledWith({
      where: { id: 'interview-1', lastUpdated: synced },
      data: { locale: 'fr', localePreference: 'fr', lastUpdated: synced },
    });
  });

  it('makes the freeze part of the write when interviews freeze on completion', async () => {
    freezeOnCompletion();
    installInterview();

    await post({ locale: 'fr', localePreference: 'fr' });

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'interview-1',
          lastUpdated: LAST_UPDATED,
          finishTime: null,
        },
      }),
    );
  });

  it('reports an interview finished between the read and the write as frozen', async () => {
    freezeOnCompletion();
    findUniqueMock
      .mockResolvedValueOnce({
        finishTime: null,
        lastUpdated: LAST_UPDATED,
        protocol: {
          localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
        },
      })
      .mockResolvedValueOnce({
        finishTime: new Date('2026-01-01T00:00:00.000Z'),
        lastUpdated: LAST_UPDATED,
      });
    updateManyMock.mockResolvedValue({ count: 0 });

    const response = await post({ locale: 'fr', localePreference: 'fr' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      applied: false,
      frozen: true,
    });
    expect(updateManyMock).toHaveBeenCalledTimes(1);
  });

  it('answers 404 when the interview is deleted between the read and the write', async () => {
    installInterview();
    findUniqueMock
      .mockResolvedValueOnce({
        finishTime: null,
        lastUpdated: LAST_UPDATED,
        protocol: {
          localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
        },
      })
      .mockResolvedValueOnce(null);
    updateManyMock.mockResolvedValue({ count: 0 });

    const response = await post({ locale: 'fr', localePreference: 'fr' });

    expect(response.status).toBe(404);
  });
});
