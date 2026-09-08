import { formatActionError } from './formatActionError';
vi.mock('~/i18n/server', async () => {
  const { createAppIntl } = await import('@codaco/app-i18n/messages');
  return { getServerIntl: async () => createAppIntl({ locale: 'en' }) };
});

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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => ({
    get: vi.fn(),
  })),
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
  mockPrismaTotpCredentialUpsert,
  mockPrismaTotpCredentialFindUnique,
  mockPrismaTotpCredentialDelete,
  mockPrismaTotpCredentialDeleteMany,
  mockPrismaRecoveryCodeCreateMany,
  mockPrismaRecoveryCodeDeleteMany,
  mockPrismaUserFindUnique,
  mockPrismaTransaction,
  mockSafeUpdateTag,
  mockRequireApiAuth,
  mockGenerateTotpSecret,
  mockGenerateTotpUri,
  mockGenerateQrCodeDataUrl,
  mockVerifyTotpCode,
  mockGenerateRecoveryCodes,
  mockHashRecoveryCode,
  mockSealTotpSecret,
  mockVerifyStoredTotpCode,
  mockAddEvent,
  mockVerifyTotpSetupSchemaSafeParse,
  mockDisableTotpSchemaSafeParse,
} = vi.hoisted(() => ({
  mockPrismaTotpCredentialUpsert: vi.fn(),
  mockPrismaTotpCredentialFindUnique: vi.fn(),
  mockPrismaTotpCredentialDelete: vi.fn(),
  mockPrismaTotpCredentialDeleteMany: vi.fn(),
  mockPrismaRecoveryCodeCreateMany: vi.fn(),
  mockPrismaRecoveryCodeDeleteMany: vi.fn(),
  mockPrismaUserFindUnique: vi.fn(),
  mockPrismaTransaction: vi.fn(),
  mockSafeUpdateTag: vi.fn(),
  mockRequireApiAuth: vi.fn(),
  mockGenerateTotpSecret: vi.fn(),
  mockGenerateTotpUri: vi.fn(),
  mockGenerateQrCodeDataUrl: vi.fn(),
  mockVerifyTotpCode: vi.fn(),
  mockGenerateRecoveryCodes: vi.fn(),
  mockHashRecoveryCode: vi.fn(),
  mockSealTotpSecret: vi.fn(),
  mockVerifyStoredTotpCode: vi.fn(),
  mockAddEvent: vi.fn(),
  mockVerifyTotpSetupSchemaSafeParse: vi.fn(),
  mockDisableTotpSchemaSafeParse: vi.fn(),
}));

vi.mock('~/lib/db', () => ({
  prisma: {
    totpCredential: {
      upsert: mockPrismaTotpCredentialUpsert,
      findUnique: mockPrismaTotpCredentialFindUnique,
      update: vi.fn().mockResolvedValue({}),
      delete: mockPrismaTotpCredentialDelete,
      deleteMany: mockPrismaTotpCredentialDeleteMany,
    },
    recoveryCode: {
      createMany: mockPrismaRecoveryCodeCreateMany,
      deleteMany: mockPrismaRecoveryCodeDeleteMany,
    },
    user: {
      findUnique: mockPrismaUserFindUnique,
    },
    $transaction: mockPrismaTransaction,
  },
}));

vi.mock('~/lib/cache', () => ({
  safeUpdateTag: mockSafeUpdateTag,
  safeRevalidateTag: vi.fn(),
  safeCacheTag: vi.fn(),
}));

vi.mock('~/lib/rateLimit', () => ({
  checkRateLimit: vi.fn(),
  recordLoginAttempt: vi.fn(),
}));

vi.mock('~/lib/auth/session', () => ({
  createSessionCookie: vi.fn(),
}));

