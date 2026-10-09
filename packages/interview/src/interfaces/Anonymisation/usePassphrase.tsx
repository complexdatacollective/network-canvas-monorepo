'use client';

import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { runtimeMessages } from '../../i18n/runtimeMessages';
import {
  setShowPassphrasePrompter,
  showPassphrasePrompter,
} from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import { isUsableEncryptionHeader } from './encryptionFormat';
import { unlockEncryption } from './unlockEncryption';
import { useDecryptionScope } from './useDecryptionScope';
import { useReportUnreadable } from './useReportUnreadable';

const hasEncryptionHeader = (state: RootState) =>
  state.session.network.encryption !== undefined;

const hasRefusedEncryptionHeader = (state: RootState) => {
  const header = state.session.network.encryption;
  return header !== undefined && !isUsableEncryptionHeader(header);
};

export const usePassphrase = () => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const reportUnreadable = useReportUnreadable();

  const unlocked = useDecryptionScope() !== undefined;
  const passphraseChosen = useSelector(hasEncryptionHeader);
  const encryptionUnavailable = useSelector(hasRefusedEncryptionHeader);
  const showPrompter = useSelector(showPassphrasePrompter);

  useEffect(() => {
    if (encryptionUnavailable) reportUnreadable('refused-header');
  }, [encryptionUnavailable, reportUnreadable]);

  const requirePassphrase = useCallback(() => {
    // No passphrase can open a refused header, so none is asked for: the
    // prompter would turn every one away.
    if (unlocked || encryptionUnavailable) {
      if (showPrompter) {
        dispatch(setShowPassphrasePrompter(false));
      }
      return;
    }

    if (!showPrompter) {
      dispatch(setShowPassphrasePrompter(true));
    }
  }, [unlocked, encryptionUnavailable, dispatch, showPrompter]);

  /**
   * Derives the key from `candidate` and puts it in force: the first
   * passphrase of an interview creates its encryption header, and any later
   * one must match it. Resolves to how the attempt ended.
   */
  const unlock = useCallback(
    async (candidate: string) => {
      const outcome = await unlockEncryption(store, candidate);
      if (outcome === 'chosen' || outcome === 'verified') {
        dispatch(setShowPassphrasePrompter(false));
      }
      return outcome;
    },
    [store, dispatch],
  );

  /** As `unlock`, resolving to whether the passphrase was accepted. */
  const submitPassphrase = useCallback(
    async (candidate: string) => {
      const outcome = await unlock(candidate);
      return outcome === 'chosen' || outcome === 'verified';
    },
    [unlock],
  );

  return {
    /** Whether the interview's encryption key is in force. */
    unlocked,
    /**
     * Whether a passphrase has been chosen for this interview, so that one
     * entered now is checked against it rather than becoming it.
     */
    passphraseChosen,
    /**
     * Whether the interview's encryption header is outside the runtime's
     * bounds, so no passphrase can open its protected answers: they are
     * unavailable for the rest of the interview, and none is asked for.
     */
    encryptionUnavailable,
    /** What to show in place of protected answers while they are locked. */
    lockedNotice: encryptionUnavailable
      ? runtimeMessages.protectedAnswersUnavailable
      : runtimeMessages.protectedAnswersLocked,
    unlock,
    submitPassphrase,
    requirePassphrase,
    showPassphrasePrompter: showPrompter,
  };
};
