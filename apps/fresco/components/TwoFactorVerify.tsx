'use client';

import { useState } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import {
  type FormSubmissionResult,
  type FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import { verifyCurrentUserTotp } from '~/actions/totp';

const messages = defineMessages({
  requiredRecovery: {
    id: 'fresco.TwoFactorVerify.requiredRecovery',
    defaultMessage: 'Recovery code is required',
    description:
      'Validation error under the recovery code field, in the Settings dialogs that ask the researcher to confirm with a two-factor code, when it is left empty.',
  },

  requiredCode: {
    id: 'fresco.TwoFactorVerify.requiredCode',
    defaultMessage: 'Code is required',
    description:
      'Validation error under the 6-digit authenticator code field, in the Settings dialogs that ask the researcher to confirm with a two-factor code, when it is left empty.',
  },

  copyCodeIsRequired: {
    id: 'fresco.TwoFactorVerify.copyCodeIsRequired',
    defaultMessage: 'Code is required',
    description:
      'Error shown on the code field of the two-factor confirmation dialogs in Settings when the form is submitted without a code, with either the authenticator app or recovery code variant.',
  },
  copyUseAuthenticatorAppInstead: {
    id: 'fresco.TwoFactorVerify.copyUseAuthenticatorAppInstead',
    defaultMessage: 'Use authenticator app instead',
    description:
      'Link-style button in the two-factor confirmation dialog, shown while asking for a recovery code; switches back to the 6-digit authenticator app code.',
  },
  copyUseARecoveryCodeInstead: {
    id: 'fresco.TwoFactorVerify.copyUseARecoveryCodeInstead',
    defaultMessage: 'Use a recovery code instead',
    description:
      'Link-style button in the two-factor confirmation dialog, shown while asking for an authenticator app code; switches to entering a recovery code. Only offered where recovery codes are accepted.',
  },
  enterOneOfYourRecoveryCodes: {
    id: 'fresco.TwoFactorVerify.enterOneOfYourRecoveryCodes',
    defaultMessage: 'Enter one of your recovery codes',
    description:
      'Label of the recovery code field in the two-factor confirmation dialog in Settings, shown when the researcher chose a recovery code.',
  },
  example0123456789abcdef0123: {
    id: 'fresco.TwoFactorVerify.0123456789abcdef0123',
    defaultMessage: '0123456789abcdef0123',
    description:
      'Example recovery code shown as the placeholder in the recovery code field: 20 hexadecimal characters. Not translatable text; keep as is.',
  },
  enterYour6DigitCodeFromYour: {
    id: 'fresco.TwoFactorVerify.enterYour6DigitCodeFromYour',
    defaultMessage: 'Enter your 6-digit code from your authenticator app',
    description:
      "Label of the six-box code field in the two-factor confirmation dialog in Settings, asking for the current code shown by the researcher's authenticator app.",
  },
});

type TwoFactorVerifyProps = {
  formId: string;
  /**
   * Runs once the code is verified, as part of the same submission: the form
   * reads as submitting until it settles, and a failure it returns is shown
   * on the form like a rejected code.
   */
  onVerify: (code: string) => Promise<FormSubmissionResult>;
  allowRecoveryCodes?: boolean;
};

export default function TwoFactorVerify({
  formId,
  onVerify,
  allowRecoveryCodes,
}: TwoFactorVerifyProps) {
  const intl = useAppIntl();

  const [useRecovery, setUseRecovery] = useState(false);

  const handleSubmit: FormSubmitHandler = async (data) => {
    const code = typeof data.code === 'string' ? data.code : undefined;
    if (!code) {
      return {
        success: false,
        fieldErrors: {
          code: [createMessageError(messages.copyCodeIsRequired)],
        },
      };
    }

    const result = await verifyCurrentUserTotp(code);
    if (!result.success) {
      return result;
    }

    return onVerify(code);
  };

  return (
    <FormWithoutProvider
      key={useRecovery ? 'recovery' : 'totp'}
      onSubmit={handleSubmit}
      id={formId}
    >
      {useRecovery ? (
        <Field
          name="code"
          label={intl.formatMessage(messages.enterOneOfYourRecoveryCodes)}
          component={InputField}
          required={intl.formatMessage(messages.requiredRecovery)}
          className="font-monospace tracking-widest"
          placeholder={intl.formatMessage(messages.example0123456789abcdef0123)}
          autoComplete="off"
        />
      ) : (
        <Field
          name="code"
          label={intl.formatMessage(messages.enterYour6DigitCodeFromYour)}
          component={SegmentedCodeField}
          required={intl.formatMessage(messages.requiredCode)}
          segments={6}
          characterSet="numeric"
          size="lg"
        />
      )}
      {allowRecoveryCodes && (
        <Button
          type="button"
          onClick={() => setUseRecovery((prev) => !prev)}
          variant="link"
        >
          {useRecovery
            ? intl.formatMessage(messages.copyUseAuthenticatorAppInstead)
            : intl.formatMessage(messages.copyUseARecoveryCodeInstead)}
        </Button>
      )}
    </FormWithoutProvider>
  );
}
