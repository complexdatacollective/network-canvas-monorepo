'use client';

import { useCallback } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { runtimeMessages } from '../../i18n/runtimeMessages';
import {
  setShowPassphrasePrompter,
  showPassphrasePrompter,
} from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import { hasCheckableValue, unlockEncryption } from './unlockEncryption';
import { useDecryptionScope } from './useDecryptionScope';

export const usePassphrase = () => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();

  const unlocked = useDecryptionScope() !== undefined;
  const passphraseChosen = useSelector(hasCheckableValue);
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
   * Derives the key from `candidate` and puts it in force: the passphrase is
   * checked against the answers the interview has already encrypted, and
   * becomes the interview's when there are none. Resolves to how the attempt
   * ended.
   */
  const unlock = useCallback(
    async (candidate: string) => {
      const outcome = await unlockEncryption(store, candidate);
      if (outcome !== 'incorrect') {
        dispatch(setShowPassphrasePrompter(false));
      }
      return outcome;
    },
    [store, dispatch],
  );

  /** As `unlock`, resolving to whether the passphrase was accepted. */
  const submitPassphrase = useCallback(
    async (candidate: string) => (await unlock(candidate)) !== 'incorrect',
    [unlock],
  );

  return {
    /** Whether the interview's encryption key is in force. */
    unlocked,
    /**
     * Whether the interview already holds answers encrypted with its
     * passphrase, so that one entered now is checked against them rather
     * than becoming the interview's.
     */
    passphraseChosen,
    /** What to show in place of protected answers while they are locked. */
    lockedNotice: runtimeMessages.protectedAnswersLocked,
    unlock,
    submitPassphrase,
    requirePassphrase,
    showPassphrasePrompter: showPrompter,
  };
};
