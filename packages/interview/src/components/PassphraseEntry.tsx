'use client';

import { KeyRound } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { AppMessage } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import {
  asFinalFocusTarget,
  resolveFinalFocus,
} from '@codaco/fresco-ui/utils/finalFocus';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';
import PassphraseOverlay from './PassphraseOverlay';

type PassphraseEntryProps = {
  /**
   * Whether saving the form needs the passphrase, which has not been entered:
   * `passphraseNeeded` from the form's validation network.
   */
  needed: boolean;
};

/**
 * Takes the passphrase from inside a modal form whose save needs it. The
 * navigation's prompter can't be reached while the modal is open, and leaving
 * the modal discards its answers, so a save refused for want of the
 * passphrase could otherwise never be retried. Render it whether or not it is
 * needed: the passphrase dialog it opens stays mounted to close once the
 * passphrase is accepted, which is when the button goes.
 */
export default function PassphraseEntry({ needed }: PassphraseEntryProps) {
  const { passphraseChosen } = usePassphrase();
  const [overlay, setOverlay] = useState({ show: false, choosing: false });
  const closeOverlay = useCallback(
    () => setOverlay((current) => ({ ...current, show: false })),
    [],
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // An accepted passphrase takes this button away, so focus goes to the save
  // it was needed for, ready to try again.
  const returnFocus = useCallback(
    () => resolveFinalFocus(triggerRef, () => submitControlOf(formRef.current)),
    [],
  );

  return (
    <>
      {needed && (
        <Button
          ref={triggerRef}
          className="mb-6"
          icon={<KeyRound aria-hidden />}
          onClick={(event) => {
            formRef.current = event.currentTarget.form;
            setOverlay({ show: true, choosing: !passphraseChosen });
          }}
        >
          <AppMessage message={messages.passphrase} />
        </Button>
      )}
      <PassphraseOverlay
        show={overlay.show}
        choosing={overlay.choosing}
        onAccepted={closeOverlay}
        onClose={closeOverlay}
        finalFocus={returnFocus}
      />
    </>
  );
}

/** The form's submit button, wherever it is placed in the dialog. */
function submitControlOf(form: HTMLFormElement | null) {
  for (const control of Array.from(form?.elements ?? [])) {
    const target = asFinalFocusTarget(control);
    if (target?.getAttribute('type') === 'submit') return target;
  }
  return null;
}
