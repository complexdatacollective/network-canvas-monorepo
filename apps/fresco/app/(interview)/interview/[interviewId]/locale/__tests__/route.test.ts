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

function installInterview(finishTime: Date | null = null) {
  findUniqueMock.mockResolvedValue({
    finishTime,
    protocol: {
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppSettingMock.mockResolvedValue(false);
  updateMock.mockResolvedValue({});
});

describe('interview locale route', () => {
  it('writes both locale fields to the interview', async () => {
    installInterview();

    const response = await post({ locale: 'fr', localePreference: 'fr' });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'interview-1' },
      data: { locale: 'fr', localePreference: 'fr' },
    });
  });

  it('writes a null preference when the participant has not chosen one', async () => {
    installInterview();

    const response = await post({ locale: 'en', localePreference: null });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'interview-1' },
      data: { locale: 'en', localePreference: null },
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
    expect(updateMock).not.toHaveBeenCalled();
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
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('answers 404 for an interview id that does not exist', async () => {
    findUniqueMock.mockResolvedValue(null);

    const response = await post({ locale: 'en', localePreference: null });

    expect(response.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('leaves a finished interview untouched when interviews freeze on completion', async () => {
    getAppSettingMock.mockImplementation((key: string) =>
      Promise.resolve(key === 'freezeInterviewsAfterCompletion'),
    );
    installInterview(new Date('2026-01-01T00:00:00.000Z'));

    const response = await post({ locale: 'fr', localePreference: 'fr' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      applied: false,
      frozen: true,
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('still writes to a finished interview when interviews do not freeze', async () => {
    installInterview(new Date('2026-01-01T00:00:00.000Z'));

    const response = await post({ locale: 'fr', localePreference: 'fr' });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
