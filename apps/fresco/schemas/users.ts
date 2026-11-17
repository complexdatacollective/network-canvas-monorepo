import 'server-only';
import { z } from 'zod';

import {
  createAppIntl,
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { isStrongPassword, passwordMessages } from '~/utils/isStrongPassword';

const messages = defineMessages({
  validation1: {
    id: 'fresco.validation.users.validation1',
    defaultMessage: 'At least one user ID is required',
    description:
      'Error returned when the researcher confirms deleting user accounts in Settings but no account was selected. User means a researcher account; ID is its internal identifier.',
  },
  validation2: {
    id: 'fresco.validation.users.validation2',
    defaultMessage: 'Current password is required',
    description:
      'Validation error under the current-password field of the change-password dialog in Settings when it is left empty.',
  },
  validation3: {
    id: 'fresco.validation.users.validation3',
    defaultMessage: 'Passwords do not match',
    description:
      'Validation error under the confirm-password field of the change-password dialog in Settings, when the two new passwords differ.',
  },
});

export function createUsersSchemas(
  formatMessage: (message: MessageDescriptor) => string = createAppIntl({
    locale: 'en',
  }).formatMessage,
) {
  /**
   * The password strength rule as a server-side schema. Exported so Server
   * Actions that set a password can enforce it without reaching into another
   * schema's shape — they are directly invokable, so the client-side check is
   * not a guarantee.
   */
  const strongPasswordSchema = z.string().refine(isStrongPassword, {
    error: formatMessage(passwordMessages.strong),
  });

  const deleteUsersSchema = z.object({
    ids: z
      .array(z.string().min(1))
      .min(1, { error: formatMessage(messages.validation1) }),
  });

  const changePasswordSchema = z
    .object({
      currentPassword: z
        .string()
        .min(1, { error: formatMessage(messages.validation2) })
        .prefault(''),
      newPassword: strongPasswordSchema.prefault(''),
      confirmNewPassword: z.string().min(1).prefault(''),
    })
    .superRefine((val, ctx) => {
      if (val.newPassword !== val.confirmNewPassword) {
        ctx.addIssue({
          code: 'custom',
          message: formatMessage(messages.validation3),
          path: ['confirmNewPassword'],
        });
      }
    });
  return { strongPasswordSchema, deleteUsersSchema, changePasswordSchema };
}
