import { db } from '../db/db';
import { isCapacitor, isElectron } from '../platform/platform';
import {
  isBiometricNativeAvailable,
  verifyBiometric as verifyBiometricNativePlugin,
} from './biometricNative';
import * as electronAuth from './electron';
import * as vaultMetadata from './vaultMetadata';

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 32;
const PBKDF2_KEY_BYTES = 32;
const PIN_LENGTH = 8;

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1)
    binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

// Non-Electron renderers hold the unlock flag in sessionStorage, not in a
// module-level variable: a page reload (Vite HMR escalation, F5, etc.) wipes
// module state and would otherwise re-show the LockScreen on every dev save.
// sessionStorage clears when the tab / Capacitor process is killed, which
// matches the spec's "re-lock on app close" requirement.
const WEB_UNLOCK_KEY = 'interviewer-v7:web-unlocked';

function readWebUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(WEB_UNLOCK_KEY) === '1';
}

function writeWebUnlocked(value: boolean): void {
  if (typeof window === 'undefined') return;
  if (value) {
    window.sessionStorage.setItem(WEB_UNLOCK_KEY, '1');
  } else {
    window.sessionStorage.removeItem(WEB_UNLOCK_KEY);
  }
}

function validatePin(
  pin: string,
): { ok: true } | { ok: false; message: string } {
  if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
    return {
      ok: false,
      message: `PIN must be exactly ${PIN_LENGTH} digits`,
    };
  }
  return { ok: true };
}

async function derivePinVerifier(
  pin: string,
  saltB64: string,
  iterations: number,
): Promise<string> {
  const salt = fromBase64(saltB64);
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    material,
    PBKDF2_KEY_BYTES * 8,
  );
  return toBase64(new Uint8Array(bits));
}

const PASSPHRASE_MIN_LENGTH = 12;
const PASSPHRASE_MIN_CLASSES = 3;

function countCharacterClasses(s: string): number {
  let n = 0;
  if (/[a-z]/.test(s)) n += 1;
  if (/[A-Z]/.test(s)) n += 1;
  if (/[0-9]/.test(s)) n += 1;
  if (/[^a-zA-Z0-9]/.test(s)) n += 1;
  return n;
}

