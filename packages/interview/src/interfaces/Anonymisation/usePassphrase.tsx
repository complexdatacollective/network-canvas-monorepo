'use client';

import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import {
  getPassphrase,
  getPassphraseInvalid,
  setPassphrase as setPassphraseAction,
  setPassphraseInvalid as setPassphraseInvalidAction,
  setShowPassphrasePrompter,
  showPassphrasePrompter,
} from '../../store/modules/ui';

export const usePassphrase = () => {
  const dispatch = useDispatch();

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

  const setPassphrase = useCallback(
    (newPassphrase: string) => {
      dispatch(setShowPassphrasePrompter(false));

      dispatch(setPassphraseAction(newPassphrase));
    },
    [dispatch],
  );

  const setPassphraseInvalid = useCallback(
    (state: boolean) => {
      dispatch(setPassphraseInvalidAction(state));
    },
    [dispatch],
  );

  return {
    passphrase,
    passphraseInvalid,
    setPassphrase,
    requirePassphrase,
    showPassphrasePrompter: showPrompter,
    setPassphraseInvalid,
  };
};
