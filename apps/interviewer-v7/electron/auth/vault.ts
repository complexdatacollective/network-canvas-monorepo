import { randomBytes, webcrypto } from 'node:crypto';
import { unlink } from 'node:fs/promises';

import {
  closeDatabase,
  getDbPath,
  openDatabase,
  openDatabasePlain,
} from '../db/service';
import {
  CURRENT_VAULT_VERSION,
  deleteVault,
  isVaultConfigured,
  readVault,
  type VaultRecord,
  writeVault,
} from './vaultStore';

type WebCryptoKey = webcrypto.CryptoKey;
type WebBufferSource = ArrayBufferView | ArrayBuffer;

const KEY_LEN_BYTES = 32;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 32;
const PIN_LENGTH = 8;
const PASSPHRASE_MIN_LENGTH = 12;
const PASSPHRASE_MIN_CLASSES = 3;

let unlockedKeyHex: string | null = null;

function bytesToHex(b: Buffer): string {
  return b.toString('hex');
}

function bufToB64(b: Buffer | Uint8Array): string {
  const buf = b instanceof Buffer ? b : Buffer.from(b);
  return buf.toString('base64');
}

function b64ToBuf(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
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

function validatePassphrase(
  phrase: string,
): { ok: true } | { ok: false; message: string } {
  if (phrase.length < PASSPHRASE_MIN_LENGTH) {
    return {
      ok: false,
      message: `Passphrase must be at least ${PASSPHRASE_MIN_LENGTH} characters`,
    };
  }
  let classes = 0;
  if (/[a-z]/.test(phrase)) classes += 1;
  if (/[A-Z]/.test(phrase)) classes += 1;
  if (/[0-9]/.test(phrase)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(phrase)) classes += 1;
  if (classes < PASSPHRASE_MIN_CLASSES) {
    return {
      ok: false,
      message:
        'Passphrase must be stronger — combine uppercase, lowercase, numbers, and symbols',
    };
  }
  return { ok: true };
}

async function importKekFromBytes(raw: Buffer): Promise<WebCryptoKey> {
  const sized =
    raw.length === KEY_LEN_BYTES
      ? raw
      : Buffer.from(raw.subarray(0, KEY_LEN_BYTES));
  return webcrypto.subtle.importKey('raw', sized, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function deriveKekFromPin(
  pin: string,
  salt: Buffer,
  iterations: number,
): Promise<WebCryptoKey> {
  const material = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return webcrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function deriveKekFromPassphrase(
  phrase: string,
  salt: Buffer,
  iterations: number,
): Promise<WebCryptoKey> {
  // Identical PBKDF2/AES-GCM derivation as deriveKekFromPin — kept separate so
  // future tuning can diverge.
  const material = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return webcrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function aesEncrypt(
  key: WebCryptoKey,
  plaintext: WebBufferSource,
): Promise<{ iv: Buffer; ciphertext: Buffer }> {
  const iv = randomBytes(IV_BYTES);
  const ct = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );
  return { iv, ciphertext: Buffer.from(ct) };
}

async function aesDecrypt(
  key: WebCryptoKey,
  iv: WebBufferSource,
  ciphertext: WebBufferSource,
): Promise<Buffer> {
  const pt = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return Buffer.from(pt);
}

export async function status(): Promise<{
  configured: boolean;
  locked: boolean;
  mode?: 'webauthn' | 'pin' | 'passphrase' | 'none';
  credentialIdB64?: string;
  saltB64?: string;
}> {
  if (!isVaultConfigured()) {
    return { configured: false, locked: false };
  }
  let record: VaultRecord | null;
  try {
    record = readVault();
  } catch (cause) {
    console.warn(
      '[auth] vault file present but unreadable, treating as unconfigured:',
      cause,
    );
    return { configured: false, locked: false };
  }
  if (!record) {
    console.warn(
      '[auth] vault file present but schema version mismatched, treating as unconfigured',
    );
    return { configured: false, locked: false };
  }
  return {
    configured: true,
    locked: record.mode === 'none' ? false : unlockedKeyHex === null,
    mode: record.mode,
    credentialIdB64:
      record.mode === 'webauthn' ? record.credentialIdB64 : undefined,
    saltB64: record.mode === 'webauthn' ? record.saltB64 : undefined,
  };
}

// Opens the plain DB at process start when the vault is in 'none' mode so the
// renderer can issue db:* IPCs without an unlock step.
export function bootstrapNoLock(): void {
  if (!isVaultConfigured()) return;
  const record = readVault();
  if (record?.mode !== 'none') return;
  openDatabasePlain();
}

export async function setupNone(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  if (isVaultConfigured()) {
    return { ok: false, message: 'Vault already configured' };
  }
  try {
    const record: VaultRecord = {
      version: CURRENT_VAULT_VERSION,
      mode: 'none',
      wrapIvB64: '',
      wrapCiphertextB64: '',
    };
    writeVault(record);
    openDatabasePlain();
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function setup(args: {
  credentialIdB64: string;
  saltB64: string;
  prfOutputB64: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!args.prfOutputB64) {
    return {
      ok: false,
      message: 'WebAuthn PRF extension is required and was not provided',
    };
  }
  if (isVaultConfigured()) {
    return { ok: false, message: 'Vault already configured' };
  }
  try {
    const dek = randomBytes(KEY_LEN_BYTES);
    const prf = b64ToBuf(args.prfOutputB64);
    const kek = await importKekFromBytes(prf);
    const wrapped = await aesEncrypt(kek, dek);
    const record: VaultRecord = {
      version: CURRENT_VAULT_VERSION,
      mode: 'webauthn',
      credentialIdB64: args.credentialIdB64,
      saltB64: args.saltB64,
      wrapIvB64: bufToB64(wrapped.iv),
      wrapCiphertextB64: bufToB64(wrapped.ciphertext),
    };
    writeVault(record);
    const hex = bytesToHex(dek);
    openDatabase(hex);
    unlockedKeyHex = hex;
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function setupPin(args: {
  pin: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const validation = validatePin(args.pin);
  if (!validation.ok) return validation;
  if (isVaultConfigured()) {
    return { ok: false, message: 'Vault already configured' };
  }
  try {
    const dek = randomBytes(KEY_LEN_BYTES);
    const kdfSalt = randomBytes(PBKDF2_SALT_BYTES);
    const kek = await deriveKekFromPin(args.pin, kdfSalt, PBKDF2_ITERATIONS);
    const wrapped = await aesEncrypt(kek, dek);
    const record: VaultRecord = {
      version: CURRENT_VAULT_VERSION,
      mode: 'pin',
      kdfSaltB64: bufToB64(kdfSalt),
      kdfIterations: PBKDF2_ITERATIONS,
      wrapIvB64: bufToB64(wrapped.iv),
      wrapCiphertextB64: bufToB64(wrapped.ciphertext),
    };
    writeVault(record);
    const hex = bytesToHex(dek);
    openDatabase(hex);
    unlockedKeyHex = hex;
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function unlock(args: {
  prfOutputB64: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!args.prfOutputB64) {
    return {
      ok: false,
      message: 'WebAuthn PRF extension is required and was not provided',
    };
  }
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (record.mode !== 'webauthn') {
    return { ok: false, message: 'Vault is not configured for WebAuthn' };
  }
  try {
    const prf = b64ToBuf(args.prfOutputB64);
    const kek = await importKekFromBytes(prf);
    let dek: Buffer;
    try {
      dek = await aesDecrypt(
        kek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Authenticator unwrap failed' };
    }
    const hex = bytesToHex(dek);
    openDatabase(hex);
    unlockedKeyHex = hex;
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function unlockPin(args: {
  pin: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const validation = validatePin(args.pin);
  if (!validation.ok) return validation;
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (record.mode !== 'pin') {
    return { ok: false, message: 'Vault is not configured for PIN' };
  }
  try {
    const kek = await deriveKekFromPin(
      args.pin,
      b64ToBuf(record.kdfSaltB64),
      record.kdfIterations,
    );
    let dek: Buffer;
    try {
      dek = await aesDecrypt(
        kek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Incorrect PIN' };
    }
    const hex = bytesToHex(dek);
    openDatabase(hex);
    unlockedKeyHex = hex;
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function verifyPin(args: {
  pin: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const validation = validatePin(args.pin);
  if (!validation.ok) {
    return { ok: false, message: 'Incorrect PIN' };
  }
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (record.mode !== 'pin' || !record.kdfSaltB64 || !record.kdfIterations) {
    return { ok: false, message: 'Vault is not configured for PIN' };
  }
  try {
    const kek = await deriveKekFromPin(
      args.pin,
      b64ToBuf(record.kdfSaltB64),
      record.kdfIterations,
    );
    try {
      await aesDecrypt(
        kek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Incorrect PIN' };
    }
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function verifyPassphrase(args: {
  phrase: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const validation = validatePassphrase(args.phrase);
  if (!validation.ok) {
    return { ok: false, message: 'Incorrect passphrase' };
  }
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (
    record.mode !== 'passphrase' ||
    !record.kdfSaltB64 ||
    !record.kdfIterations
  ) {
    return { ok: false, message: 'Vault is not configured for passphrase' };
  }
  try {
    const kek = await deriveKekFromPassphrase(
      args.phrase,
      b64ToBuf(record.kdfSaltB64),
      record.kdfIterations,
    );
    try {
      await aesDecrypt(
        kek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Incorrect passphrase' };
    }
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function verifyWebAuthn(args: {
  prfOutputB64: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!args.prfOutputB64) {
    return {
      ok: false,
      message: 'WebAuthn PRF extension is required and was not provided',
    };
  }
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (record.mode !== 'webauthn') {
    return { ok: false, message: 'Vault is not configured for WebAuthn' };
  }
  try {
    const kek = await importKekFromBytes(b64ToBuf(args.prfOutputB64));
    try {
      await aesDecrypt(
        kek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Authenticator unwrap failed' };
    }
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function lock(): Promise<void> {
  const record = readVault();
  // mode='none' has no unlock path, so closing the DB would leave the app in
  // an unrecoverable "locked" state with nothing to enter. Skip.
  if (record?.mode === 'none') return;
  closeDatabase();
  unlockedKeyHex = null;
}

export async function reEnrol(args: {
  currentPrfOutputB64: string;
  nextCredentialIdB64: string;
  nextSaltB64: string;
  nextPrfOutputB64: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!args.currentPrfOutputB64 || !args.nextPrfOutputB64) {
    return {
      ok: false,
      message: 'WebAuthn PRF extension is required and was not provided',
    };
  }
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (record.mode !== 'webauthn') {
    return { ok: false, message: 'Vault is not configured for WebAuthn' };
  }
  try {
    const currentKek = await importKekFromBytes(
      b64ToBuf(args.currentPrfOutputB64),
    );
    let dek: Buffer;
    try {
      dek = await aesDecrypt(
        currentKek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Current authenticator unwrap failed' };
    }
    const nextKek = await importKekFromBytes(b64ToBuf(args.nextPrfOutputB64));
    const wrapped = await aesEncrypt(nextKek, dek);
    const next: VaultRecord = {
      version: CURRENT_VAULT_VERSION,
      mode: 'webauthn',
      credentialIdB64: args.nextCredentialIdB64,
      saltB64: args.nextSaltB64,
      wrapIvB64: bufToB64(wrapped.iv),
      wrapCiphertextB64: bufToB64(wrapped.ciphertext),
    };
    writeVault(next);
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function reEnrolPin(args: {
  currentPin: string;
  nextPin: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const currentValidation = validatePin(args.currentPin);
  if (!currentValidation.ok) return currentValidation;
  const nextValidation = validatePin(args.nextPin);
  if (!nextValidation.ok) return nextValidation;
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (record.mode !== 'pin') {
    return { ok: false, message: 'Vault is not configured for PIN' };
  }
  try {
    const currentKek = await deriveKekFromPin(
      args.currentPin,
      b64ToBuf(record.kdfSaltB64),
      record.kdfIterations,
    );
    let dek: Buffer;
    try {
      dek = await aesDecrypt(
        currentKek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Current PIN is incorrect' };
    }
    const nextSalt = randomBytes(PBKDF2_SALT_BYTES);
    const nextKek = await deriveKekFromPin(
      args.nextPin,
      nextSalt,
      PBKDF2_ITERATIONS,
    );
    const wrapped = await aesEncrypt(nextKek, dek);
    const next: VaultRecord = {
      version: CURRENT_VAULT_VERSION,
      mode: 'pin',
      kdfSaltB64: bufToB64(nextSalt),
      kdfIterations: PBKDF2_ITERATIONS,
      wrapIvB64: bufToB64(wrapped.iv),
      wrapCiphertextB64: bufToB64(wrapped.ciphertext),
    };
    writeVault(next);
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function setupPassphrase(args: {
  phrase: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const validation = validatePassphrase(args.phrase);
  if (!validation.ok) return validation;
  if (isVaultConfigured()) {
    return { ok: false, message: 'Vault already configured' };
  }
  try {
    const dek = randomBytes(KEY_LEN_BYTES);
    const kdfSalt = randomBytes(PBKDF2_SALT_BYTES);
    const kek = await deriveKekFromPassphrase(
      args.phrase,
      kdfSalt,
      PBKDF2_ITERATIONS,
    );
    const wrapped = await aesEncrypt(kek, dek);
    const record: VaultRecord = {
      version: CURRENT_VAULT_VERSION,
      mode: 'passphrase',
      kdfSaltB64: bufToB64(kdfSalt),
      kdfIterations: PBKDF2_ITERATIONS,
      wrapIvB64: bufToB64(wrapped.iv),
      wrapCiphertextB64: bufToB64(wrapped.ciphertext),
    };
    writeVault(record);
    const hex = bytesToHex(dek);
    openDatabase(hex);
    unlockedKeyHex = hex;
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function unlockPassphrase(args: {
  phrase: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const validation = validatePassphrase(args.phrase);
  if (!validation.ok) {
    return { ok: false, message: 'Incorrect passphrase' };
  }
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (record.mode !== 'passphrase') {
    return { ok: false, message: 'Vault is not configured for passphrase' };
  }
  try {
    const kek = await deriveKekFromPassphrase(
      args.phrase,
      b64ToBuf(record.kdfSaltB64),
      record.kdfIterations,
    );
    let dek: Buffer;
    try {
      dek = await aesDecrypt(
        kek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Incorrect passphrase' };
    }
    const hex = bytesToHex(dek);
    openDatabase(hex);
    unlockedKeyHex = hex;
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function reEnrolPassphrase(args: {
  currentPhrase: string;
  nextPhrase: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const currentValidation = validatePassphrase(args.currentPhrase);
  if (!currentValidation.ok) {
    return { ok: false, message: 'Current passphrase is incorrect' };
  }
  const nextValidation = validatePassphrase(args.nextPhrase);
  if (!nextValidation.ok) return nextValidation;
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (record.mode !== 'passphrase') {
    return { ok: false, message: 'Vault is not configured for passphrase' };
  }
  try {
    const currentKek = await deriveKekFromPassphrase(
      args.currentPhrase,
      b64ToBuf(record.kdfSaltB64),
      record.kdfIterations,
    );
    let dek: Buffer;
    try {
      dek = await aesDecrypt(
        currentKek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Current passphrase is incorrect' };
    }
    const nextSalt = randomBytes(PBKDF2_SALT_BYTES);
    const nextKek = await deriveKekFromPassphrase(
      args.nextPhrase,
      nextSalt,
      PBKDF2_ITERATIONS,
    );
    const wrapped = await aesEncrypt(nextKek, dek);
    const next: VaultRecord = {
      version: CURRENT_VAULT_VERSION,
      mode: 'passphrase',
      kdfSaltB64: bufToB64(nextSalt),
      kdfIterations: PBKDF2_ITERATIONS,
      wrapIvB64: bufToB64(wrapped.iv),
      wrapCiphertextB64: bufToB64(wrapped.ciphertext),
    };
    writeVault(next);
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function revoke(): Promise<void> {
  // lock() is a no-op for mode='none', but a revoke must always close the
  // open DB handle — otherwise a subsequent setup would early-return out of
  // openDatabase/openDatabasePlain with a stale handle pointing at deleted files.
  closeDatabase();
  unlockedKeyHex = null;
  const dbPath = getDbPath();
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      await unlink(path);
    } catch (cause) {
      if (
        !(cause instanceof Error) ||
        (cause as NodeJS.ErrnoException).code !== 'ENOENT'
      ) {
        throw cause;
      }
    }
  }
  deleteVault();
}
