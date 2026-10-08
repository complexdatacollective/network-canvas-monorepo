'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import { useSelector, useStore } from 'react-redux';

import { getPassphrase, getPassphraseEntry } from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import {
  type DecryptionScope,
  decryptInScope,
  type EncryptedValue,
  getDecryptionScope,
  type OutcomeOf,
  readCachedOutcome,
} from './decryptionScope';

/** The decryption scope for this interview's passphrase, if one is set. */
export function useDecryptionScope() {
  const store = useStore<RootState>();
  const passphrase = useSelector(getPassphrase);
  // Renders again when a passphrase is entered, even the one in force, since
  // each entry gets its own scope.
  useSelector(getPassphraseEntry);
  return getDecryptionScope(store, passphrase);
}

const outcomesIn =
  (scope: DecryptionScope | undefined): OutcomeOf =>
  (value) =>
    scope ? readCachedOutcome(scope, value) : undefined;

/**
 * The outcome of decrypting each value with this interview's passphrase, as
 * far as it is known when asked. It decrypts nothing, and reads the
 * passphrase's decryption scope on every call rather than keeping any
 * plaintext, so a function that runs later (an event handler) reads what is
 * shown then.
 */
export function useCachedOutcomes(): OutcomeOf {
  const scope = useDecryptionScope();
  return useMemo(() => outcomesIn(scope), [scope]);
}

/**
 * The outcome of decrypting each of `values` with this interview's
 * passphrase, as far as it is known. Meanwhile it decrypts them, but never
 * asks for the passphrase. The function is replaced whenever one of them
 * settles or the passphrase in force changes, so whatever was computed with
 * it knows to read again. Pass a memoized list: a new array on every render
 * restarts the work.
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

  // Replaced during render, so nothing reads through the previous
  // passphrase's scope or keeps what it read before another answer settled.
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
    const settle = () => {
      if (live) rerender();
    };
    for (const value of pending) {
      decryptInScope(scope, value).then(settle, settle);
    }
    return () => {
      live = false;
    };
  }, [scope, values, settled]);

  return current.read;
}
