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

const { mockEnv, mockKeyFindFirst, mockTotpFindFirst, mockIsAppConfigured } =
  vi.hoisted(() => ({
    mockEnv: { REQUIRE_TWO_FACTOR: undefined as boolean | undefined },
    mockKeyFindFirst: vi.fn(),
    mockTotpFindFirst: vi.fn(),
    mockIsAppConfigured: vi.fn(),
  }));

vi.mock('~/env', () => ({ env: mockEnv }));

vi.mock('~/lib/db', () => ({
  prisma: {
    key: { findFirst: mockKeyFindFirst },
    totpCredential: { findFirst: mockTotpFindFirst },
  },
}));

vi.mock('~/queries/appSettings', () => ({
  isAppConfigured: mockIsAppConfigured,
}));

import {
  getTwoFactorStatus,
  isTwoFactorRequired,
  requiresTwoFactorSetup,
} from '../twoFactorPolicy';

const USER_ID = 'user-1';

const passwordAccount = () =>
  mockKeyFindFirst.mockResolvedValue({ hashed_password: '$scrypt$hashed' });
const passkeyAccount = () =>
  mockKeyFindFirst.mockResolvedValue({ hashed_password: null });
const withAuthenticator = () =>
  mockTotpFindFirst.mockResolvedValue({ id: 'totp-1' });
const withoutAuthenticator = () => mockTotpFindFirst.mockResolvedValue(null);

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.REQUIRE_TWO_FACTOR = undefined;
  mockIsAppConfigured.mockResolvedValue(true);
});

describe('isTwoFactorRequired', () => {
  it('is off unless REQUIRE_TWO_FACTOR is set to true', () => {
    expect(isTwoFactorRequired()).toBe(false);
    mockEnv.REQUIRE_TWO_FACTOR = false;
    expect(isTwoFactorRequired()).toBe(false);
    mockEnv.REQUIRE_TWO_FACTOR = true;
    expect(isTwoFactorRequired()).toBe(true);
  });
});

describe('getTwoFactorStatus', () => {
  it('reports a password account with a verified authenticator', async () => {
    passwordAccount();
    withAuthenticator();

    await expect(getTwoFactorStatus(USER_ID)).resolves.toEqual({
      passwordMode: true,
      totpEnabled: true,
    });
  });

  it('counts only a verified authenticator, never a setup that was abandoned', async () => {
    passwordAccount();
    withoutAuthenticator();

    await getTwoFactorStatus(USER_ID);

    expect(mockTotpFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: USER_ID, verified: true },
      }),
    );
  });

  it('reports an account with no password as passkey mode', async () => {
    passkeyAccount();
    withoutAuthenticator();

    await expect(getTwoFactorStatus(USER_ID)).resolves.toEqual({
      passwordMode: false,
      totpEnabled: false,
    });
  });
});

describe('requiresTwoFactorSetup', () => {
  it('holds a password account with no authenticator while the installation requires two-factor', async () => {
    mockEnv.REQUIRE_TWO_FACTOR = true;
    passwordAccount();
    withoutAuthenticator();

    await expect(requiresTwoFactorSetup(USER_ID)).resolves.toBe(true);
  });

  it('lets the same account through when the variable is not set', async () => {
    passwordAccount();
    withoutAuthenticator();

    await expect(requiresTwoFactorSetup(USER_ID)).resolves.toBe(false);
    expect(mockKeyFindFirst).not.toHaveBeenCalled();
  });

  it('waits until setup is complete, so the setup wizard can finish under the first session', async () => {
    mockEnv.REQUIRE_TWO_FACTOR = true;
    mockIsAppConfigured.mockResolvedValue(false);
    passwordAccount();
    withoutAuthenticator();

    await expect(requiresTwoFactorSetup(USER_ID)).resolves.toBe(false);
    expect(mockKeyFindFirst).not.toHaveBeenCalled();
  });

  it('is satisfied by a verified authenticator', async () => {
    mockEnv.REQUIRE_TWO_FACTOR = true;
    passwordAccount();
    withAuthenticator();

    await expect(requiresTwoFactorSetup(USER_ID)).resolves.toBe(false);
  });

  it('exempts a passkey-mode account', async () => {
    mockEnv.REQUIRE_TWO_FACTOR = true;
    passkeyAccount();
    withoutAuthenticator();

    await expect(requiresTwoFactorSetup(USER_ID)).resolves.toBe(false);
  });
});
