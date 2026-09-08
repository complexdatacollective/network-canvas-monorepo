import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';

import { LocalizedError, messageFailure } from '../../i18n/messageResult';
import type { MessageFailure } from '../../i18n/messageResult';
import { getInstallationId } from '../installationId';
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
  readVaultState,
  type VaultMode,
  type VaultRecord,
  writeVault,
} from './vaultStore';
import { enrollBiometric, readPrf, signalCredentialUnknown } from './webauthn';

const messages = defineMessages({
  vaultChanged: {
    id: 'interviewer.vault.vaultChanged',
    defaultMessage:
      'The device lock changed while unlocking. Please try again.',
    description: 'Administration text in Interviewer vault.',
  },
  pinUnconfigured: {
    id: 'interviewer.vault.pinUnconfigured',
    defaultMessage: 'PIN is not configured on this device',
    description: 'Administration text in Interviewer vault.',
  },
  passphraseUnconfigured: {
    id: 'interviewer.vault.passphraseUnconfigured',
    defaultMessage: 'Passphrase is not configured on this device',
    description: 'Administration text in Interviewer vault.',
  },
  wrongCurrentPin: {
    id: 'interviewer.vault.wrongCurrentPin',
    defaultMessage: 'Current PIN is incorrect',
    description: 'Administration text in Interviewer vault.',
  },
  wrongCurrentPassphrase: {
    id: 'interviewer.vault.wrongCurrentPassphrase',
    defaultMessage: 'Current passphrase is incorrect',
    description: 'Administration text in Interviewer vault.',
  },
  wrongPin: {
    id: 'interviewer.vault.wrongPin',
    defaultMessage: 'Incorrect PIN',
    description: 'Administration text in Interviewer vault.',
  },
  wrongPassphrase: {
    id: 'interviewer.vault.wrongPassphrase',
    defaultMessage: 'Incorrect passphrase',
    description: 'Administration text in Interviewer vault.',
  },
  biometricUnconfigured: {
    id: 'interviewer.vault.biometricUnconfigured',
    defaultMessage: 'Biometric authentication is not configured on this device',
    description: 'Administration text in Interviewer vault.',
  },
  recoveryUnavailable: {
    id: 'interviewer.vault.recoveryUnavailable',
    defaultMessage: 'Recovery is not available for this vault',
    description: 'Administration text in Interviewer vault.',
  },
  biometricEnrolment: {
    id: 'interviewer.vault.biometricEnrolment',
    defaultMessage: 'Biometric enrolment failed',
    description: 'Administration text in Interviewer vault.',
  },
  biometricAuthentication: {
    id: 'interviewer.vault.biometricAuthentication',
    defaultMessage: 'Biometric authentication failed',
    description: 'Administration text in Interviewer vault.',
  },
  pinLength: {
    id: 'interviewer.vault.pinLength',
    defaultMessage: 'PIN must be exactly {count, number} digits',
    description: 'Administration text in Interviewer vault.',
  },
  passphraseLength: {
    id: 'interviewer.vault.passphraseLength',
    defaultMessage: 'Passphrase must be at least {count, number} characters',
    description: 'Administration text in Interviewer vault.',
  },
  passphraseStrength: {
    id: 'interviewer.vault.passphraseStrength',
    defaultMessage:
      'Passphrase must be stronger — combine uppercase, lowercase, numbers, and symbols',
    description: 'Administration text in Interviewer vault.',
  },
});

export type UnlockResult = { ok: true; dek: CryptoKey } | MessageFailure;
export type EnrolResult = { ok: true } | MessageFailure;

const PIN_LENGTH = 8;
const PASSPHRASE_MIN_LENGTH = 12;
const PASSPHRASE_MIN_CLASSES = 3;

// Reused verbatim from the retired auth/api.ts.
function validatePin(pin: string): EnrolResult {
  if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
    return messageFailure(messages.pinLength, { count: PIN_LENGTH });
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
    return messageFailure(messages.passphraseLength, {
      count: PASSPHRASE_MIN_LENGTH,
    });
  }
  if (countCharacterClasses(phrase) < PASSPHRASE_MIN_CLASSES) {
    return messageFailure(messages.passphraseStrength);
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
  wrongMessage: MessageDescriptor,
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
    return messageFailure(wrongMessage);
  }
}

// Identity of the exact vault a DEK was derived from. `wrappedDekB64` is unique
// per enrolment (random DEK + random salt), so a change means the vault was
// revoked/re-enrolled — the derived DEK now belongs to a retired vault.
function vaultFingerprint(record: VaultRecord): string {
  return record.mode === 'none'
    ? 'none'
    : `${record.mode}:${record.wrappedDekB64}`;
}

