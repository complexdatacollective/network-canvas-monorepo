import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatActionError } from './formatActionError';

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    after: vi.fn(),
  };
});

const {
  mockRequireApiAuth,
  mockGetTwoFactorStatus,
  mockAppSettingsUpsert,
  mockAddEvent,
  mockSafeUpdateTag,
} = vi.hoisted(() => ({
  mockRequireApiAuth: vi.fn(),
  mockGetTwoFactorStatus: vi.fn(),
  mockAppSettingsUpsert: vi.fn(),
  mockAddEvent: vi.fn(),
  mockSafeUpdateTag: vi.fn(),
}));

vi.mock('~/lib/auth/guards', () => ({
  requireApiAuth: mockRequireApiAuth,
}));

vi.mock('~/lib/auth/twoFactorPolicy', () => ({
  getTwoFactorStatus: mockGetTwoFactorStatus,
}));

vi.mock('~/lib/db', () => ({
  prisma: {
    appSettings: { upsert: mockAppSettingsUpsert },
  },
}));

vi.mock('~/lib/cache', () => ({
  safeUpdateTag: mockSafeUpdateTag,
  safeRevalidateTag: vi.fn(),
  safeCacheTag: vi.fn(),
}));

vi.mock('~/lib/activityFeed', () => ({
  addEvent: mockAddEvent,
}));

vi.mock('~/lib/posthog-server', () => ({
  captureEvent: vi.fn(),
  captureException: vi.fn(),
  flushPostHog: vi.fn(),
}));

vi.mock('~/lib/storage/config', () => ({
  getStorageEnvStatus: () => ({
    pinnedProvider: null,
    s3EnvManaged: false,
    uploadThingEnvManaged: false,
  }),
}));

vi.mock('~/queries/appSettings', () => ({
  getInstallationId: vi.fn(),
}));

import { setAppSetting, setRequireTwoFactor } from '../appSettings';

const session = {
  sessionId: 'session-1',
  user: { userId: 'user-1', username: 'alice', locale: null },
};

const SET_UP_YOUR_OWN_FIRST =
  'Set up two-factor authentication for your own account before requiring it for everyone.';

describe('setRequireTwoFactor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiAuth.mockResolvedValue(session);
    mockAppSettingsUpsert.mockResolvedValue({});
    mockAddEvent.mockResolvedValue({ success: true, error: null });
  });

  it('refuses to require two-factor while the caller’s own password account has none', async () => {
    mockGetTwoFactorStatus.mockResolvedValue({
      passwordMode: true,
      totpEnabled: false,
    });

    const result = await setRequireTwoFactor(true);

    expect(formatActionError(result.error)).toBe(SET_UP_YOUR_OWN_FIRST);
    expect(result.data).toBeNull();
    expect(mockGetTwoFactorStatus).toHaveBeenCalledWith('user-1');
    expect(mockAppSettingsUpsert).not.toHaveBeenCalled();
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it('requires two-factor once the caller has an authenticator, and records the change', async () => {
    mockGetTwoFactorStatus.mockResolvedValue({
      passwordMode: true,
      totpEnabled: true,
    });

    const result = await setRequireTwoFactor(true);

    expect(result).toEqual({ error: null, data: { enabled: true } });
    expect(mockAppSettingsUpsert).toHaveBeenCalledWith({
      where: { key: 'requireTwoFactor' },
      create: { key: 'requireTwoFactor', value: 'true' },
      update: { value: 'true' },
    });
    expect(mockSafeUpdateTag).toHaveBeenCalledWith(
      'appSettings-requireTwoFactor',
    );
    expect(mockAddEvent).toHaveBeenCalledWith(
      'Setting Changed',
      '"alice" changed "requireTwoFactor" to "true"',
      {
        kind: 'settingChanged',
        values: {
          username: 'alice',
          setting: 'requireTwoFactor',
          value: 'true',
        },
      },
    );
  });

  it('lets a passkey-mode caller require it, since passkey accounts are exempt', async () => {
    mockGetTwoFactorStatus.mockResolvedValue({
      passwordMode: false,
      totpEnabled: false,
    });

    const result = await setRequireTwoFactor(true);

    expect(result).toEqual({ error: null, data: { enabled: true } });
    expect(mockAppSettingsUpsert).toHaveBeenCalledTimes(1);
  });

  it('lifts the requirement without judging the caller’s own account', async () => {
    const result = await setRequireTwoFactor(false);

    expect(result).toEqual({ error: null, data: { enabled: false } });
    expect(mockGetTwoFactorStatus).not.toHaveBeenCalled();
    expect(mockAppSettingsUpsert).toHaveBeenCalledWith({
      where: { key: 'requireTwoFactor' },
      create: { key: 'requireTwoFactor', value: 'false' },
      update: { value: 'false' },
    });
    expect(mockAddEvent).toHaveBeenCalledWith(
      'Setting Changed',
      '"alice" changed "requireTwoFactor" to "false"',
      expect.objectContaining({ kind: 'settingChanged' }),
    );
  });

  it('rejects anything that is not on or off', async () => {
    const result = await setRequireTwoFactor('true');

    expect(formatActionError(result.error)).toBe(
      'Invalid value for the two-factor requirement.',
    );
    expect(mockAppSettingsUpsert).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    mockRequireApiAuth.mockRejectedValue(new Error('Unauthorized'));

    await expect(setRequireTwoFactor(true)).rejects.toThrow('Unauthorized');
    expect(mockAppSettingsUpsert).not.toHaveBeenCalled();
  });
});