function validatePassphrase(
  phrase: string,
): { ok: true } | { ok: false; message: string } {
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

async function derivePassphraseVerifier(
  phrase: string,
  saltB64: string,
  iterations: number,
): Promise<string> {
  // Same derivation as PIN — but kept separate so future tuning (e.g. argon2)
  // can be passphrase-specific without disturbing PIN.
  const salt = fromBase64(saltB64);
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    material,
    PBKDF2_KEY_BYTES * 8,
  );
  return toBase64(new Uint8Array(bits));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Synchronous predicate retained for legacy call sites; biometric-keystore
// availability is async and exposed via `isBiometricSupported` (added in
// Milestone C).
export function isAuthenticatorSupported(): boolean {
  return false;
}

export async function status(): Promise<AuthStatus> {
  if (isElectron) return electronAuth.status();
  const metadata = await vaultMetadata.read();
  if (!metadata) {
    return { configured: false, locked: false };
  }
  if (metadata.mode === 'pin') {
    return {
      configured: true,
      locked: !readWebUnlocked(),
      mode: 'pin',
    };
  }
  if (metadata.mode === 'passphrase') {
    return {
      configured: true,
      locked: !readWebUnlocked(),
      mode: 'passphrase',
    };
  }
  if (metadata.mode === 'biometric-native') {
    return {
      configured: true,
      locked: !readWebUnlocked(),
      mode: 'biometric-native',
    };
  }
  return {
    configured: true,
    locked: false,
    mode: 'none',
  };
}

export async function enrol(
  _signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  return { ok: false, message: 'Biometric authentication is not available' };
}

export async function enrolWithoutLock(): Promise<{
  ok: boolean;
  message?: string;
}> {
  if (isElectron) {
    return electronAuth.setupNone();
  }
  await vaultMetadata.writeNone();
  writeWebUnlocked(true);
  return { ok: true };
}

export async function enrolWithPin(
  pin: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePin(pin);
  if (!validation.ok) return validation;
  if (isElectron) {
    return electronAuth.setupPin({ pin });
  }
  const salt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(salt);
  const saltB64 = toBase64(salt);
  const verifierB64 = await derivePinVerifier(pin, saltB64, PBKDF2_ITERATIONS);
  await vaultMetadata.writePin({
    kdfSaltB64: saltB64,
    kdfIterations: PBKDF2_ITERATIONS,
    verifierB64,
  });
  writeWebUnlocked(true);
  return { ok: true };
}

export async function enrolWithBiometricNative(): Promise<{
  ok: boolean;
  message?: string;
}> {
  if (!isCapacitor) {
    return { ok: false, message: 'Biometric authentication is not available' };
  }
  const availability = await isBiometricNativeAvailable();
  if (!availability.ok) {
    return {
      ok: false,
      message: 'Biometric authentication is not available on this device',
    };
  }
  const verification = await verifyBiometricNativePlugin();
  if (!verification.ok) return verification;
  await vaultMetadata.writeBiometricNative();
  writeWebUnlocked(true);
  return { ok: true };
}

export async function unlockWithBiometricNative(): Promise<{
  ok: boolean;
  message?: string;
}> {
  if (!isCapacitor) {
    return { ok: false, message: 'Biometric authentication is not available' };
  }
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'biometric-native') {
    return {
      ok: false,
      message: 'Biometric authentication is not configured on this device',
    };
  }
  const verification = await verifyBiometricNativePlugin();
  if (!verification.ok) return verification;
  writeWebUnlocked(true);
  return { ok: true };
}

export async function unlock(
  _signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  return { ok: false, message: 'Biometric authentication is not available' };
}

export async function unlockWithPin(
  pin: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePin(pin);
  if (!validation.ok) return validation;
  if (isElectron) {
    return electronAuth.unlockPin({ pin });
  }
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'pin') {
    return { ok: false, message: 'PIN is not configured on this device' };
  }
  const verifier = await derivePinVerifier(
    pin,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(verifier, metadata.verifierB64)) {
    return { ok: false, message: 'Incorrect PIN' };
  }
  writeWebUnlocked(true);
  return { ok: true };
}

export async function lock(): Promise<void> {
  if (isElectron) {
    await electronAuth.lock();
    return;
  }
  writeWebUnlocked(false);
}

export async function reEnrol(
  _signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  return { ok: false, message: 'Biometric authentication is not available' };
}

export async function reEnrolWithPin(args: {
  currentPin: string;
  nextPin: string;
}): Promise<{ ok: boolean; message?: string }> {
  const nextValidation = validatePin(args.nextPin);
  if (!nextValidation.ok) return nextValidation;
  const currentValidation = validatePin(args.currentPin);
  if (!currentValidation.ok)
    return { ok: false, message: 'Current PIN is incorrect' };
  if (isElectron) {
    return electronAuth.reEnrolPin(args);
  }
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'pin') {
    return { ok: false, message: 'PIN is not configured on this device' };
  }
  const currentVerifier = await derivePinVerifier(
    args.currentPin,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(currentVerifier, metadata.verifierB64)) {
    return { ok: false, message: 'Current PIN is incorrect' };
  }
  const nextSalt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(nextSalt);
  const nextSaltB64 = toBase64(nextSalt);
  const nextVerifierB64 = await derivePinVerifier(
    args.nextPin,
    nextSaltB64,
    PBKDF2_ITERATIONS,
  );
  await vaultMetadata.writePin({
    kdfSaltB64: nextSaltB64,
    kdfIterations: PBKDF2_ITERATIONS,
    verifierB64: nextVerifierB64,
  });
  writeWebUnlocked(true);
  return { ok: true };
}

