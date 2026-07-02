export type VaultMetadata =
  | {
      mode: 'biometric-native';
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
      mode: 'passphrase';
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
const KEY_KDF_SALT = 'auth.kdfSalt';
const KEY_KDF_ITERATIONS = 'auth.kdfIterations';
const KEY_VERIFIER = 'auth.verifier';
const KEY_ENROLLED_AT = 'auth.enrolledAt';

const ALL_KEYS = [
  KEY_MODE,
  KEY_KDF_SALT,
  KEY_KDF_ITERATIONS,
  KEY_VERIFIER,
  KEY_ENROLLED_AT,
] as const;

function readEntry(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
}

function writeEntry(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
}

function removeEntry(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

export async function read(): Promise<VaultMetadata | null> {
  const mode = readEntry(KEY_MODE);
  const enrolledAt = readEntry(KEY_ENROLLED_AT);
  if (!enrolledAt) return null;

  if (mode === 'none') {
    return { mode: 'none', enrolledAt };
  }

  if (mode === 'pin') {
    const kdfSaltB64 = readEntry(KEY_KDF_SALT);
    const kdfIterationsRaw = readEntry(KEY_KDF_ITERATIONS);
    const verifierB64 = readEntry(KEY_VERIFIER);
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

  if (mode === 'passphrase') {
    const kdfSaltB64 = readEntry(KEY_KDF_SALT);
    const kdfIterationsRaw = readEntry(KEY_KDF_ITERATIONS);
    const verifierB64 = readEntry(KEY_VERIFIER);
    if (!kdfSaltB64 || !kdfIterationsRaw || !verifierB64) return null;
    const kdfIterations = Number.parseInt(kdfIterationsRaw, 10);
    if (!Number.isFinite(kdfIterations) || kdfIterations <= 0) return null;
    return {
      mode: 'passphrase',
      kdfSaltB64,
      kdfIterations,
      verifierB64,
      enrolledAt,
    };
  }

  if (mode === 'biometric-native') {
    return { mode: 'biometric-native', enrolledAt };
  }

  return null;
}

export async function writePin(args: {
  kdfSaltB64: string;
  kdfIterations: number;
  verifierB64: string;
}): Promise<void> {
  const enrolledAt = new Date().toISOString();
  await clear();
  writeEntry(KEY_MODE, 'pin');
  writeEntry(KEY_KDF_SALT, args.kdfSaltB64);
  writeEntry(KEY_KDF_ITERATIONS, String(args.kdfIterations));
  writeEntry(KEY_VERIFIER, args.verifierB64);
  writeEntry(KEY_ENROLLED_AT, enrolledAt);
}

export async function writeNone(): Promise<void> {
  const enrolledAt = new Date().toISOString();
  await clear();
  writeEntry(KEY_MODE, 'none');
  writeEntry(KEY_ENROLLED_AT, enrolledAt);
}

export async function writePassphrase(args: {
  kdfSaltB64: string;
  kdfIterations: number;
  verifierB64: string;
}): Promise<void> {
  const enrolledAt = new Date().toISOString();
  await clear();
  writeEntry(KEY_MODE, 'passphrase');
  writeEntry(KEY_KDF_SALT, args.kdfSaltB64);
  writeEntry(KEY_KDF_ITERATIONS, String(args.kdfIterations));
  writeEntry(KEY_VERIFIER, args.verifierB64);
  writeEntry(KEY_ENROLLED_AT, enrolledAt);
}

export async function writeBiometricNative(): Promise<void> {
  const enrolledAt = new Date().toISOString();
  await clear();
  writeEntry(KEY_MODE, 'biometric-native');
  writeEntry(KEY_ENROLLED_AT, enrolledAt);
}

export async function clear(): Promise<void> {
  for (const key of ALL_KEYS) removeEntry(key);
}
