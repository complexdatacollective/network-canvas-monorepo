import { z } from 'zod/mini';

import {
  createAppIntl,
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { isStrongPassword } from '~/utils/isStrongPassword';

const messages = defineMessages({
  validation1: {
    id: 'fresco.validation.auth.validation1',
    defaultMessage: 'Username must be at least 4 characters',
    description:
      'Validation error under the username field when creating a researcher account (setup wizard or Settings) and the username is shorter than 4 characters.',
  },
  validation2: {
    id: 'fresco.validation.auth.validation2',
    defaultMessage: 'Username cannot contain spaces',
    description:
      'Validation error under the username field when creating a researcher account and the username contains a space character.',
  },
  validation3: {
    id: 'fresco.validation.auth.validation3',
    defaultMessage:
      'Password must contain at least 1 lowercase, 1 uppercase, 1 number, and 1 symbol',
    description:
      'Validation error under the password field when creating a researcher account and the password is too weak. A symbol means a punctuation or special character.',
  },
  validation4: {
    id: 'fresco.validation.auth.validation4',
    defaultMessage: 'Passwords do not match',
    description:
      'Validation error under the confirm-password field when creating a researcher account and it differs from the password typed above.',
  },
  validation5: {
    id: 'fresco.validation.auth.validation5',
    defaultMessage: 'Username cannot be empty',
    description:
      'Validation error under the username field of the sign-in form when it is submitted empty.',
  },
  validation6: {
    id: 'fresco.validation.auth.validation6',
    defaultMessage: 'Password cannot be empty',
    description:
      'Validation error under the password field of the sign-in form when it is submitted empty.',
  },
});

export function createAuthSchemas(
  formatMessage: (message: MessageDescriptor) => string = createAppIntl({
    locale: 'en',
  }).formatMessage,
) {
  const createUserSchema = z
    .object({
      username: z.prefault(
        z
          .string()
          .check(z.minLength(4, formatMessage(messages.validation1)))
          .check(
            z.refine(
              (s) => !s.includes(' '),
              formatMessage(messages.validation2),
            ),
          ),
        '',
      ),
      password: z.prefault(
        z
          .string()
          .check(
            z.refine(isStrongPassword, formatMessage(messages.validation3)),
          ),
        '',
      ),
      confirmPassword: z.prefault(z.string().check(z.minLength(1)), ''),
    })
    .check(
      z.superRefine((val, ctx) => {
        if (val.password !== val.confirmPassword) {
          ctx.addIssue({
            code: 'custom',
            message: formatMessage(messages.validation4),
            path: ['confirmPassword'],
          });
        }
      }),
    );

  const loginSchema = z.object({
    username: z.prefault(
      z.string().check(z.minLength(1, formatMessage(messages.validation5))),
      '',
    ),
    password: z.prefault(
      z.string().check(z.minLength(1, formatMessage(messages.validation6))),
      '',
    ),
  });
  return { createUserSchema, loginSchema };
}
