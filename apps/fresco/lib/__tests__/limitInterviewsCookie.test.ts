import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieSetMock, env } = vi.hoisted(() => ({
  cookieSetMock: vi.fn(),
  env: {
    NODE_ENV: 'production' as string,
    COOKIE_SECURE: undefined as boolean | string | undefined,
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ set: cookieSetMock })),
}));
vi.mock('~/env', () => ({ env }));
vi.mock('~/lib/db', () => ({ prisma: {} }));

import { setLimitInterviewsCookie } from '../limitInterviewsCookie';

const securedAs = async () => {
  await setLimitInterviewsCookie('protocol-1', 'interview-1');
  const options = cookieSetMock.mock.lastCall?.[2] as
    | { secure?: boolean; httpOnly?: boolean }
    | undefined;
  return options;
};

describe('the limit-interviews cookie', () => {
  beforeEach(() => {
    cookieSetMock.mockClear();
    env.NODE_ENV = 'production';
    env.COOKIE_SECURE = undefined;
  });

  // It holds the finished interview's id, which opens that interview, so it is
  // kept off plain HTTP as the session cookie is.
  it('is Secure and unreadable by script in production', async () => {
    expect(await securedAs()).toMatchObject({ secure: true, httpOnly: true });
    expect(cookieSetMock).toHaveBeenCalledWith(
      'protocol-1',
      'interview-1',
      expect.anything(),
    );
  });

  it('is not Secure outside production', async () => {
    env.NODE_ENV = 'development';
    expect(await securedAs()).toMatchObject({ secure: false });
  });

  it.each([
    ['false', 'production', false],
    [false, 'production', false],
    ['true', 'development', true],
    [true, 'development', true],
  ] as const)(
    'follows COOKIE_SECURE=%s over NODE_ENV=%s',
    async (cookieSecure, nodeEnv, secure) => {
      env.COOKIE_SECURE = cookieSecure;
      env.NODE_ENV = nodeEnv;
      expect(await securedAs()).toMatchObject({ secure });
    },
  );
});
