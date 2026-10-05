import { beforeEach, describe, expect, it, vi } from 'vitest';

import { commonMessages } from '@codaco/app-i18n/common';

const request = vi.hoisted(() => ({
  session: vi.fn(),
  cookie: vi.fn(),
  header: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('~/lib/auth/guards', () => ({ getServerSession: request.session }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: request.cookie }),
  headers: async () => ({ get: request.header }),
}));

import { getFrescoI18nInitialization, getServerIntl } from '~/i18n/server';

beforeEach(() => {
  vi.clearAllMocks();
  request.session.mockResolvedValue(null);
  request.cookie.mockReturnValue(undefined);
  request.header.mockReturnValue('es-MX;q=0.4, en-GB;q=0.9');
});

describe('Fresco server request initialization', () => {
  it('uses the shared quality-weighted browser negotiation before serialization', async () => {
    expect(await getFrescoI18nInitialization()).toMatchObject({
      locale: 'en-GB',
      preference: null,
      userId: null,
      requested: ['en-GB', 'es-MX'],
    });
  });

  it('keeps each request and account formatter isolated, including Automatic', async () => {
    request.cookie.mockReturnValue({ value: 'en-GB' });
    request.session.mockResolvedValue({
      user: { userId: 'alice', locale: 'es' },
    });
    const alice = await getServerIntl();
    expect(alice.locale).toBe('es');
    expect(alice.formatMessage(commonMessages.cancel)).toBe('Cancelar');

    request.session.mockResolvedValue({
      user: { userId: 'bob', locale: null },
    });
    request.header.mockReturnValue('en-US, es;q=0.2');
    const bob = await getServerIntl();
    expect(bob.locale).toBe('en');
    expect(bob.formatMessage(commonMessages.cancel)).toBe('Cancel');
    expect(alice.locale).toBe('es');
    expect(alice).not.toBe(bob);
    expect(request.session).toHaveBeenCalledTimes(2);
  });

  it('uses the same deterministic timezone for server formatting', async () => {
    request.header.mockReturnValue('es');
    const intl = await getServerIntl();
    expect(intl.timeZone).toBe('UTC');
    expect(
      intl.formatDate(new Date('2026-09-05T00:30:00Z'), {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      }),
    ).toBe('5/9/2026');
  });
});
