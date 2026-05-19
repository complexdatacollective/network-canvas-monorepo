import { db } from '../db/db';
import { isElectron } from '../platform/platform';
import * as electronAuth from './electron';
import * as vaultMetadata from './vaultMetadata';
import {
  authenticatePasskey,
  createPasskey,
  fromBase64,
  isWebAuthnAvailable,
  toBase64,
} from './webauthn';

const PASSKEY_USER_ID = new TextEncoder().encode('interviewer-v7:device');
const PASSKEY_USER_NAME = 'Network Canvas Interviewer';

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 32;
const PBKDF2_KEY_BYTES = 32;
const PIN_LENGTH = 8;

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

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isAuthenticatorSupported(): boolean {
  if (!isWebAuthnAvailable()) return false;
  // Unsigned Electron dev: the WebAuthn API surface exists but the OS prompt
  // never appears (Touch ID requires a signed binary + keychainAccessGroup),
  // so navigator.credentials.create() hangs until the 60s timeout. Treat as
  // unsupported so the user is routed to the PIN / no-lock fallback.
  if (
    isElectron &&
    typeof window !== 'undefined' &&
    window.electronAPI &&
    !window.electronAPI.isPackaged
  ) {
    return false;
  }
  return true;
}

export async function status(): Promise<AuthStatus> {
  if (isElectron) return electronAuth.status();
  const metadata = await vaultMetadata.read();
  if (!metadata) {
    return { configured: false, locked: false };
  }
  if (metadata.mode === 'webauthn') {
    return {
      configured: true,
      locked: !readWebUnlocked(),
      mode: 'webauthn',
      credentialIdB64: metadata.credentialIdB64,
      saltB64: metadata.saltB64,
    };
  }
  if (metadata.mode === 'pin') {
    return {
      configured: true,
      locked: !readWebUnlocked(),
      mode: 'pin',
    };
  }
  return {
    configured: true,
    locked: false,
    mode: 'none',
  };
}

export async function enrol(
  signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  if (!isWebAuthnAvailable()) {
    return { ok: false, message: 'This browser does not support WebAuthn' };
  }
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  const result = await createPasskey({
    userId: PASSKEY_USER_ID,
    userName: PASSKEY_USER_NAME,
    salt,
    signal,
  });
  if (!result.ok) {
    return { ok: false, message: result.error };
  }
  const credentialIdB64 = toBase64(result.enrolment.credentialId);
  const saltB64 = toBase64(salt);
  if (isElectron) {
    return electronAuth.setup({
      credentialIdB64,
      saltB64,
      prfOutputB64: toBase64(result.enrolment.prfOutput),
    });
  }
  await vaultMetadata.writeWebAuthn({ credentialIdB64, saltB64 });
  writeWebUnlocked(true);
  return { ok: true };
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

export async function unlock(
  signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  const metadata = await vaultMetadata.read();
  const s = isElectron ? await electronAuth.status() : null;
  const credentialIdB64 = isElectron
    ? s?.credentialIdB64
    : metadata?.mode === 'webauthn'
      ? metadata.credentialIdB64
      : undefined;
  const saltB64 = isElectron
    ? s?.saltB64
    : metadata?.mode === 'webauthn'
      ? metadata.saltB64
      : undefined;
  if (!credentialIdB64 || !saltB64) {
    return { ok: false, message: 'No authenticator enrolled' };
  }
  const result = await authenticatePasskey({
    credentialId: fromBase64(credentialIdB64),
    salt: fromBase64(saltB64),
    signal,
  });
  if (!result.ok) return { ok: false, message: result.error };
  if (isElectron) {
    return electronAuth.unlock({
      prfOutputB64: toBase64(result.enrolment.prfOutput),
    });
  }
  writeWebUnlocked(true);
  return { ok: true };
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
  signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  if (!isWebAuthnAvailable()) {
    return { ok: false, message: 'This browser does not support WebAuthn' };
  }
  const current = isElectron ? await electronAuth.status() : null;
  const metadata = isElectron ? null : await vaultMetadata.read();
  const currentCredentialIdB64 = isElectron
    ? current?.credentialIdB64
    : metadata?.mode === 'webauthn'
      ? metadata.credentialIdB64
      : undefined;
  const currentSaltB64 = isElectron
    ? current?.saltB64
    : metadata?.mode === 'webauthn'
      ? metadata.saltB64
      : undefined;
  if (!currentCredentialIdB64 || !currentSaltB64) {
    return { ok: false, message: 'No authenticator enrolled' };
  }

  const currentAuth = await authenticatePasskey({
    credentialId: fromBase64(currentCredentialIdB64),
    salt: fromBase64(currentSaltB64),
    signal,
  });
  if (!currentAuth.ok) return { ok: false, message: currentAuth.error };

  const nextSalt = new Uint8Array(32);
  crypto.getRandomValues(nextSalt);
  const next = await createPasskey({
    userId: PASSKEY_USER_ID,
    userName: PASSKEY_USER_NAME,
    salt: nextSalt,
    signal,
  });
  if (!next.ok) return { ok: false, message: next.error };

  const nextCredentialIdB64 = toBase64(next.enrolment.credentialId);
  const nextSaltB64 = toBase64(nextSalt);
  if (isElectron) {
    return electronAuth.reEnrol({
      currentPrfOutputB64: toBase64(currentAuth.enrolment.prfOutput),
      nextCredentialIdB64,
      nextSaltB64,
      nextPrfOutputB64: toBase64(next.enrolment.prfOutput),
    });
  }
  await vaultMetadata.writeWebAuthn({
    credentialIdB64: nextCredentialIdB64,
    saltB64: nextSaltB64,
  });
  writeWebUnlocked(true);
  return { ok: true };
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
