'use client';

import { useCallback } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import {
  setShowPassphrasePrompter,
  showPassphrasePrompter,
} from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import { unlockEncryption } from './unlockEncryption';
import { useDecryptionScope } from './useDecryptionScope';

const hasEncryptionHeader = (state: RootState) =>
  state.session.network.encryption !== undefined;

export const usePassphrase = () => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();

  const unlocked = useDecryptionScope() !== undefined;
  const passphraseChosen = useSelector(hasEncryptionHeader);
  const showPrompter = useSelector(showPassphrasePrompter);

  const requirePassphrase = useCallback(() => {
    if (unlocked) {
      if (showPrompter) {
        dispatch(setShowPassphrasePrompter(false));
      }
      return;
    }

    if (!showPrompter) {
      dispatch(setShowPassphrasePrompter(true));
    }
  }, [unlocked, dispatch, showPrompter]);

  /**
   * Derives the key from `candidate` and puts it in force: the first
   * passphrase of an interview creates its encryption header, and any later
   * one must match it. Resolves to whether it was accepted.
   */
  const submitPassphrase = useCallback(
    async (candidate: string) => {
      const accepted = await unlockEncryption(store, candidate);
      if (accepted) dispatch(setShowPassphrasePrompter(false));
      return accepted;
    },
    [store, dispatch],
  );

  return {
    /** Whether the interview's encryption key is in force. */
    unlocked,
    /**
     * Whether a passphrase has been chosen for this interview, so that one
     * entered now is checked against it rather than becoming it.
     */
    passphraseChosen,
    submitPassphrase,
    requirePassphrase,
    showPassphrasePrompter: showPrompter,
  };
};
