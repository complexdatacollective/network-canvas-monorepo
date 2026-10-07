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
 */
export type DecryptionScope = {
  readonly passphrase: string;
  readonly plaintexts: Map<string, string>;
  readonly pending: Map<string, Promise<string>>;
};

type PassphraseStore = {
  getState: () => { ui: { passphrase: string | null } };
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
  const current = store.getState().ui.passphrase;
  if (!passphrase || current !== passphrase) {
    return undefined;
  }

  const existing = scopes.get(store.getState);
  if (existing?.passphrase === passphrase) {
    return existing;
  }

  const scope: DecryptionScope = {
    passphrase,
    plaintexts: new Map(),
    pending: new Map(),
  };
  scopes.set(store.getState, scope);

  const unsubscribe = store.subscribe(() => {
    if (store.getState().ui.passphrase === passphrase) return;
    if (scopes.get(store.getState) === scope) {
      scopes.delete(store.getState);
    }
    scope.plaintexts.clear();
    scope.pending.clear();
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
 * Decrypts with the scope's passphrase. Only a successful decryption is kept;
 * a failure rejects every time, so a wrong passphrase is never remembered as
 * if it had produced a value.
 */
export function decryptInScope(
  scope: DecryptionScope,
  value: EncryptedValue,
): Promise<string> {
  const key = valueKey(value);
  const cached = scope.plaintexts.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = scope.pending.get(key);
  if (inFlight) return inFlight;

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