vi.mock('~/lib/auth/totp', () => ({
  generateTotpSecret: mockGenerateTotpSecret,
  generateTotpUri: mockGenerateTotpUri,
  generateQrCodeDataUrl: mockGenerateQrCodeDataUrl,
  verifyTotpCode: mockVerifyTotpCode,
  generateRecoveryCodes: mockGenerateRecoveryCodes,
  hashRecoveryCode: mockHashRecoveryCode,
  sealTotpSecret: mockSealTotpSecret,
  verifyStoredTotpCode: mockVerifyStoredTotpCode,
  createTwoFactorToken: vi.fn(),
  verifyTwoFactorToken: vi.fn(),
}));

vi.mock('~/lib/auth/guards', () => ({
  requireApiAuth: mockRequireApiAuth,
  requirePageAuth: vi.fn().mockResolvedValue(undefined),
  getServerSession: vi.fn(),
}));

vi.mock('~/utils/getBaseUrl', () => ({
  getBaseUrl: () => 'https://fresco.example.com',
}));

vi.mock('~/utils/getClientIp', () => ({
  getClientIp: vi.fn().mockResolvedValue('127.0.0.1'),
}));

vi.mock('~/utils/password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('~/lib/activityFeed', () => ({
  addEvent: mockAddEvent,
}));

vi.mock('~/schemas/totp', () => ({
  createTotpSchemas: () => ({
    verifyTotpSetupSchema: {
      safeParse: mockVerifyTotpSetupSchemaSafeParse,
    },
    disableTotpSchema: {
      safeParse: mockDisableTotpSchemaSafeParse,
    },
    verifyTwoFactorSchema: {
      safeParse: vi.fn(),
    },
  }),
}));

import {
  disableTotp,
  enableTotp,
  regenerateRecoveryCodes,
  resetTotpForUser,
  verifyTotpSetup,
} from '../totp';

const CURRENT_USER_ID = 'user-current-1';
const CURRENT_USERNAME = 'currentuser';
const TOTP_SECRET = 'BASE32SECRET';
// What the database holds for TOTP_SECRET: the sealed envelope, never the seed.
const SEALED_SECRET = 'v1:sealed-nonce:sealed-ciphertext:sealed-tag';
const QR_CODE_DATA_URL = 'data:image/png;base64,abc123';
const TOTP_URI = 'otpauth://totp/Fresco:currentuser?secret=BASE32SECRET';
const VALID_TOTP_CODE = '123456';
const RECOVERY_CODES = [
  'aabbccddeeff001122',
  'bbccddeeff00112233',
  '112233aabbccddeeff',
];

type MockSession = {
  sessionId: string;
  user: {
    userId: string;
    username: string;
  };
};

const mockSession: MockSession = {
  sessionId: 'session-1',
  user: {
    userId: CURRENT_USER_ID,
    username: CURRENT_USERNAME,
  },
};