export async function enrolWithPassphrase(
  phrase: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return validation;
  if (isElectron) {
    return electronAuth.setupPassphrase({ phrase });
  }
  const salt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(salt);
  const saltB64 = toBase64(salt);
  const verifierB64 = await derivePassphraseVerifier(
    phrase,
    saltB64,
    PBKDF2_ITERATIONS,
  );
  await vaultMetadata.writePassphrase({
    kdfSaltB64: saltB64,
    kdfIterations: PBKDF2_ITERATIONS,
    verifierB64,
  });
  writeWebUnlocked(true);
  return { ok: true };
}

export async function unlockWithPassphrase(
  phrase: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return { ok: false, message: 'Incorrect passphrase' };
  if (isElectron) {
    return electronAuth.unlockPassphrase({ phrase });
  }
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'passphrase') {
    return {
      ok: false,
      message: 'Passphrase is not configured on this device',
    };
  }
  const verifier = await derivePassphraseVerifier(
    phrase,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(verifier, metadata.verifierB64)) {
    return { ok: false, message: 'Incorrect passphrase' };
  }
  writeWebUnlocked(true);
  return { ok: true };
}

export async function reEnrolWithPassphrase(args: {
  currentPhrase: string;
  nextPhrase: string;
}): Promise<{ ok: boolean; message?: string }> {
  const nextValidation = validatePassphrase(args.nextPhrase);
  if (!nextValidation.ok) return nextValidation;
  if (isElectron) {
    return electronAuth.reEnrolPassphrase(args);
  }
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'passphrase') {
    return {
      ok: false,
      message: 'Passphrase is not configured on this device',
    };
  }
  const currentVerifier = await derivePassphraseVerifier(
    args.currentPhrase,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(currentVerifier, metadata.verifierB64)) {
    return { ok: false, message: 'Current passphrase is incorrect' };
  }
  const nextSalt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(nextSalt);
  const nextSaltB64 = toBase64(nextSalt);
  const nextVerifierB64 = await derivePassphraseVerifier(
    args.nextPhrase,
    nextSaltB64,
    PBKDF2_ITERATIONS,
  );
  await vaultMetadata.writePassphrase({
    kdfSaltB64: nextSaltB64,
    kdfIterations: PBKDF2_ITERATIONS,
    verifierB64: nextVerifierB64,
  });
  writeWebUnlocked(true);
  return { ok: true };
}

export async function verifyBiometric(
  _signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  if (isCapacitor) {
    return verifyBiometricNativePlugin();
  }
  return { ok: false, message: 'Biometric authentication is not available' };
}

export async function verifyWithPin(
  pin: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePin(pin);
  if (!validation.ok) return { ok: false, message: 'Incorrect PIN' };
  if (isElectron) return electronAuth.verifyPin({ pin });
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'pin') {
    return { ok: false, message: 'PIN is not configured on this device' };
  }
  const verifier = await derivePinVerifier(
    pin,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(verifier, metadata.verifierB64)) {
    return { ok: false, message: 'Incorrect PIN' };
  }
  return { ok: true };
}

export async function verifyWithPassphrase(
  phrase: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return { ok: false, message: 'Incorrect passphrase' };
  if (isElectron) return electronAuth.verifyPassphrase({ phrase });
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'passphrase') {
    return {
      ok: false,
      message: 'Passphrase is not configured on this device',
    };
  }
  const verifier = await derivePassphraseVerifier(
    phrase,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(verifier, metadata.verifierB64)) {
    return { ok: false, message: 'Incorrect passphrase' };
  }
  return { ok: true };
}

export async function revoke(): Promise<void> {
  if (isElectron) {
    await electronAuth.revoke();
    return;
  }
  // Order matters: drop the Dexie DB first, then clear metadata. If we fail
  // mid-revoke, leaving metadata behind keeps the install in a recoverable
  // "configured but locked" state instead of an orphaned DB without a vault.
  await db.delete();
  await vaultMetadata.clear();
  writeWebUnlocked(false);
}
