'use client';

import { useSelector, useStore } from 'react-redux';

import { getPassphrase, getPassphraseEntry } from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import { getDecryptionScope } from './decryptionScope';

/** The decryption scope for this interview's passphrase, if one is set. */
export function useDecryptionScope() {
  const store = useStore<RootState>();
  const passphrase = useSelector(getPassphrase);
  // Renders again when a passphrase is entered, even the one in force, since
  // each entry gets its own scope.
  useSelector(getPassphraseEntry);
  return getDecryptionScope(store, passphrase);
}
