'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useStore } from 'react-redux';

import type { RootState } from '../../store/store';
import {
  type DecryptionScope,
  decryptInScope,
  type EncryptedValue,
  getDecryptionScope,
  type OutcomeOf,
  readCachedOutcome,
  subscribeToDecryptionScope,
} from './decryptionScope';

/**
 * The decryption scope of this interview's key, while one is in force. It is
 * read only through this subscription, and replaced whenever a key is put in
 * force or an outcome is recorded, so nothing computed from it (by a render,
 * or by the React Compiler's memoization) outlives what it read.
 */
export function useDecryptionScope() {
  const store = useStore<RootState>();
  const subscribe = useCallback(
    (listener: () => void) => subscribeToDecryptionScope(store, listener),
    [store],
  );
  // oxlint-disable-next-line typescript/unbound-method -- the scope registry is keyed by this exact function, so it cannot be wrapped; Redux's getState does not read `this`
  const read = () => getDecryptionScope(store.getState);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * The decryption scope of this interview's key once every one of `values`
 * has been decrypted in it; `undefined` until then, and while no key is in
 * force. Meanwhile it decrypts them, but never asks for the passphrase. Pass
 * a memoized list: a new array on every render restarts the work.
 */
export function useDecryptedScope(
  values: readonly EncryptedValue[],
): DecryptionScope | undefined {
  const scope = useDecryptionScope();

  const decrypted =
    scope !== undefined &&
    values.every((value) => readCachedOutcome(scope, value) !== undefined);

  useEffect(() => {
    if (!scope || decrypted) return;
    for (const value of values) void decryptInScope(scope, value);
  }, [scope, decrypted, values]);

  return decrypted ? scope : undefined;
}

const outcomesIn =
  (scope: DecryptionScope | undefined): OutcomeOf =>
  (value) =>
    scope ? readCachedOutcome(scope, value) : undefined;

/**
 * The outcome of decrypting each value with this interview's key, as far as
 * it is known when asked. It decrypts nothing, and reads the key's decryption
 * scope on every call rather than keeping any plaintext, so a function that
 * runs later (an event handler) reads what is shown then.
 */
export function useCachedOutcomes(): OutcomeOf {
  const scope = useDecryptionScope();
  return useMemo(() => outcomesIn(scope), [scope]);
}

/**
 * The outcome of decrypting each of `values` with this interview's key, as
 * far as it is known. Meanwhile it decrypts them, but never asks for the
 * passphrase. The function is replaced with the scope, whenever an outcome is
 * recorded or the key in force changes, so whatever was computed with it
 * knows to read again; it reads the key's decryption scope on every call
 * rather than keeping any plaintext. Pass a memoized list: a new array on
 * every render restarts the work.
 */
export function useDecryptedOutcomes(
  values: readonly EncryptedValue[],
): OutcomeOf {
  const scope = useDecryptionScope();

  useEffect(() => {
    if (!scope) return;
    for (const value of values) void decryptInScope(scope, value);
  }, [scope, values]);

  return useMemo(() => outcomesIn(scope), [scope]);
}
