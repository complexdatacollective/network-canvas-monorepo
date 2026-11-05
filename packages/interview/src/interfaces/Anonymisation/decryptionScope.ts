import { hash as objectHash } from 'ohash';
import { v4 as uuid } from 'uuid';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { decryptValue, type EncryptedBytes } from './encryptionFormat';

/**
 * The interview's encryption key, and the plaintext it has produced, are only
 * ever held inside a scope bound to one store. The scope is in force while the
 * store's `ui.encryptionKeyId` names it; as soon as it does not, the scope is
 * discarded and its contents cleared. It is unreachable from any other store,
 * so plaintext cannot outlive the key that produced it or be served to an
 * interview that has not unlocked it. Nothing here is ever put in Redux state
 * or persisted.
 *
 * Each outcome recorded replaces the scope in force with a copy that shares
 * its key and plaintext, so whatever was computed from the previous copy (a
 * render, or a memoized value) knows to read it again.
 */
export type DecryptionScope = {
  readonly id: string;
  readonly key: CryptoKey;
  readonly outcomes: Map<string, DecryptOutcome>;
  readonly pending: Map<string, Promise<DecryptOutcome>>;
};

export type DecryptOutcome =
  | { readable: true; plaintext: string }
  | { readable: false };

type KeyState = { ui: { encryptionKeyId: string | null } };
type GetKeyState = () => KeyState;

/** A stored ciphertext, with the node and variable it is bound to. */
export type EncryptedValue = EncryptedBytes & {
  nodeId: string;
  variableId: string;
};

/** The outcome of decrypting a value, once it is known. */
export type OutcomeOf = (value: EncryptedValue) => DecryptOutcome | undefined;

/**
 * Why a stored ciphertext can never be shown: written by schema 8's
 * experimental per-value format, stored without the metadata to decrypt it,
 * or refused by the interview's key.
 */
export type UnreadableReason =
  | 'legacy-format'
  | 'missing-metadata'
  | 'decryption-failed';

export type StoredEncryptedAttribute =
  | { status: 'encrypted'; value: EncryptedValue }
  | { status: 'unreadable'; reason: UnreadableReason };

// Keyed by the store's `getState`, which Redux hands unchanged to middleware
// and thunks, so a write made inside a thunk reaches the same scope.
const scopes = new WeakMap<GetKeyState, DecryptionScope>();
// Told each time the scope in force records an outcome.
const listeners = new WeakMap<GetKeyState, Set<() => void>>();
// The store each scope belongs to, shared by every copy of it.
const owners = new WeakMap<DecryptionScope['outcomes'], GetKeyState>();

function discard(getState: GetKeyState, scope: DecryptionScope) {
  if (scopes.get(getState)?.id === scope.id) scopes.delete(getState);
  scope.outcomes.clear();
  scope.pending.clear();
}

/** Puts a fresh copy of `scope` in force, if it still is, and says so. */
function republish(scope: DecryptionScope) {
  const getState = owners.get(scope.outcomes);
  if (!getState) return;
  const current = scopes.get(getState);
  if (current?.id !== scope.id) return;
  scopes.set(getState, { ...current });
  for (const listener of listeners.get(getState) ?? []) listener();
}

/**
 * Calls `listener` whenever the scope in force in `store` may have changed: a
 * key put in force or discarded, or an outcome recorded.
 */
export function subscribeToDecryptionScope(
  store: {
    getState: GetKeyState;
    subscribe: (listener: () => void) => () => void;
  },
  listener: () => void,
): () => void {
  const own = listeners.get(store.getState) ?? new Set();
  listeners.set(store.getState, own);
  own.add(listener);
  const unsubscribe = store.subscribe(listener);
  return () => {
    own.delete(listener);
    unsubscribe();
  };
}

/**
 * Binds `key` to the store. The scope is not in force until the store's
 * `ui.encryptionKeyId` is set to the returned scope's id.
 */
export function createDecryptionScope(
  getState: GetKeyState,
  key: CryptoKey,
): DecryptionScope {
  const previous = scopes.get(getState);
  if (previous) discard(getState, previous);

  const scope: DecryptionScope = {
    id: uuid(),
    key,
    outcomes: new Map(),
    pending: new Map(),
  };
  scopes.set(getState, scope);
  owners.set(scope.outcomes, getState);
  return scope;
}

/**
 * Discards the scope as soon as the store stops naming it, rather than when
 * it is next asked for.
 */
