import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & { cache?: unknown }
  >();
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  };
});

const {
  mockCookieGet,
  mockSessionFindUnique,
  mockSessionDelete,
  mockRedirect,
  mockRequiresTwoFactorSetup,
} = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockSessionFindUnique: vi.fn(),
  mockSessionDelete: vi.fn(),
  mockRedirect: vi.fn(),
  mockRequiresTwoFactorSetup: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('~/lib/db', () => ({
  prisma: {
    session: {
      findUnique: mockSessionFindUnique,
      delete: mockSessionDelete,
    },
  },
}));

vi.mock('~/lib/auth/twoFactorPolicy', () => ({
  requiresTwoFactorSetup: mockRequiresTwoFactorSetup,
}));

import { requireApiAuth, requirePageAuth } from '../guards';
import { TWO_FACTOR_SETUP_PATH } from '../paths';

const USER_ID = 'user-1';

const liveSession = {
  id: 'session-1',
  user_id: USER_ID,
  active_expires: BigInt(Date.now() + 60_000),
  idle_expires: BigInt(Date.now() + 60_000),
  user: { id: USER_ID, username: 'alice', locale: null },
};

const expectedSession = {
  sessionId: 'session-1',
  user: { userId: USER_ID, username: 'alice', locale: null },
};

const signedIn = () => {
  mockCookieGet.mockReturnValue({ value: 'session-1' });
  mockSessionFindUnique.mockResolvedValue(liveSession);
};

const signedOut = () => {
  mockCookieGet.mockReturnValue(undefined);
};

beforeEach(() => {
  vi.clearAllMocks();
  // Next's redirect never returns; a guard that keeps going after calling it
  // would be a bug this mock must expose rather than hide.
  mockRedirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe('requirePageAuth', () => {
  it('sends a visitor with no session to sign in', async () => {
    signedOut();

    await expect(requirePageAuth()).rejects.toThrow('NEXT_REDIRECT:/signin');
    expect(mockRequiresTwoFactorSetup).not.toHaveBeenCalled();
  });

  it('sends an account held at the two-factor gate to setup instead of the page', async () => {
    signedIn();
    mockRequiresTwoFactorSetup.mockResolvedValue(true);

    await expect(requirePageAuth()).rejects.toThrow(
      `NEXT_REDIRECT:${TWO_FACTOR_SETUP_PATH}`,
    );
    expect(mockRequiresTwoFactorSetup).toHaveBeenCalledWith(USER_ID);
  });

  it('returns the session once the gate is lifted', async () => {
    signedIn();
    mockRequiresTwoFactorSetup.mockResolvedValue(false);

    await expect(requirePageAuth()).resolves.toEqual(expectedSession);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe('requireApiAuth', () => {
  it('rejects a caller with no session', async () => {
    signedOut();

    await expect(requireApiAuth()).rejects.toThrow('Unauthorized');
  });

  it('refuses an account held at the two-factor gate', async () => {
    signedIn();
    mockRequiresTwoFactorSetup.mockResolvedValue(true);

    await expect(requireApiAuth()).rejects.toThrow(
      'Two-factor authentication setup required',
    );
  });

  it('admits a gated account only when the caller opts in for setup', async () => {
    signedIn();
    mockRequiresTwoFactorSetup.mockResolvedValue(true);

    await expect(
      requireApiAuth({ allowPendingTwoFactorSetup: true }),
    ).resolves.toEqual(expectedSession);
  });

  it('never admits a visitor with no session, even for setup', async () => {
    signedOut();

    await expect(
      requireApiAuth({ allowPendingTwoFactorSetup: true }),
    ).rejects.toThrow('Unauthorized');
  });

  it('returns the session once the gate is lifted', async () => {
    signedIn();
    mockRequiresTwoFactorSetup.mockResolvedValue(false);

    await expect(requireApiAuth()).resolves.toEqual(expectedSession);
  });
});