describe('enableTotp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiAuth.mockResolvedValue(mockSession);
    mockSealTotpSecret.mockReturnValue(SEALED_SECRET);
    mockGenerateTotpSecret.mockReturnValue(TOTP_SECRET);
    mockGenerateTotpUri.mockReturnValue(TOTP_URI);
    mockGenerateQrCodeDataUrl.mockResolvedValue(QR_CODE_DATA_URL);
    mockPrismaTotpCredentialUpsert.mockResolvedValue({});
  });

  it('creates an unverified TOTP credential and returns secret and QR code', async () => {
    const result = await enableTotp();

    expect(formatActionError(result.error)).toBeNull();
    expect(result.data).toEqual({
      secret: TOTP_SECRET,
      qrCodeDataUrl: QR_CODE_DATA_URL,
    });
    expect(mockPrismaTotpCredentialUpsert.mock.calls[0]?.[0]).toHaveProperty(
      'where.user_id',
      CURRENT_USER_ID,
    );
    expect(mockPrismaTotpCredentialUpsert.mock.calls[0]?.[0]).toHaveProperty(
      'create.user_id',
      CURRENT_USER_ID,
    );
    expect(mockPrismaTotpCredentialUpsert.mock.calls[0]?.[0]).toHaveProperty(
      'create.secret',
      SEALED_SECRET,
    );
    expect(mockPrismaTotpCredentialUpsert.mock.calls[0]?.[0]).toHaveProperty(
      'create.verified',
      false,
    );
    expect(mockPrismaTotpCredentialUpsert.mock.calls[0]?.[0]).toHaveProperty(
      'update.secret',
      SEALED_SECRET,
    );
    expect(mockPrismaTotpCredentialUpsert.mock.calls[0]?.[0]).toHaveProperty(
      'update.verified',
      false,
    );
  });

  it('generates the QR code using the TOTP URI for the current user', async () => {
    await enableTotp();

    expect(mockGenerateTotpUri).toHaveBeenCalledWith(
      TOTP_SECRET,
      CURRENT_USERNAME,
      'Fresco (fresco.example.com)',
    );
    expect(mockGenerateQrCodeDataUrl).toHaveBeenCalledWith(TOTP_URI);
  });

  it('seals the generated secret and never stores the plaintext', async () => {
    await enableTotp();

    expect(mockSealTotpSecret).toHaveBeenCalledWith(TOTP_SECRET);
    const upsertArgs = JSON.stringify(
      mockPrismaTotpCredentialUpsert.mock.calls[0]?.[0],
    );
    expect(upsertArgs).toContain(SEALED_SECRET);
    expect(upsertArgs).not.toContain(TOTP_SECRET);
  });

  it('requires authentication', async () => {
    mockRequireApiAuth.mockRejectedValue(new Error('Unauthorized'));

    await expect(enableTotp()).rejects.toThrow('Unauthorized');
  });
});

describe('verifyTotpSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiAuth.mockResolvedValue(mockSession);
    mockPrismaTransaction.mockResolvedValue([{}, {}]);
  });

  it('returns error for invalid schema data', async () => {
    mockVerifyTotpSetupSchemaSafeParse.mockReturnValue({
      success: false,
      error: { issues: [] },
    });

    const result = await verifyTotpSetup({ code: 'invalid' });

    expect(formatActionError(result.error)).toBe('Invalid code');
    expect(result.data).toBeNull();
  });

  it('returns error when no pending TOTP setup is found', async () => {
    mockVerifyTotpSetupSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: VALID_TOTP_CODE },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue(null);

    const result = await verifyTotpSetup({ code: VALID_TOTP_CODE });

    expect(formatActionError(result.error)).toBe('No pending TOTP setup found');
    expect(result.data).toBeNull();
  });

  it('returns error when credential is already verified', async () => {
    mockVerifyTotpSetupSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: VALID_TOTP_CODE },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue({
      user_id: CURRENT_USER_ID,
      secret: SEALED_SECRET,
      verified: true,
    });

    const result = await verifyTotpSetup({ code: VALID_TOTP_CODE });

    expect(formatActionError(result.error)).toBe('No pending TOTP setup found');
    expect(result.data).toBeNull();
  });

  it('returns error when verification code is incorrect', async () => {
    mockVerifyTotpSetupSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: '000000' },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue({
      user_id: CURRENT_USER_ID,
      secret: SEALED_SECRET,
      verified: false,
    });
    mockVerifyStoredTotpCode.mockReturnValue('invalid');

    const result = await verifyTotpSetup({ code: '000000' });

    expect(formatActionError(result.error)).toBe('Invalid verification code');
    expect(result.data).toBeNull();
  });

  it('explains an unreadable stored secret instead of calling the code invalid', async () => {
    mockVerifyTotpSetupSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: VALID_TOTP_CODE },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue({
      user_id: CURRENT_USER_ID,
      secret: SEALED_SECRET,
      verified: false,
    });
    mockVerifyStoredTotpCode.mockReturnValue('unreadable');

    const result = await verifyTotpSetup({ code: VALID_TOTP_CODE });

    expect(formatActionError(result.error)).toMatch(
      /cannot be read with this server's current encryption key/,
    );
    expect(result.data).toBeNull();
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });

  it('marks credential as verified and returns recovery codes on success', async () => {
    mockVerifyTotpSetupSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: VALID_TOTP_CODE },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue({
      user_id: CURRENT_USER_ID,
      secret: SEALED_SECRET,
      verified: false,
    });
    mockVerifyStoredTotpCode.mockReturnValue('valid');
    mockGenerateRecoveryCodes.mockReturnValue(RECOVERY_CODES);
    mockHashRecoveryCode.mockImplementation((code: string) => `hash-${code}`);

    const result = await verifyTotpSetup({ code: VALID_TOTP_CODE });

    expect(mockVerifyStoredTotpCode).toHaveBeenCalledWith(
      SEALED_SECRET,
      VALID_TOTP_CODE,
    );
    expect(formatActionError(result.error)).toBeNull();
    expect(result.data).toEqual({ recoveryCodes: RECOVERY_CODES });
    expect(mockPrismaTransaction).toHaveBeenCalled();
    expect(mockSafeUpdateTag).toHaveBeenCalledWith('activityFeed');
  });
});

