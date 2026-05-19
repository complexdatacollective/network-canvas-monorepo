import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';

import { isCapacitor } from '../platform/platform';

export type VaultMetadata =
  | {
      mode: 'webauthn';
      credentialIdB64: string;
      saltB64: string;
      enrolledAt: string;
    }
  | {
      mode: 'pin';
      kdfSaltB64: string;
      kdfIterations: number;
      verifierB64: string;
      enrolledAt: string;
    }
  | {
      mode: 'none';
      enrolledAt: string;
    };

const KEY_MODE = 'auth.mode';
const KEY_CREDENTIAL_ID = 'auth.credentialId';
const KEY_SALT = 'auth.salt';
const KEY_KDF_SALT = 'auth.kdfSalt';
const KEY_KDF_ITERATIONS = 'auth.kdfIterations';
const KEY_VERIFIER = 'auth.verifier';
const KEY_ENROLLED_AT = 'auth.enrolledAt';

const ALL_KEYS = [
  KEY_MODE,
  KEY_CREDENTIAL_ID,
  KEY_SALT,
  KEY_KDF_SALT,
  KEY_KDF_ITERATIONS,
  KEY_VERIFIER,
  KEY_ENROLLED_AT,
] as const;

// On iOS, @capacitor/preferences is backed by the Keychain which is
// inaccessible immediately after a cold boot until the user enters their
// device passcode. Wait once for the next foreground transition (capped at
// 10s) before retrying so that "Keychain locked" doesn't surface as
// "unconfigured".
const RESUME_WAIT_TIMEOUT_MS = 10_000;

function waitForNextResume(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void listenerHandle?.remove();
      resolve();
    };
    const timer = setTimeout(settle, RESUME_WAIT_TIMEOUT_MS);
    void App.addListener('resume', settle).then((handle) => {
      if (settled) {
        void handle.remove();
        return;
      }
      listenerHandle = handle;
    });
  });
}

async function readEntryFromPreferences(key: string): Promise<string | null> {
  const result = await Preferences.get({ key });
  return result.value ?? null;
}

async function readEntry(key: string): Promise<string | null> {
  if (isCapacitor) {
    try {
      return await readEntryFromPreferences(key);
    } catch {
      await waitForNextResume();
      return await readEntryFromPreferences(key);
    }
  }
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
}

async function writeEntry(key: string, value: string): Promise<void> {
  if (isCapacitor) {
    await Preferences.set({ key, value });
    return;
  }
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
}

async function removeEntry(key: string): Promise<void> {
  if (isCapacitor) {
    await Preferences.remove({ key });
    return;
  }
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

export async function read(): Promise<VaultMetadata | null> {
  const mode = await readEntry(KEY_MODE);
  const enrolledAt = await readEntry(KEY_ENROLLED_AT);
  if (!enrolledAt) return null;

  if (mode === 'none') {
    return { mode: 'none', enrolledAt };
  }

  if (mode === 'pin') {
    const [kdfSaltB64, kdfIterationsRaw, verifierB64] = await Promise.all([
      readEntry(KEY_KDF_SALT),
      readEntry(KEY_KDF_ITERATIONS),
      readEntry(KEY_VERIFIER),
    ]);
    if (!kdfSaltB64 || !kdfIterationsRaw || !verifierB64) return null;
    const kdfIterations = Number.parseInt(kdfIterationsRaw, 10);
    if (!Number.isFinite(kdfIterations) || kdfIterations <= 0) return null;
    return {
      mode: 'pin',
      kdfSaltB64,
      kdfIterations,
      verifierB64,
      enrolledAt,
    };
  }

  const [credentialIdB64, saltB64] = await Promise.all([
    readEntry(KEY_CREDENTIAL_ID),
    readEntry(KEY_SALT),
  ]);
  if (!credentialIdB64 || !saltB64) return null;
  return {
    mode: 'webauthn',
    credentialIdB64,
    saltB64,
    enrolledAt,
  };
}

export async function writeWebAuthn(args: {
  credentialIdB64: string;
  saltB64: string;
}): Promise<void> {
  const enrolledAt = new Date().toISOString();
  await clear();
  await Promise.all([
    writeEntry(KEY_MODE, 'webauthn'),
    writeEntry(KEY_CREDENTIAL_ID, args.credentialIdB64),
    writeEntry(KEY_SALT, args.saltB64),
    writeEntry(KEY_ENROLLED_AT, enrolledAt),
  ]);
}

export async function writePin(args: {
  kdfSaltB64: string;
  kdfIterations: number;
  verifierB64: string;
}): Promise<void> {
  const enrolledAt = new Date().toISOString();
  await clear();
  await Promise.all([
    writeEntry(KEY_MODE, 'pin'),
    writeEntry(KEY_KDF_SALT, args.kdfSaltB64),
    writeEntry(KEY_KDF_ITERATIONS, String(args.kdfIterations)),
    writeEntry(KEY_VERIFIER, args.verifierB64),
    writeEntry(KEY_ENROLLED_AT, enrolledAt),
  ]);
}

export async function writeNone(): Promise<void> {
  const enrolledAt = new Date().toISOString();
  await clear();
  await Promise.all([
    writeEntry(KEY_MODE, 'none'),
    writeEntry(KEY_ENROLLED_AT, enrolledAt),
  ]);
}

export async function clear(): Promise<void> {
  await Promise.all(ALL_KEYS.map(removeEntry));
}
