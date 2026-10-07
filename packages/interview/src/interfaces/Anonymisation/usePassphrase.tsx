'use client';

import { useCallback } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { getShouldEncryptNames } from '../../store/modules/protocol';
import {
  getPassphrase,
  getPassphraseInvalid,
  setPassphrase as setPassphraseAction,
  setPassphraseInvalid as setPassphraseInvalidAction,
  setShowPassphrasePrompter,
  showPassphrasePrompter,
} from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import { passphraseUnlocksNetwork } from './verifyPassphrase';

export const usePassphrase = () => {
  const dispatch = useDispatch();

  const isEnabled = useSelector(getShouldEncryptNames);

  const passphrase = useSelector(getPassphrase);
  const passphraseInvalid = useSelector(getPassphraseInvalid);
  const showPrompter = useSelector(showPassphrasePrompter);

  const requirePassphrase = useCallback(() => {
    if (passphrase) {
      if (showPrompter) {
        dispatch(setShowPassphrasePrompter(false));
      }

      return passphrase;
    }

    if (!showPrompter) {
      dispatch(setShowPassphrasePrompter(true));
    }
    return undefined;
  }, [passphrase, dispatch, showPrompter]);

  const store = useStore<RootState>();

  /**
   * Puts `candidate` in force only if it unlocks the data this interview
   * already holds, so a mistyped passphrase is turned away at entry instead of
   * being used to encrypt new answers that could then never be read alongside
   * the old ones. Resolves to whether it was accepted.
   */
  const submitPassphrase = useCallback(
    async (candidate: string) => {
      const state = store.getState();
      const accepted = await passphraseUnlocksNetwork(
        state.session.network.nodes,
        state.protocol.codebook,
        candidate,
        getShouldEncryptNames(state),
      );
      if (!accepted) return false;

      dispatch(setShowPassphrasePrompter(false));
      dispatch(setPassphraseAction(candidate));
      return true;
    },
    [store, dispatch],
  );

  const setPassphraseInvalid = useCallback(
    (state: boolean) => {
      dispatch(setPassphraseInvalidAction(state));
    },
    [dispatch],
  );

  return {
    isEnabled,
    passphrase,
    passphraseInvalid,
    submitPassphrase,
    requirePassphrase,
    showPassphrasePrompter: showPrompter,
    setPassphraseInvalid,
  };
};