describe('disableTotp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiAuth.mockResolvedValue(mockSession);
    mockPrismaTransaction.mockResolvedValue([{}, {}]);
  });

  it('returns error for invalid schema data', async () => {
    mockDisableTotpSchemaSafeParse.mockReturnValue({
      success: false,
      error: { issues: [] },
    });

    const result = await disableTotp({ code: 'bad' });

    expect(formatActionError(result.error)).toBe('Invalid code');
    expect(result.data).toBeNull();
  });

  it('returns error when two-factor authentication is not enabled', async () => {
    mockDisableTotpSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: VALID_TOTP_CODE },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue(null);

    const result = await disableTotp({ code: VALID_TOTP_CODE });

    expect(formatActionError(result.error)).toBe(
      'Two-factor authentication is not enabled',
    );
    expect(result.data).toBeNull();
  });

  it('returns error when credential exists but is not verified', async () => {
    mockDisableTotpSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: VALID_TOTP_CODE },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue({
      user_id: CURRENT_USER_ID,
      secret: SEALED_SECRET,
      verified: false,
    });

    const result = await disableTotp({ code: VALID_TOTP_CODE });

    expect(formatActionError(result.error)).toBe(
      'Two-factor authentication is not enabled',
    );
    expect(result.data).toBeNull();
  });

  it('returns error when TOTP code is invalid', async () => {
    mockDisableTotpSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: '000000' },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue({
      user_id: CURRENT_USER_ID,
      secret: SEALED_SECRET,
      verified: true,
    });
    mockVerifyStoredTotpCode.mockReturnValue('invalid');

    const result = await disableTotp({ code: '000000' });

    expect(formatActionError(result.error)).toBe('Invalid verification code');
    expect(result.data).toBeNull();
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });

  it('deletes credential and recovery codes and returns success', async () => {
    mockDisableTotpSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: VALID_TOTP_CODE },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue({
      user_id: CURRENT_USER_ID,
      secret: SEALED_SECRET,
      verified: true,
    });
    mockVerifyStoredTotpCode.mockReturnValue('valid');

    const result = await disableTotp({ code: VALID_TOTP_CODE });

    expect(formatActionError(result.error)).toBeNull();
    expect(result.data).toBeNull();
    expect(mockPrismaTransaction).toHaveBeenCalled();
    expect(mockSafeUpdateTag).toHaveBeenCalledWith('activityFeed');
  });
});

