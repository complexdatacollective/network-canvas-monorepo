'use client';

import { useId } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import type { DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';
import Overlay from './Overlay';

type PassphraseOverlayProps = {
  show: boolean;
  onAccepted: () => void;
  onClose: () => void;
  finalFocus?: DialogProps['finalFocus'];
};

/**
 * Asks for the passphrase and puts it in force, if it unlocks what the
 * interview already holds. Opened from inside another modal, it is nested in
 * that modal and stays usable over it.
 */
export default function PassphraseOverlay(props: PassphraseOverlayProps) {
  return (
    <FormStoreProvider>
      <PassphraseOverlayContent {...props} />
    </FormStoreProvider>
  );
}

function PassphraseOverlayContent({
  show,
  onAccepted,
  onClose,
  finalFocus,
}: PassphraseOverlayProps) {
  const intl = useAppIntl();
  // Closing while a passphrase is being checked would still put it in force.
  const isSubmitting = useFormStore((state) => state.isSubmitting);
  const { passphraseInvalid, submitPassphrase } = usePassphrase();
  const formId = useId();

  const onSubmitForm: FormSubmitHandler = async ({ passphrase }) => {
    if (typeof passphrase !== 'string') {
      return {
        success: false,
        formErrors: [createMessageError(messages.submissionFailed)],
      };
    }

    // A passphrase that cannot unlock what is already saved is turned away
    // here, with the reason under the field, rather than being put in force.
    if (!(await submitPassphrase(passphrase))) {
      return {
        success: false,
        fieldErrors: {
          passphrase: [createMessageError(messages.passphraseIncorrect)],
        },
      };
    }

    onAccepted();
    return { success: true };
  };

  return (
    <Overlay
      show={show}
      title={intl.formatMessage(messages.enterPassphrase)}
      onClose={onClose}
      finalFocus={finalFocus}
      dismissible={!isSubmitting}
      footer={
        <SubmitButton form={formId}>
          <AppMessage message={messages.submitPassphrase} />
        </SubmitButton>
      }
    >
      <div className="flex flex-col">
        {passphraseInvalid && (
          <p className="bg-accent/50 rounded p-6 text-white">
            <AppMessage message={messages.decryptFailed} />
          </p>
        )}
        <p>
          <AppMessage message={messages.passphraseHelp} />
        </p>
        <FormWithoutProvider
          id={formId}
          className="mt-6"
          onSubmit={onSubmitForm}
        >
          <Field
            component={PasswordField}
            name="passphrase"
            label={intl.formatMessage(messages.passphrase)}
            placeholder={intl.formatMessage(messages.passphrasePlaceholder)}
            required
            autoFocus
            suppressPasswordManager
          />
        </FormWithoutProvider>
      </div>
    </Overlay>
  );
}
