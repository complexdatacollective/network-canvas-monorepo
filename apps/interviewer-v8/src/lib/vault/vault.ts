import { getInstallationId } from '../platform/installationId';
import {
  deriveKekFromPassword,
  deriveKekFromPrf,
  generateDek,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_BYTES,
  toBase64,
  unwrapDek,
  unwrapDekExtractable,
  wrapDek,
} from './crypto';
import {
  clearVault,
  readVault,
  type VaultMode,
  writeVault,
} from './vaultStore';
import { enrollBiometric, readPrf } from './webauthn';

export type UnlockResult =
  | { ok: true; dek: CryptoKey }
  | { ok: false; message: string };
export type EnrolResult = { ok: boolean; message?: string };

const PIN_LENGTH = 8;
const PASSPHRASE_MIN_LENGTH = 12;
const PASSPHRASE_MIN_CLASSES = 3;

// Reused verbatim from the retired auth/api.ts.
function validatePin(pin: string): EnrolResult {
  if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
    return { ok: false, message: `PIN must be exactly ${PIN_LENGTH} digits` };
  }
  return { ok: true };
}

function countCharacterClasses(s: string): number {
  let n = 0;
  if (/[a-z]/.test(s)) n += 1;
  if (/[A-Z]/.test(s)) n += 1;
  if (/[0-9]/.test(s)) n += 1;
  if (/[^a-zA-Z0-9]/.test(s)) n += 1;
  return n;
}

function validatePassphrase(phrase: string): EnrolResult {
  if (phrase.length < PASSPHRASE_MIN_LENGTH) {
    return {
      ok: false,
      message: `Passphrase must be at least ${PASSPHRASE_MIN_LENGTH} characters`,
    };
  }
  if (countCharacterClasses(phrase) < PASSPHRASE_MIN_CLASSES) {
    return {
      ok: false,
      message:
        'Passphrase must be stronger — combine uppercase, lowercase, numbers, and symbols',
    };
  }
  return { ok: true };
}

function randomSaltB64(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES)));
}

async function wrapFreshDekWithPassword(secret: string): Promise<{
  kdfSaltB64: string;
  kdfIterations: number;
  wrappedDekB64: string;
}> {
  const kdfSaltB64 = randomSaltB64();
  const kek = await deriveKekFromPassword(
    secret,
    kdfSaltB64,
    PBKDF2_ITERATIONS,
  );
  const dek = await generateDek();
  const wrappedDekB64 = await wrapDek(dek, kek);
  return { kdfSaltB64, kdfIterations: PBKDF2_ITERATIONS, wrappedDekB64 };
}

async function unlockWithPassword(
  secret: string,
  material: {
    kdfSaltB64: string;
    kdfIterations: number;
    wrappedDekB64: string;
  },
  wrongMessage: string,
): Promise<UnlockResult> {
  const kek = await deriveKekFromPassword(
    secret,
    material.kdfSaltB64,
    material.kdfIterations,
  );
  try {
    const dek = await unwrapDek(material.wrappedDekB64, kek);
    return { ok: true, dek };
  } catch {
    return { ok: false, message: wrongMessage };
  }
}

