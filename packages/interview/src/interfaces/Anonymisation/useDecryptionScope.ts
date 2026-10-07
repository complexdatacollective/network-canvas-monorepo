'use client';

import { useSelector, useStore } from 'react-redux';

import { getPassphrase } from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import { getDecryptionScope } from './decryptionScope';

/** The decryption scope for this interview's passphrase, if one is set. */
export function useDecryptionScope() {
  const store = useStore<RootState>();
  const passphrase = useSelector(getPassphrase);
  return getDecryptionScope(store, passphrase);
}
