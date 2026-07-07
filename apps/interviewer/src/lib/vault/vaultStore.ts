export type VaultMode = 'pin' | 'passphrase' | 'biometric' | 'none';

export type VaultRecord =
  | { version: 4; mode: 'none' }
  | {
      version: 4;
      mode: 'pin' | 'passphrase';
      kdfSaltB64: string;
      kdfIterations: number;
      wrappedDekB64: string;
    }
  | {
      version: 4;
      mode: 'biometric';
      webauthn: { credentialId: string; prfSaltB64: string };
      wrappedDekB64: string;
      recovery: {
        kdfSaltB64: string;
        kdfIterations: number;
        wrappedDekB64: string;
      };
    };

// The localStorage key holding the vault record. Exported so cross-tab
// `storage`-event listeners can key off the same literal this module reads and
// writes, rather than a divergent hardcoded copy.
export const VAULT_STORAGE_KEY = 'interviewer:vault';
const CURRENT_VERSION = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKdfWrappedShape(value: Record<string, unknown>): value is {
  kdfSaltB64: string;
  kdfIterations: number;
  wrappedDekB64: string;
} {
  return (
    typeof value.kdfSaltB64 === 'string' &&
    typeof value.kdfIterations === 'number' &&
    typeof value.wrappedDekB64 === 'string'
  );
}

// Structural validation guards against corrupt/foreign-shaped localStorage
// content (e.g. hand-edited, from an older schema, or another app's key).
function isVaultRecord(value: unknown): value is VaultRecord {
  if (!isRecord(value)) return false;
  if (value.version !== CURRENT_VERSION) return false;

  if (value.mode === 'none') return true;

  if (value.mode === 'pin' || value.mode === 'passphrase') {
    return isKdfWrappedShape(value);
  }

  if (value.mode === 'biometric') {
    if (typeof value.wrappedDekB64 !== 'string') return false;

    const webauthn = value.webauthn;
    if (!isRecord(webauthn)) return false;
    if (
      typeof webauthn.credentialId !== 'string' ||
      typeof webauthn.prfSaltB64 !== 'string'
    ) {
      return false;
    }

    const recovery = value.recovery;
    if (!isRecord(recovery)) return false;
    return isKdfWrappedShape(recovery);
  }

  return false;
}

// The three distinguishable states of the localStorage vault slot. `corrupt`
// (present but unparseable/unknown-version/foreign-shaped) is kept separate from
// `absent` so the app can surface a recovery screen instead of treating a
// damaged or newer-version record as a fresh, unconfigured device and letting
// setup silently overwrite the only wrapped copy of the DEK.
export type VaultReadState =
  | { status: 'absent' }
  | { status: 'valid'; record: VaultRecord }
  | { status: 'corrupt' };

export function readVaultState(): VaultReadState {
  if (typeof window === 'undefined') return { status: 'absent' };
  const raw = window.localStorage.getItem(VAULT_STORAGE_KEY);
  if (raw === null) return { status: 'absent' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt' };
  }

  return isVaultRecord(parsed)
    ? { status: 'valid', record: parsed }
    : { status: 'corrupt' };
}

export function readVault(): VaultRecord | null {
  const state = readVaultState();
  return state.status === 'valid' ? state.record : null;
}

export function writeVault(record: VaultRecord): void {
  if (typeof window === 'undefined') return;
  // The record holds only WRAPPED key material (the DEK encrypted under a
  // KEK derived from the user's PIN/passphrase, or under a WebAuthn-PRF key)
  // plus non-secret KDF params (salt, iterations) and public WebAuthn ids.
  // The raw DEK never appears here, so persisting this to localStorage is the
  // intended at-rest form — the wrapped DEK is useless without the unlock
  // secret. (Flagged by CodeQL js/clear-text-storage-of-sensitive-data, which
  // taints the wrap output as sensitive without seeing it is already ciphertext.)
  window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(record));
}

export function clearVault(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(VAULT_STORAGE_KEY);
}