// Non-destructive PIN/passphrase change: rewrap the SAME DEK under a KEK
// derived from the new secret. Because the DEK material is unchanged, every
// existing encrypted row still decrypts and the caller's held session DEK stays
// valid — no re-lock, no re-encryption.
//
// The current secret is verified for free: deriving the OLD KEK and unwrapping
// the stored DEK throws on a wrong secret (AES-KW integrity), so a successful
// unwrap is proof-of-possession. The unwrap is EXTRACTABLE so the recovered DEK
// can be re-wrapped, but that extractable copy lives only inside this function
// (rewrap-then-discard) and is never returned to a caller or the session holder.
//
// Atomicity: writeVault runs only after the new wrap succeeds, so a failure
// (wrong secret, weak new secret) leaves the previous credential fully usable.
async function reEnrolPassword(
  mode: 'pin' | 'passphrase',
  current: string,
  next: string,
  wrongCurrentMessage: string,
): Promise<EnrolResult> {
  const validation =
    mode === 'pin' ? validatePin(next) : validatePassphrase(next);
  if (!validation.ok) return validation;

  const record = readVault();
  if (!record || record.mode !== mode) {
    return {
      ok: false,
      message:
        mode === 'pin'
          ? 'PIN is not configured on this device'
          : 'Passphrase is not configured on this device',
    };
  }

  const oldKek = await deriveKekFromPassword(
    current,
    record.kdfSaltB64,
    record.kdfIterations,
  );

  let dek: CryptoKey;
  try {
    dek = await unwrapDekExtractable(record.wrappedDekB64, oldKek);
  } catch {
    return { ok: false, message: wrongCurrentMessage };
  }

  const kdfSaltB64 = randomSaltB64();
  const newKek = await deriveKekFromPassword(
    next,
    kdfSaltB64,
    PBKDF2_ITERATIONS,
  );
  const wrappedDekB64 = await wrapDek(dek, newKek);

  writeVault({
    version: 4,
    mode,
    kdfSaltB64,
    kdfIterations: PBKDF2_ITERATIONS,
    wrappedDekB64,
  });
  return { ok: true };
}

export function reEnrolPin(
  currentPin: string,
  nextPin: string,
): Promise<EnrolResult> {
  return reEnrolPassword(
    'pin',
    currentPin,
    nextPin,
    'Current PIN is incorrect',
  );
}

export function reEnrolPassphrase(
  currentPhrase: string,
  nextPhrase: string,
): Promise<EnrolResult> {
  return reEnrolPassword(
    'passphrase',
    currentPhrase,
    nextPhrase,
    'Current passphrase is incorrect',
  );
}

export async function enrolNone(): Promise<EnrolResult> {
  writeVault({ version: 4, mode: 'none' });
  return { ok: true };
}

export async function enrolPin(pin: string): Promise<EnrolResult> {
  const validation = validatePin(pin);
  if (!validation.ok) return validation;
  const material = await wrapFreshDekWithPassword(pin);
  writeVault({ version: 4, mode: 'pin', ...material });
  return { ok: true };
}

export async function enrolPassphrase(phrase: string): Promise<EnrolResult> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return validation;
  const material = await wrapFreshDekWithPassword(phrase);
  writeVault({ version: 4, mode: 'passphrase', ...material });
  return { ok: true };
}

// Enrol generates the DEK inline and returns it so the caller can take custody
// without a third biometric prompt (create() + readPrf() already cost two). The
// WebAuthn calls are wrapped so a cancelled OS sheet resolves to a failure
// result rather than throwing NotAllowedError up through the wizard, mirroring
// unlockBiometric.
export async function enrolBiometric(
  recoveryPhrase: string,
): Promise<UnlockResult> {
  const validation = validatePassphrase(recoveryPhrase);
  if (!validation.ok) {
    return { ok: false, message: validation.message ?? 'Invalid passphrase' };
  }

  try {
    const userHandle = new TextEncoder().encode(getInstallationId());
    const { enrollment, prfOutput } = await enrollBiometric(userHandle);

    // One DEK, dual-wrapped: PRF-derived KEK and a recovery-passphrase KEK.
    const dek = await generateDek();

    const bioKek = await deriveKekFromPrf(prfOutput, enrollment.prfSaltB64);
    const wrappedDekB64 = await wrapDek(dek, bioKek);

    const recoverySaltB64 = randomSaltB64();
    const recoveryKek = await deriveKekFromPassword(
      recoveryPhrase,
      recoverySaltB64,
      PBKDF2_ITERATIONS,
    );
    const recoveryWrappedDekB64 = await wrapDek(dek, recoveryKek);

    writeVault({
      version: 4,
      mode: 'biometric',
      webauthn: enrollment,
      wrappedDekB64,
      recovery: {
        kdfSaltB64: recoverySaltB64,
        kdfIterations: PBKDF2_ITERATIONS,
        wrappedDekB64: recoveryWrappedDekB64,
      },
    });

    // Hand back the DEK as a non-extractable session key — reconstructed from
    // the wrap we just wrote using key material already in memory, so no third
    // biometric prompt. `dek` above is extractable only so it can be wrapped.
    const sessionDek = await unwrapDek(wrappedDekB64, bioKek);
    return { ok: true, dek: sessionDek };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Biometric enrolment failed';
    return { ok: false, message };
  }
}