describe('regenerateRecoveryCodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiAuth.mockResolvedValue(mockSession);
    mockPrismaTransaction.mockResolvedValue([{}, {}]);
  });

  it('returns error for invalid schema data', async () => {
    mockVerifyTotpSetupSchemaSafeParse.mockReturnValue({
      success: false,
      error: { issues: [] },
    });

    const result = await regenerateRecoveryCodes({ code: 'bad' });

    expect(formatActionError(result.error)).toBe('Invalid code');
    expect(result.data).toBeNull();
  });

  it('returns error when two-factor authentication is not enabled', async () => {
    mockVerifyTotpSetupSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: VALID_TOTP_CODE },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue(null);

    const result = await regenerateRecoveryCodes({ code: VALID_TOTP_CODE });

    expect(formatActionError(result.error)).toBe(
      'Two-factor authentication is not enabled',
    );
    expect(result.data).toBeNull();
  });

  it('returns error when TOTP code is invalid', async () => {
    mockVerifyTotpSetupSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: '000000' },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue({
      user_id: CURRENT_USER_ID,
      secret: SEALED_SECRET,
      verified: true,
    });
    mockVerifyStoredTotpCode.mockReturnValue('invalid');

    const result = await regenerateRecoveryCodes({ code: '000000' });

    expect(formatActionError(result.error)).toBe('Invalid verification code');
    expect(result.data).toBeNull();
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });

  it('deletes old codes and creates new ones, returning the new recovery codes', async () => {
    mockVerifyTotpSetupSchemaSafeParse.mockReturnValue({
      success: true,
      data: { code: VALID_TOTP_CODE },
    });
    mockPrismaTotpCredentialFindUnique.mockResolvedValue({
      user_id: CURRENT_USER_ID,
      secret: SEALED_SECRET,
      verified: true,
    });
    mockVerifyStoredTotpCode.mockReturnValue('valid');
    mockGenerateRecoveryCodes.mockReturnValue(RECOVERY_CODES);
    mockHashRecoveryCode.mockImplementation((code: string) => `hash-${code}`);

    const result = await regenerateRecoveryCodes({ code: VALID_TOTP_CODE });

    expect(formatActionError(result.error)).toBeNull();
    expect(result.data).toEqual({ recoveryCodes: RECOVERY_CODES });
    expect(mockPrismaTransaction).toHaveBeenCalled();
    expect(mockSafeUpdateTag).toHaveBeenCalledWith('activityFeed');
  });
});

describe('resetTotpForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiAuth.mockResolvedValue(mockSession);
    mockPrismaTransaction.mockResolvedValue([{}, {}]);
    mockPrismaUserFindUnique.mockResolvedValue({
      id: 'target-user-id',
      username: 'targetuser',
    });
  });

  it('returns error when attempting to reset own two-factor authentication', async () => {
    const result = await resetTotpForUser(CURRENT_USER_ID);

    expect(formatActionError(result.error)).toBe(
      'Cannot reset your own two-factor authentication',
    );
    expect(result.data).toBeNull();
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });

  it('deletes 2FA data for target user and returns success', async () => {
    const targetUserId = 'target-user-id';

    const result = await resetTotpForUser(targetUserId);

    expect(formatActionError(result.error)).toBeNull();
    expect(result.data).toBeNull();
    expect(mockPrismaTransaction).toHaveBeenCalled();
    expect(mockSafeUpdateTag).toHaveBeenCalledWith('activityFeed');
    expect(mockSafeUpdateTag).toHaveBeenCalledWith('getUsers');
  });

  it('invalidates both activityFeed and getUsers cache tags on reset', async () => {
    const targetUserId = 'another-user-id';
    mockPrismaUserFindUnique.mockResolvedValue({
      id: targetUserId,
      username: 'anotheruser',
    });

    await resetTotpForUser(targetUserId);

    expect(mockSafeUpdateTag).toHaveBeenCalledWith('activityFeed');
    expect(mockSafeUpdateTag).toHaveBeenCalledWith('getUsers');
  });

  it('requires authentication before resetting another user', async () => {
    mockRequireApiAuth.mockRejectedValue(new Error('Unauthorized'));

    await expect(resetTotpForUser('target-user-id')).rejects.toThrow(
      'Unauthorized',
    );
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });
});
