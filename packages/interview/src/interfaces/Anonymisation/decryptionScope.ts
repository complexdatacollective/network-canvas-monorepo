import { hash as objectHash } from 'ohash';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { isAttributeEncrypted } from './isAttributeEncrypted';
import { decryptData } from './utils';

/**
 * Decrypted plaintext is only ever held inside a scope bound to one store and
 * one passphrase. The scope is discarded, and its contents cleared, as soon as
 * that store's passphrase changes or is cleared, and it is unreachable from
 * any other store, so plaintext cannot outlive the passphrase that produced it
 * or be served to an interview that has not unlocked it.
 *
 * Each entry of the passphrase gets its own scope, even when the passphrase
 * entered is the one in force. A failure is recorded against the scope it
 * failed under, so entering the passphrase again makes every reader that
 * failed try again, and ask for the passphrase again if it still fails. The
 * new scope keeps what the old one decrypted, which is plaintext of the same
 * passphrase, but not what it failed to.
 */
export type DecryptionScope = {
  readonly passphrase: string;
  readonly entry: number;
  readonly plaintexts: Map<string, string>;
  readonly pending: Map<string, Promise<string>>;
  readonly failed: Set<string>;
};

/** What decrypting a value produced, once it is known. */
export type DecryptOutcome =
  | { readable: true; plaintext: string }
  | { readable: false };

/** The outcome of decrypting a value, once it is known. */
export type OutcomeOf = (value: EncryptedValue) => DecryptOutcome | undefined;

type PassphraseStore = {
  getState: () => {
    ui: { passphrase: string | null; passphraseEntry: number };
  };
  subscribe: (listener: () => void) => () => void;
};

export type EncryptedValue = {
  secureAttributes: { iv: number[]; salt: number[] };
  data: number[];
};

// Keyed by the store's `getState`, which Redux hands unchanged to middleware
// and thunks, so a write made inside a thunk can reach the same scope.
const scopes = new WeakMap<PassphraseStore['getState'], DecryptionScope>();

export function getDecryptionScope(
  store: PassphraseStore,
  passphrase: string | null,
): DecryptionScope | undefined {
  const { passphrase: current, passphraseEntry: entry } = store.getState().ui;
  if (!passphrase || current !== passphrase) {
    return undefined;
  }

  const existing = scopes.get(store.getState);
  if (existing?.passphrase === passphrase && existing.entry === entry) {
    return existing;
  }

  const enteredAgain = existing?.passphrase === passphrase;
  const scope: DecryptionScope = {
    passphrase,
    entry,
    plaintexts: enteredAgain ? existing.plaintexts : new Map(),
    pending: enteredAgain ? existing.pending : new Map(),
    failed: new Set(),
  };
  scopes.set(store.getState, scope);

  const unsubscribe = store.subscribe(() => {
    if (store.getState().ui.passphrase === passphrase) return;
    if (scopes.get(store.getState) === scope) {
      scopes.delete(store.getState);
    }
    scope.plaintexts.clear();
    scope.pending.clear();
    scope.failed.clear();
    unsubscribe();
  });

  return scope;
}

export function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'number')
  );
}

/**
 * The stored ciphertext for an attribute, or undefined when the attribute is
 * stored as plaintext: not encrypted in this interview (see
 * `isAttributeEncrypted`), written without encryption (e.g. external data), or
 * carrying metadata that does not describe a ciphertext.
 */
export function getEncryptedValue(
  node: NcNode,
  attributeId: string,
  variables: Record<string, Variable>,
  encryptionEnabled: boolean,
): EncryptedValue | undefined {
  if (!isAttributeEncrypted(encryptionEnabled, variables, attributeId)) {
    return undefined;
  }

  const secure = node[entitySecureAttributesMeta]?.[attributeId];
  const data = node[entityAttributesProperty][attributeId];
  if (!secure || !isNumberArray(data)) return undefined;

  return { secureAttributes: { iv: secure.iv, salt: secure.salt }, data };
}

const valueKey = (value: EncryptedValue) => objectHash(value);

/**
 * Records the plaintext of values just encrypted with `passphrase`, so the
 * interview can show what it saved without decrypting it again. Only an
 * existing scope for that same passphrase is written to.
 */
export function rememberEncryptedWrite(
  getState: PassphraseStore['getState'],
  passphrase: string,
  plaintext: Readonly<Record<string, unknown>>,
  stored: Readonly<Record<string, unknown>>,
  secureAttributes: Readonly<Record<string, { iv: number[]; salt: number[] }>>,
): void {
  const scope = scopes.get(getState);
  if (scope?.passphrase !== passphrase) return;

  for (const [attributeId, { iv, salt }] of Object.entries(secureAttributes)) {
    const value = plaintext[attributeId];
    const data = stored[attributeId];
    if (typeof value !== 'string' || !isNumberArray(data)) continue;
    scope.plaintexts.set(
      valueKey({ secureAttributes: { iv, salt }, data }),
      value,
    );
  }
}

export function readCachedPlaintext(
  scope: DecryptionScope,
  value: EncryptedValue,
): string | undefined {
  return scope.plaintexts.get(valueKey(value));
}

/**
 * What decrypting `value` in `scope` has produced so far: its plaintext, that
 * it failed, or `undefined` while it has not been tried or is still under way.
 * It decrypts nothing.
 */
export function readCachedOutcome(
  scope: DecryptionScope,
  value: EncryptedValue,
): DecryptOutcome | undefined {
  const key = valueKey(value);
  const plaintext = scope.plaintexts.get(key);
  if (plaintext !== undefined) return { readable: true, plaintext };
  return scope.failed.has(key) ? { readable: false } : undefined;
}

/**
 * Decrypts with the scope's passphrase. Only a successful decryption is kept
 * as a value; a failure rejects every time, so a wrong passphrase is never
 * remembered as if it had produced one. The failure is recorded against
 * `scope`, for `readCachedOutcome`, even when the decryption was begun under
 * an earlier entry of the same passphrase.
 */
export function decryptInScope(
  scope: DecryptionScope,
  value: EncryptedValue,
): Promise<string> {
  const key = valueKey(value);
  const cached = scope.plaintexts.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const decryption =
    scope.pending.get(key) ?? startDecryption(scope, key, value);
  // Registered before the caller's own handlers, so the failure is readable
  // by the time the caller hears of it.
  decryption.catch(() => {
    scope.failed.add(key);
  });
  return decryption;
}

function startDecryption(
  scope: DecryptionScope,
  key: string,
  value: EncryptedValue,
): Promise<string> {
  const decryption = decryptData(value, scope.passphrase).then(
    (plaintext) => {
      if (scope.pending.get(key) === decryption) {
        scope.pending.delete(key);
        scope.plaintexts.set(key, plaintext);
      }
      return plaintext;
    },
    (error: unknown) => {
      if (scope.pending.get(key) === decryption) {
        scope.pending.delete(key);
      }
      throw error;
    },
  );
  scope.pending.set(key, decryption);
  return decryption;
}
