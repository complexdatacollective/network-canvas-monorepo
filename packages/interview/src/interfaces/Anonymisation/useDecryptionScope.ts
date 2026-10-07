'use client';

import { useEffect, useReducer } from 'react';
import { useSelector, useStore } from 'react-redux';

import { getEncryptionKeyId } from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import {
  type DecryptionScope,
  decryptInScope,
  type EncryptedValue,
  getDecryptionScope,
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
