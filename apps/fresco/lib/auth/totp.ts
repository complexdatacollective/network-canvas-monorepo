import 'server-only';
import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { Secret, TOTP } from 'otpauth';
import { toDataURL } from 'qrcode';

import { env } from '~/env';
import {
  decryptTotpSecretWithAny,
  encryptTotpSecret,
  resolveTotpKeyMaterials,
  type TotpKeyMaterials,
  TotpSecretDecryptError,
} from '~/utils/totpSecretEncryption';

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 10;
const TWO_FACTOR_TOKEN_TTL_MS = 5 * 60 * 1000;

function deriveHmacKey(installationId: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', installationId, '', 'fresco-two-factor-token', 32),
  );
}

export function generateTotpSecret(): string {
  const secret = new Secret();
  return secret.base32;
}

function totpKeyMaterials(): TotpKeyMaterials {
  return resolveTotpKeyMaterials({
    overrideKey: env.TOTP_ENCRYPTION_KEY || undefined,
    databaseUrl: env.DATABASE_URL,
  });
}

/**
 * Seal a Base32 secret for the `TotpCredential.secret` column. Only the
 * envelope reaches the database; the plaintext is shown to the user once, in
 * the enrolment QR code.
 */
export function sealTotpSecret(secret: string): string {
  const [primary] = totpKeyMaterials();
  return encryptTotpSecret(secret, primary);
}

/**
 * Open a value read from the `TotpCredential.secret` column, trying every key
 * material the deployment has. Throws `TotpSecretDecryptError` rather than
 * returning a wrong secret when none of them fits or the row is still a
 * legacy plaintext secret the startup migration has not sealed.
 */
export function openTotpSecret(stored: string): string {
  return decryptTotpSecretWithAny(stored, totpKeyMaterials()).secret;
}

export type StoredTotpVerification =
  | 'valid'
  | 'invalid'
  /**
   * The stored secret cannot be opened with the deployment's current key
   * material, typically because the database password changed after it was
   * sealed without `TOTP_ENCRYPTION_KEY` set first. The account can still use
   * a recovery code, and an administrator can reset its two-factor
   * authentication so it can enrol again.
   */
  | 'unreadable';

/** Check a code against a stored (sealed) secret. */
export function verifyStoredTotpCode(
  stored: string,
  code: string,
): StoredTotpVerification {
  let secret: string;
  try {
    secret = openTotpSecret(stored);
  } catch (error) {
    if (error instanceof TotpSecretDecryptError) {
      // eslint-disable-next-line no-console
      console.error('[totp] Stored TOTP secret is unreadable:', error.message);
      return 'unreadable';
    }
    throw error;
  }

  return verifyTotpCode(secret, code) ? 'valid' : 'invalid';
}

export function generateTotpUri(
  secret: string,
  username: string,
  issuer: string,
): string {
  const totp = new TOTP({
    issuer,
    label: username,
    secret: Secret.fromBase32(secret),
  });

  return totp.toString();
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new TOTP({
    secret: Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    randomBytes(RECOVERY_CODE_BYTES).toString('hex'),
  );
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function createTwoFactorToken(
  userId: string,
  installationId: string,
): string {
  const hmacKey = deriveHmacKey(installationId);
  const timestamp = Date.now().toString();
  const nonce = randomBytes(16).toString('hex');
  const payload = `${userId}:${timestamp}:${nonce}`;

  const payloadEncoded = Buffer.from(payload).toString('base64url');
  const signature = createHmac('sha256', hmacKey)
    .update(payload)
    .digest('base64url');

  return `${payloadEncoded}:${signature}`;
}

export function verifyTwoFactorToken(
  token: string,
  installationId: string,
): { valid: true; userId: string } | { valid: false } {
  const hmacKey = deriveHmacKey(installationId);
  const separatorIndex = token.lastIndexOf(':');
  if (separatorIndex === -1) {
    return { valid: false };
  }

  const payloadEncoded = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);

  let payload: string;
  try {
    payload = Buffer.from(payloadEncoded, 'base64url').toString();
  } catch {
    return { valid: false };
  }

  const expectedSignature = createHmac('sha256', hmacKey)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expectedBuf.length) {
    return { valid: false };
  }

  if (!timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false };
  }

  const parts = payload.split(':');
  if (parts.length !== 3) {
    return { valid: false };
  }

  const [userId, timestampStr] = parts;
  const timestamp = Number(timestampStr);

  if (!userId || Number.isNaN(timestamp)) {
    return { valid: false };
  }

  if (Date.now() - timestamp > TWO_FACTOR_TOKEN_TTL_MS) {
    return { valid: false };
  }

  return { valid: true, userId };
}

export async function generateQrCodeDataUrl(uri: string): Promise<string> {
  return toDataURL(uri);
}
