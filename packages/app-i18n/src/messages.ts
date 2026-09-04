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
 * Missing translations are the designed fallback path — override locales are
 * sparse by policy and every descriptor carries its English defaultMessage, so
 * a locale would report on nearly every message it does not override. That
 * class is dropped before anyone sees it, including a host handler.
 *
 * Every other class is a real defect: a value the message did not expect, ICU
 * a translation broke. Those keep react-intl's own behaviour of reporting to
 * the console, because configuring `onError` at all replaces its default
 * reporter — filtering without putting something back is how a formatting
 * failure ends up visible nowhere, in development included.
 */
export const makeOnError =
  (onError?: AppIntlErrorHandler): AppIntlErrorHandler =>
  (error) => {
    if (error.code === 'MISSING_TRANSLATION') return;
    if (onError === undefined) {
      // oxlint-disable-next-line no-console -- Restores the reporting react-intl does by default; hosts that want the error routed elsewhere pass `onError`.
      console.error(error);
      return;
    }
    onError(error);
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
