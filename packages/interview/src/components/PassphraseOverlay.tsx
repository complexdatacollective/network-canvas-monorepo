'use client';

import { useId } from 'react';
import { useSelector } from 'react-redux';

import { createMessageError } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import type { DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import ResetFormWhenClosed from '@codaco/fresco-ui/form/ResetFormWhenClosed';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import PassphraseCheckStatus from '../interfaces/Anonymisation/PassphraseCheckStatus';
import { protocolPassphraseLengthRules } from '../interfaces/Anonymisation/passphraseRules';
import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';
import { interfaceMessages } from '../interfaces/messages';
import { getProtocolStages } from '../store/modules/protocol';
import Overlay from './Overlay';

type PassphraseOverlayProps = {
  show: boolean;
  /** Whether no passphrase has been chosen yet, so this one becomes it. */
  choosing: boolean;
  onAccepted: () => void;
  onClose: () => void;
  /** Where focus goes once the overlay has closed. */
  finalFocus?: DialogProps['finalFocus'];
};

/**
 * The dialog that takes the interview's passphrase, opened from the
 * navigation's prompter or from inside a modal form that needs it.
 *
 * Each opening starts empty: what was typed, and why it was turned away, go
 * as soon as the overlay closes rather than when its exit animation ends.
 */
export default function PassphraseOverlay(props: PassphraseOverlayProps) {
  return (
    <FormStoreProvider>
      <ResetFormWhenClosed open={props.show} />
      <PassphraseDialog {...props} />
    </FormStoreProvider>
  );
}

const PassphraseDialog = ({
  show,
  choosing,
  onAccepted,
  onClose,
  finalFocus,
}: PassphraseOverlayProps) => {
  const intl = useAppIntl();
  const { submitPassphrase } = usePassphrase();
  // Closed mid-check and opened again, the dialog would offer a second
  // passphrase while the first is still being checked.
  const checking = useFormStore((state) => state.isSubmitting);
  const stages = useSelector(getProtocolStages);
  const formId = useId();
  const lengthRules = choosing ? protocolPassphraseLengthRules(stages) : {};

  const onSubmitForm: FormSubmitHandler = async ({ passphrase }) => {
    if (typeof passphrase !== 'string') {
      return {
        success: false,
        formErrors: [createMessageError(messages.submissionFailed)],
      };
    }

    // A passphrase that does not match the one chosen for this interview is
    // turned away here, with the reason under the field.
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
      title={intl.formatMessage(
        choosing ? messages.choosePassphrase : messages.enterPassphrase,
      )}
      onClose={onClose}
      dismissible={!checking}
      finalFocus={finalFocus}
      footer={
        <SubmitButton form={formId}>
          <AppMessage message={messages.submitPassphrase} />
        </SubmitButton>
      }
    >
      <div className="flex flex-col">
        <p>
          <AppMessage
            message={
              choosing ? messages.choosePassphraseHelp : messages.passphraseHelp
            }
          />
        </p>
        <FormWithoutProvider
          id={formId}
          className="mt-6"
          onSubmit={onSubmitForm}
        >
          {/* The passphrase protects this one interview's answers, so a
              password manager must not offer to save it as a site login. */}
          <Field
            component={PasswordField}
            name="passphrase"
            label={intl.formatMessage(messages.passphrase)}
            placeholder={intl.formatMessage(messages.passphrasePlaceholder)}
            required
            autoFocus
            suppressPasswordManager
            {...lengthRules}
          />
          {choosing && (
            <Field
              component={PasswordField}
              name="passphrase-2"
              label={intl.formatMessage(interfaceMessages.confirmPassphrase)}
              placeholder={intl.formatMessage(
                interfaceMessages.reenterPassphrase,
              )}
              required
              suppressPasswordManager
              sameAs="passphrase"
              {...lengthRules}
            />
          )}
        </FormWithoutProvider>
        <PassphraseCheckStatus />
      </div>
    </Overlay>
  );
};
