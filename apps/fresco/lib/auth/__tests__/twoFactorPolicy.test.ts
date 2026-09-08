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

const { mockKeyFindFirst, mockTotpFindFirst, mockGetAppSetting } = vi.hoisted(
  () => ({
    mockKeyFindFirst: vi.fn(),
    mockTotpFindFirst: vi.fn(),
    mockGetAppSetting: vi.fn(),
  }),
);

vi.mock('~/lib/db', () => ({
  prisma: {
    key: { findFirst: mockKeyFindFirst },
    totpCredential: { findFirst: mockTotpFindFirst },
  },
}));

vi.mock('~/queries/appSettings', () => ({
  getAppSetting: mockGetAppSetting,
}));

import { getTwoFactorStatus, requiresTwoFactorSetup } from '../twoFactorPolicy';

const USER_ID = 'user-1';

const passwordAccount = () =>
  mockKeyFindFirst.mockResolvedValue({ hashed_password: '$scrypt$hashed' });
const passkeyAccount = () =>
  mockKeyFindFirst.mockResolvedValue({ hashed_password: null });
const withAuthenticator = () =>
  mockTotpFindFirst.mockResolvedValue({ id: 'totp-1' });
const withoutAuthenticator = () => mockTotpFindFirst.mockResolvedValue(null);

describe('getTwoFactorStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('holds a password account with no authenticator while the installation requires two-factor', async () => {
    mockGetAppSetting.mockResolvedValue(true);
    passwordAccount();
    withoutAuthenticator();

    await expect(requiresTwoFactorSetup(USER_ID)).resolves.toBe(true);
    expect(mockGetAppSetting).toHaveBeenCalledWith('requireTwoFactor');
  });

  it('lets the same account through once the setting is off', async () => {
    mockGetAppSetting.mockResolvedValue(false);
    passwordAccount();
    withoutAuthenticator();

    await expect(requiresTwoFactorSetup(USER_ID)).resolves.toBe(false);
  });

  it('is satisfied by a verified authenticator', async () => {
    mockGetAppSetting.mockResolvedValue(true);
    passwordAccount();
    withAuthenticator();

    await expect(requiresTwoFactorSetup(USER_ID)).resolves.toBe(false);
  });

  it('exempts a passkey-mode account', async () => {
    mockGetAppSetting.mockResolvedValue(true);
    passkeyAccount();
    withoutAuthenticator();

    await expect(requiresTwoFactorSetup(USER_ID)).resolves.toBe(false);
  });
});