export function watchDecryptionScope(
  store: {
    getState: GetKeyState;
    subscribe: (listener: () => void) => () => void;
  },
  scope: DecryptionScope,
): void {
  const unsubscribe = store.subscribe(() => {
    if (store.getState().ui.encryptionKeyId === scope.id) return;
    discard(store.getState, scope);
    unsubscribe();
  });
}

/** The scope of the key in force in this store, if one is. */
export function getDecryptionScope(
  getState: GetKeyState,
): DecryptionScope | undefined {
  const scope = scopes.get(getState);
  if (!scope) return undefined;
  if (getState().ui.encryptionKeyId !== scope.id) {
    discard(getState, scope);
    return undefined;
  }
  return scope;
}

export function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'number')
  );
}

/**
 * The stored ciphertext of an attribute, or why it can never be read.
 * Undefined when the attribute is stored as plaintext, such as a value
 * written without encryption (e.g. external data).
 *
 * A node records how it encrypted each value it holds, and writing a value in
 * the clear removes that record, so bytes with a record are ciphertext
 * whatever the codebook says: a protocol re-imported without its encryption
 * leaves values stored encrypted under variables it no longer marks. Bytes
 * without a record are ciphertext that lost it only under a variable the
 * codebook encrypts; anywhere else they are a plaintext answer, such as a
 * categorical one.
 */
export function readEncryptedAttribute(
  node: NcNode,
  variableId: string,
  variables: Record<string, Variable>,
): StoredEncryptedAttribute | undefined {
  const data = node[entityAttributesProperty][variableId];
  if (!isNumberArray(data)) return undefined;

  const records = node[entitySecureAttributesMeta];
  // Own records only: an attribute named like an Object method has none.
  const secure =
    records && Object.hasOwn(records, variableId)
      ? records[variableId]
      : undefined;
  if (!secure) {
    return variables[variableId]?.encrypted
      ? { status: 'unreadable', reason: 'missing-metadata' }
      : undefined;
  }
  if (secure.salt) return { status: 'unreadable', reason: 'legacy-format' };

  return {
    status: 'encrypted',
    value: {
      nodeId: node[entityPrimaryKeyProperty],
      variableId,
      iv: secure.iv,
      data,
    },
  };
}

// The node and variable are part of the key: a ciphertext copied to another
// node or variable must never be served the plaintext it had where it was.
const valueKey = (value: EncryptedValue) => objectHash(value);

/**
 * Records the plaintext of values just encrypted for `nodeId` with the
 * scope's key, so the interview can show what it saved without decrypting it
 * again.
 */
export function rememberEncryptedWrite(
  scope: DecryptionScope,
  nodeId: string,
  plaintext: Readonly<Record<string, unknown>>,
  stored: Readonly<Record<string, unknown>>,
  secureAttributes: Readonly<Record<string, { iv: number[] }>>,
): void {
  for (const [variableId, { iv }] of Object.entries(secureAttributes)) {
    const value = plaintext[variableId];
    const data = stored[variableId];
    if (typeof value !== 'string' || !isNumberArray(data)) continue;
    scope.outcomes.set(valueKey({ nodeId, variableId, iv, data }), {
      readable: true,
      plaintext: value,
    });
  }
  republish(scope);
}

export function readCachedOutcome(
  scope: DecryptionScope,
  value: EncryptedValue,
): DecryptOutcome | undefined {
  return scope.outcomes.get(valueKey(value));
}

/**
 * Decrypts with the scope's key. The key was verified when it was put in
 * force, so a value it cannot decrypt never will be: that outcome is kept like
 * a plaintext, and nothing asks for the passphrase again because of it.
 */
export function decryptInScope(
  scope: DecryptionScope,
  value: EncryptedValue,
): Promise<DecryptOutcome> {
  const key = valueKey(value);
  const cached = scope.outcomes.get(key);
  if (cached) return Promise.resolve(cached);

  const inFlight = scope.pending.get(key);
  if (inFlight) return inFlight;

  const decryption = decryptValue(scope.key, value, value).then(
    (plaintext): DecryptOutcome => ({ readable: true, plaintext }),
    (): DecryptOutcome => ({ readable: false }),
  );
  const settled = decryption.then((outcome) => {
    // A scope discarded meanwhile has had `pending` cleared, so its outcome
    // is not written back into it.
    if (scope.pending.get(key) === settled) {
      scope.pending.delete(key);
      scope.outcomes.set(key, outcome);
      republish(scope);
    }
    return outcome;
  });
  scope.pending.set(key, settled);
  return settled;
}