describe('setAppSetting with the requireTwoFactor key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiAuth.mockResolvedValue(session);
    mockAppSettingsUpsert.mockResolvedValue({});
    mockAddEvent.mockResolvedValue({ success: true, error: null });
    mockGetTwoFactorStatus.mockResolvedValue({
      passwordMode: true,
      totpEnabled: false,
    });
  });

  // `setAppSetting` is an exported Server Action, so this is the path a
  // caller takes to skip `setRequireTwoFactor`; the precondition has to hold
  // here as well.
  it('refuses to require two-factor when called directly by a caller without it', async () => {
    await expect(setAppSetting('requireTwoFactor', true)).rejects.toThrow();

    expect(mockGetTwoFactorStatus).toHaveBeenCalledWith('user-1');
    expect(mockAppSettingsUpsert).not.toHaveBeenCalled();
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it('judges the serialised form of the value, not only a boolean', async () => {
    // A direct Server Action call is untyped; the string form is what the
    // schema accepts and stores.
    const asSentOverTheWire = 'true' as unknown as boolean;

    await expect(
      setAppSetting('requireTwoFactor', asSentOverTheWire),
    ).rejects.toThrow();

    expect(mockAppSettingsUpsert).not.toHaveBeenCalled();
  });

  it('writes it once the caller complies', async () => {
    mockGetTwoFactorStatus.mockResolvedValue({
      passwordMode: true,
      totpEnabled: true,
    });

    await expect(setAppSetting('requireTwoFactor', true)).resolves.toBe(true);

    expect(mockAppSettingsUpsert).toHaveBeenCalledTimes(1);
  });

  it('lifts it without judging the caller', async () => {
    await expect(setAppSetting('requireTwoFactor', false)).resolves.toBe(false);

    expect(mockGetTwoFactorStatus).not.toHaveBeenCalled();
    expect(mockAppSettingsUpsert).toHaveBeenCalledTimes(1);
  });

  it('leaves every other setting alone', async () => {
    await expect(setAppSetting('disableAnalytics', true)).resolves.toBe(true);

    expect(mockGetTwoFactorStatus).not.toHaveBeenCalled();
    expect(mockAppSettingsUpsert).toHaveBeenCalledTimes(1);
  });
});