// Cross-tab safety net: an unlock may block for a human-scale interval (the
// biometric OS sheet), during which another tab can revoke + re-enrol. Installing
// the DEK we just derived would then write rows the new vault can never decrypt.
// Re-read the vault after deriving the DEK and refuse it if the vault changed.
function guardVaultUnchanged(
  fingerprintBefore: string,
  result: UnlockResult,
): UnlockResult {
  if (!result.ok) return result;
  const current = readVault();
  if (!current || vaultFingerprint(current) !== fingerprintBefore) {
    return messageFailure(messages.vaultChanged);
  }
  return result;
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
  wrongCurrentMessage: MessageDescriptor,
): Promise<EnrolResult> {
  const validation =
    mode === 'pin' ? validatePin(next) : validatePassphrase(next);
  if (!validation.ok) return validation;

  const record = readVault();
  if (!record || record.mode !== mode) {
    return messageFailure(
      mode === 'pin'
        ? messages.pinUnconfigured
        : messages.passphraseUnconfigured,
    );
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
    return messageFailure(wrongCurrentMessage);
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
  return reEnrolPassword('pin', currentPin, nextPin, messages.wrongCurrentPin);
}

export function reEnrolPassphrase(
  currentPhrase: string,
  nextPhrase: string,
): Promise<EnrolResult> {
  return reEnrolPassword(
    'passphrase',
    currentPhrase,
    nextPhrase,
    messages.wrongCurrentPassphrase,
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
    return validation;
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
    return error instanceof LocalizedError
      ? messageFailure(
          error.localizedMessage.descriptor,
          error.localizedMessage.values,
        )
      : {
          ...messageFailure(messages.biometricEnrolment),
          ...(error instanceof Error ? { message: error.message } : {}),
        };
  }
}

export async function unlockPin(pin: string): Promise<UnlockResult> {
  const validation = validatePin(pin);
  if (!validation.ok) return messageFailure(messages.wrongPin);
  const record = readVault();
  if (!record || record.mode !== 'pin') {
    return messageFailure(messages.pinUnconfigured);
  }
  const fingerprint = vaultFingerprint(record);
  const result = await unlockWithPassword(pin, record, messages.wrongPin);
  return guardVaultUnchanged(fingerprint, result);
}

export async function unlockPassphrase(phrase: string): Promise<UnlockResult> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return messageFailure(messages.wrongPassphrase);
  const record = readVault();
  if (!record || record.mode !== 'passphrase') {
    return messageFailure(messages.passphraseUnconfigured);
  }
  const fingerprint = vaultFingerprint(record);
  const result = await unlockWithPassword(
    phrase,
    record,
    messages.wrongPassphrase,
  );
  return guardVaultUnchanged(fingerprint, result);
}

export async function unlockBiometric(): Promise<UnlockResult> {
  const record = readVault();
  if (!record || record.mode !== 'biometric') {
    return messageFailure(messages.biometricUnconfigured);
  }
  const fingerprint = vaultFingerprint(record);
  try {
    const prfOutput = await readPrf(
      record.webauthn.credentialId,
      record.webauthn.prfSaltB64,
    );
    const kek = await deriveKekFromPrf(prfOutput, record.webauthn.prfSaltB64);
    const dek = await unwrapDek(record.wrappedDekB64, kek);
    return guardVaultUnchanged(fingerprint, { ok: true, dek });
  } catch (error) {
    return error instanceof LocalizedError
      ? messageFailure(
          error.localizedMessage.descriptor,
          error.localizedMessage.values,
        )
      : {
          ...messageFailure(messages.biometricAuthentication),
          ...(error instanceof Error ? { message: error.message } : {}),
        };
  }
}

export async function unlockRecovery(phrase: string): Promise<UnlockResult> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return messageFailure(messages.wrongPassphrase);
  const record = readVault();
  if (!record || record.mode !== 'biometric') {
    return messageFailure(messages.recoveryUnavailable);
  }
  const fingerprint = vaultFingerprint(record);
  const result = await unlockWithPassword(
    phrase,
    record.recovery,
    messages.wrongPassphrase,
  );
  return guardVaultUnchanged(fingerprint, result);
}

export async function verifyPin(pin: string): Promise<EnrolResult> {
  const result = await unlockPin(pin);
  return result.ok ? { ok: true } : result;
}

export async function verifyPassphrase(phrase: string): Promise<EnrolResult> {
  const result = await unlockPassphrase(phrase);
  return result.ok ? { ok: true } : result;
}

export async function verifyBiometric(): Promise<EnrolResult> {
  const result = await unlockBiometric();
  return result.ok ? { ok: true } : result;
}

export async function verifyRecovery(phrase: string): Promise<EnrolResult> {
  const result = await unlockRecovery(phrase);
  return result.ok ? { ok: true } : result;
}

export function vaultStatus(): {
  configured: boolean;
  mode?: VaultMode;
  corrupt?: boolean;
} {
  const state = readVaultState();
  if (state.status === 'corrupt') return { configured: false, corrupt: true };
  if (state.status === 'absent') return { configured: false };
  return { configured: true, mode: state.record.mode };
}

export async function revoke(): Promise<void> {
  const record = readVault();
  if (record?.mode === 'biometric') {
    await signalCredentialUnknown(record.webauthn.credentialId);
  }
  clearVault();
}