export async function unlockPin(pin: string): Promise<UnlockResult> {
  const validation = validatePin(pin);
  if (!validation.ok) return { ok: false, message: 'Incorrect PIN' };
  const record = readVault();
  if (!record || record.mode !== 'pin') {
    return { ok: false, message: 'PIN is not configured on this device' };
  }
  return unlockWithPassword(pin, record, 'Incorrect PIN');
}

export async function unlockPassphrase(phrase: string): Promise<UnlockResult> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return { ok: false, message: 'Incorrect passphrase' };
  const record = readVault();
  if (!record || record.mode !== 'passphrase') {
    return {
      ok: false,
      message: 'Passphrase is not configured on this device',
    };
  }
  return unlockWithPassword(phrase, record, 'Incorrect passphrase');
}

export async function unlockBiometric(): Promise<UnlockResult> {
  const record = readVault();
  if (!record || record.mode !== 'biometric') {
    return {
      ok: false,
      message: 'Biometric authentication is not configured on this device',
    };
  }
  try {
    const prfOutput = await readPrf(
      record.webauthn.credentialId,
      record.webauthn.prfSaltB64,
    );
    const kek = await deriveKekFromPrf(prfOutput, record.webauthn.prfSaltB64);
    const dek = await unwrapDek(record.wrappedDekB64, kek);
    return { ok: true, dek };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Biometric authentication failed';
    return { ok: false, message };
  }
}

export async function unlockRecovery(phrase: string): Promise<UnlockResult> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return { ok: false, message: 'Incorrect passphrase' };
  const record = readVault();
  if (!record || record.mode !== 'biometric') {
    return {
      ok: false,
      message: 'Recovery is not available for this vault',
    };
  }
  return unlockWithPassword(phrase, record.recovery, 'Incorrect passphrase');
}

export async function verifyPin(pin: string): Promise<EnrolResult> {
  const result = await unlockPin(pin);
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

export async function verifyPassphrase(phrase: string): Promise<EnrolResult> {
  const result = await unlockPassphrase(phrase);
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

export async function verifyBiometric(): Promise<EnrolResult> {
  const result = await unlockBiometric();
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

export function vaultStatus(): { configured: boolean; mode?: VaultMode } {
  const record = readVault();
  if (!record) return { configured: false };
  return { configured: true, mode: record.mode };
}

// Structural guard for the optional, newer signalUnknownCredential static.
// jsdom (and older browsers) have no PublicKeyCredential global at all, so
// `typeof PublicKeyCredential === 'undefined'` must be checked first.
type PublicKeyCredentialWithSignal = {
  signalUnknownCredential: (options: {
    rpId: string;
    credentialId: string;
  }) => Promise<void>;
};

function supportsSignalUnknownCredential(
  value: object,
): value is PublicKeyCredentialWithSignal {
  return (
    'signalUnknownCredential' in value &&
    typeof value.signalUnknownCredential === 'function'
  );
}

export async function revoke(): Promise<void> {
  const record = readVault();
  if (record?.mode === 'biometric') {
    // Best-effort passkey deletion: PublicKeyCredential.signalUnknownCredential
    // is not universally available, so guard and swallow — the record clear
    // below is the authoritative revocation.
    if (
      typeof PublicKeyCredential !== 'undefined' &&
      supportsSignalUnknownCredential(PublicKeyCredential)
    ) {
      try {
        await PublicKeyCredential.signalUnknownCredential({
          rpId: window.location.hostname,
          credentialId: record.webauthn.credentialId,
        });
      } catch {
        // Passkey deletion is best-effort; ignore failures.
      }
    }
  }
  clearVault();
}
