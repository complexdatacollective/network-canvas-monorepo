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
    description: 'Form validation for totp: Code must be exactly 6 digits',
  },
  validation2: {
    id: 'fresco.validation.totp.validation2',
    defaultMessage: 'Code must be exactly 6 digits',
    description: 'Form validation for totp: Code must be exactly 6 digits',
  },
  validation3: {
    id: 'fresco.validation.totp.validation3',
    defaultMessage: 'Two-factor token is required',
    description: 'Form validation for totp: Two-factor token is required',
  },
  validation4: {
    id: 'fresco.validation.totp.validation4',
    defaultMessage: 'Code cannot be empty',
    description: 'Form validation for totp: Code cannot be empty',
  },
  validation5: {
    id: 'fresco.validation.totp.validation5',
    defaultMessage: 'Code is required',
    description: 'Form validation for totp: Code is required',
  },
  validation6: {
    id: 'fresco.validation.totp.validation6',
    defaultMessage: 'Must be a 6-digit code or a recovery code',
    description:
      'Form validation for totp: Must be a 6-digit code or a recovery code',
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
