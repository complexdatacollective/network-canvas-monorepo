'use client';

import { KeyRound } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { AppMessage } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';
import PassphraseOverlay from './PassphraseOverlay';

/**
 * Asks for the passphrase from inside a modal that keeps answers the
 * passphrase protects. The navigation's prompter cannot be reached while a
 * modal is open, and leaving the modal discards what it kept, so a save it
 * refused for want of a working passphrase could otherwise never be retried.
 * Offered only while there is no working passphrase.
 */
export default function PassphraseRecovery() {
  const { passphrase, passphraseInvalid } = usePassphrase();
  const [showOverlay, setShowOverlay] = useState(false);
  const closeOverlay = useCallback(() => setShowOverlay(false), []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // A passphrase that is accepted takes this button away, so focus goes to
  // the save it was needed for, ready to try again.
  const returnFocus = useCallback(
    () => triggerRef.current ?? submitControlOf(formRef.current),
    [],
  );

  return (
    <>
      {(!passphrase || passphraseInvalid) && (
        <Button
          ref={triggerRef}
          className="mb-8"
          icon={<KeyRound aria-hidden />}
          onClick={(event) => {
            formRef.current = event.currentTarget.form;
            setShowOverlay(true);
          }}
        >
          <AppMessage message={messages.enterPassphrase} />
        </Button>
      )}
      <PassphraseOverlay
        show={showOverlay}
        onAccepted={closeOverlay}
        onClose={closeOverlay}
        finalFocus={returnFocus}
      />
    </>
  );
}

function submitControlOf(form: HTMLFormElement | null) {
  for (const control of Array.from(form?.elements ?? [])) {
    if (control instanceof HTMLButtonElement && control.type === 'submit') {
      return control;
    }
  }
  return null;
}
