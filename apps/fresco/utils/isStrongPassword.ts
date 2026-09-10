import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
export const passwordMessages = defineMessages({
  minimum: {
    id: 'fresco.validation.password.minimum',
    defaultMessage: 'Password must be at least {count, number} characters',
    description:
      'Password strength validation rule: ' +
      'Password must be at least {count, number} characters',
  },
  lower: {
    id: 'fresco.validation.password.lower',
    defaultMessage: 'Password must contain at least 1 lowercase letter',
    description:
      'Password strength validation rule: ' +
      'Password must contain at least 1 lowercase letter',
  },
  upper: {
    id: 'fresco.validation.password.upper',
    defaultMessage: 'Password must contain at least 1 uppercase letter',
    description:
      'Password strength validation rule: ' +
      'Password must contain at least 1 uppercase letter',
  },
  number: {
    id: 'fresco.validation.password.number',
    defaultMessage: 'Password must contain at least 1 number',
    description:
      'Password strength validation rule: ' +
      'Password must contain at least 1 number',
  },
  symbol: {
    id: 'fresco.validation.password.symbol',
    defaultMessage: 'Password must contain at least 1 symbol',
    description:
      'Password strength validation rule: ' +
      'Password must contain at least 1 symbol',
  },
  strong: {
    id: 'fresco.validation.password.strong',
    defaultMessage:
      'Password must be at least 8 characters and contain at least 1 lowercase, 1 uppercase, 1 number, and 1 symbol',
    description:
      'Password strength validation rule: ' +
      'Password must be at least 8 characters and contain at least 1 lowercase, 1 uppercase, 1 number, and 1 symbol',
  },
});
/**
 * The single definition of what makes a password strong enough for this app:
 * at least 8 characters, with at least 1 lowercase, 1 uppercase, 1 number and
 * 1 symbol.
 *
 * The rule lives here as data rather than as a schema because it has to be
 * enforced on both sides of the server boundary in two different zod flavours:
 * `schemas/` is `server-only` and uses standard zod, while client-reachable
 * code must import from `zod/mini` for bundle size. Sharing the parts — rather
 * than a schema object — is what stops the two from drifting.
 *
 * `isStrongPassword` replaces the `validator` package's function of the same
 * name, which bundled ~125KB of locale data that was never used.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_CHARACTER_RULES = [
  {
    pattern: /[a-z]/,
    message: passwordMessages.lower,
  },
  {
    pattern: /[A-Z]/,
    message: passwordMessages.upper,
  },
  { pattern: /\d/, message: passwordMessages.number },
  {
    pattern: /[^A-Za-z0-9]/,
    message: passwordMessages.symbol,
  },
] as const;

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    PASSWORD_CHARACTER_RULES.every(({ pattern }) => pattern.test(password))
  );
}

export function getPasswordRules(
  formatMessage: (message: MessageDescriptor) => string,
) {
  return PASSWORD_CHARACTER_RULES.map(({ pattern, message }) => ({
    pattern,
    message: formatMessage(message),
  }));
}
