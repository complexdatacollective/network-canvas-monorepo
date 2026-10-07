'use client';

import { useSelector, useStore } from 'react-redux';

import { getEncryptionKeyId } from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import { getDecryptionScope } from './decryptionScope';

/** The decryption scope of this interview's key, while one is in force. */
export function useDecryptionScope() {
  const store = useStore<RootState>();
  // Subscribed so that a component re-renders when the key in force changes.
  useSelector(getEncryptionKeyId);
  return getDecryptionScope(store.getState);
}
