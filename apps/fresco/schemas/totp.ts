import 'server-only';
import { z } from 'zod';

import {
  createAppIntl,
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';

const messages = defineMessages({
  validation1: {
    id: 'fresco.validation.totp.validation1',
    defaultMessage: 'Code must be exactly 6 digits',
    description:
      'Error shown in the two-factor setup wizard when the code the researcher entered from their authenticator app does not have exactly six characters.',
  },
  validation2: {
    id: 'fresco.validation.totp.validation2',
    defaultMessage: 'Code must be exactly 6 digits',
    description:
      'Error shown in the two-factor setup wizard when the code the researcher entered from their authenticator app contains something other than digits.',
  },
  validation3: {
    id: 'fresco.validation.totp.validation3',
    defaultMessage: 'Two-factor token is required',
    description:
      'Error returned when the second sign-in step is submitted without the temporary token that links it to the first step. Token here is an internal sign-in token, not an API token or a code the researcher types.',
  },
  validation4: {
    id: 'fresco.validation.totp.validation4',
    defaultMessage: 'Code cannot be empty',
    description:
      'Error shown on the two-factor sign-in step when the researcher submits without typing a two-factor code or a recovery code.',
  },
  validation5: {
    id: 'fresco.validation.totp.validation5',
    defaultMessage: 'Code is required',
    description:
      'Error shown when the researcher turns off two-factor authentication without entering a code to confirm. The code is a two-factor code or a recovery code.',
  },
  validation6: {
    id: 'fresco.validation.totp.validation6',
    defaultMessage: 'Must be a 6-digit code or a recovery code',
    description:
      'Error shown when the researcher turns off two-factor authentication and the entered text is neither a 6-digit two-factor code from the authenticator app nor a recovery code.',
  },
});

export function createTotpSchemas(
  formatMessage: (message: MessageDescriptor) => string = createAppIntl({
    locale: 'en',
  }).formatMessage,
) {
  const verifyTotpSetupSchema = z.object({
    code: z
      .string()
      .length(6, { error: formatMessage(messages.validation1) })
      .regex(/^\d{6}$/, { error: formatMessage(messages.validation2) })
      .prefault(''),
  });

  const verifyTwoFactorSchema = z.object({
    twoFactorToken: z
      .string()
      .min(1, { error: formatMessage(messages.validation3) }),
    code: z
      .string()
      .min(1, { error: formatMessage(messages.validation4) })
      .prefault(''),
  });

  const disableTotpSchema = z.object({
    code: z
      .string()
      .min(1, { error: formatMessage(messages.validation5) })
      .refine((val) => /^\d{6}$/.test(val) || /^[0-9a-f]{20}$/.test(val), {
        error: formatMessage(messages.validation6),
      })
      .prefault(''),
  });
  return { verifyTotpSetupSchema, verifyTwoFactorSchema, disableTotpSchema };
}

// Provider-optional English schemas retain the existing validation API for
// non-UI callers. Researcher forms and actions instantiate with their formatter.
export const {
  verifyTotpSetupSchema,
  verifyTwoFactorSchema,
  disableTotpSchema,
} = createTotpSchemas();
