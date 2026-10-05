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
      'Form validation for auth: Username must be at least 4 characters',
  },
  validation2: {
    id: 'fresco.validation.auth.validation2',
    defaultMessage: 'Username cannot contain spaces',
    description: 'Form validation for auth: Username cannot contain spaces',
  },
  validation3: {
    id: 'fresco.validation.auth.validation3',
    defaultMessage:
      'Password must contain at least 1 lowercase, 1 uppercase, 1 number, and 1 symbol',
    description:
      'Form validation for auth: Password must contain at least 1 lowercase, 1 uppercase, 1 number, and 1 symbol',
  },
  validation4: {
    id: 'fresco.validation.auth.validation4',
    defaultMessage: 'Passwords do not match',
    description: 'Form validation for auth: Passwords do not match',
  },
  validation5: {
    id: 'fresco.validation.auth.validation5',
    defaultMessage: 'Username cannot be empty',
    description: 'Form validation for auth: Username cannot be empty',
  },
  validation6: {
    id: 'fresco.validation.auth.validation6',
    defaultMessage: 'Password cannot be empty',
    description: 'Form validation for auth: Password cannot be empty',
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
