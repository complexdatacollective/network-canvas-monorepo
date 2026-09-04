import {
  createIntl,
  createIntlCache,
  defineMessage,
  defineMessages,
} from 'react-intl';
import type { IntlConfig, IntlShape, MessageDescriptor } from 'react-intl';

import type { CatalogMessages } from './locales.ts';

export { defineMessage, defineMessages };
export type { IntlShape, MessageDescriptor };

export type AppIntlErrorHandler = NonNullable<IntlConfig['onError']>;

/**
 * Missing translations are the designed fallback path (override locales are
 * sparse by policy; every descriptor carries its English defaultMessage), so
 * that error class is silenced. Everything else degrades to the default
 * message inside react-intl; hosts that want visibility pass `onError`.
 */
export const makeOnError =
  (onError?: AppIntlErrorHandler): AppIntlErrorHandler =>
  (error) => {
    if (error.code === 'MISSING_TRANSLATION') return;
    onError?.(error);
  };

/**
 * A non-React formatter for servers, scripts, and tests — the same shape the
 * provider serves to components. Next.js hosts use this on the server;
 * `AppI18nProvider` is its client-side counterpart.
 */
export function createAppIntl(options: {
  locale: string;
  messages?: CatalogMessages;
  onError?: AppIntlErrorHandler;
}): IntlShape {
  return createIntl(
    {
      locale: options.locale,
      defaultLocale: 'en',
      // Catalog values are ICU strings in dev/tests and pre-parsed AST in
      // production builds; react-intl accepts both, but its option type only
      // names the string form.
      messages: (options.messages ?? {}) as Record<string, string>,
      onError: makeOnError(options.onError),
    },
    createIntlCache(),
  );
}
