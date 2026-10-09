'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import { useSelector, useStore } from 'react-redux';

import { getEncryptionKeyId } from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import {
  type DecryptionScope,
  decryptInScope,
  type EncryptedValue,
  getDecryptionScope,
  type OutcomeOf,
  readCachedOutcome,
} from './decryptionScope';

/** The decryption scope of this interview's key, while one is in force. */
export function useDecryptionScope() {
  const store = useStore<RootState>();
  // Subscribed so that a component re-renders when the key in force changes.
  useSelector(getEncryptionKeyId);
  return getDecryptionScope(store.getState);
}

/**
 * The decryption scope of this interview's key once every one of `values`
 * has been decrypted in it; `undefined` until then, and while no key is in
 * force. Meanwhile it decrypts them and re-renders when they are, but never
 * asks for the passphrase. Pass a memoized list: a new array on every render
 * restarts the work.
 */
export function useDecryptedScope(
  values: readonly EncryptedValue[],
): DecryptionScope | undefined {
  const scope = useDecryptionScope();
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  const decrypted =
    scope !== undefined &&
    values.every((value) => readCachedOutcome(scope, value) !== undefined);

  useEffect(() => {
    if (!scope || decrypted) return undefined;

    let current = true;
    void Promise.all(values.map((value) => decryptInScope(scope, value))).then(
      () => {
        if (current) rerender();
      },
    );
    return () => {
      current = false;
    };
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
 * passphrase. The function is replaced whenever one of them settles or the key
 * in force changes, so whatever was computed with it knows to read again; it
 * reads the key's decryption scope on every call rather than keeping any
 * plaintext. Pass a memoized list: a new array on every render restarts the
 * work.
 */
export function useDecryptedOutcomes(
  values: readonly EncryptedValue[],
): OutcomeOf {
  const scope = useDecryptionScope();
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const settled = scope
    ? values.filter((value) => readCachedOutcome(scope, value)).length
    : 0;

  const [reader, setReader] = useState(() => ({
    scope,
    settled,
    read: outcomesIn(scope),
  }));

  // Replaced during render, so nothing reads through the previous key's scope
  // or keeps what it read before another answer decrypted.
  const current =
    reader.scope === scope && reader.settled === settled
      ? reader
      : { scope, settled, read: outcomesIn(scope) };
  if (current !== reader) setReader(current);

  useEffect(() => {
    if (!scope) return undefined;

    const pending = values.filter((value) => !readCachedOutcome(scope, value));
    // Another component may have decrypted one between this render and now.
    if (values.length - pending.length !== settled) rerender();

    let live = true;
    for (const value of pending) {
      void decryptInScope(scope, value).then(() => {
        if (live) rerender();
      });
    }
    return () => {
      live = false;
    };
  }, [scope, values, settled]);

  return current.read;
}
