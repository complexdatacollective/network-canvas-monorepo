// The public server entry is universal: unlike react-intl's default entry,
// it has no client directive or context hooks, and preserves rich React nodes.
import {
  createIntl,
  createIntlCache,
  defineMessage,
  defineMessages,
} from 'react-intl/server';
import type {
  IntlConfig,
  IntlShape,
  MessageDescriptor,
} from 'react-intl/server';

import type { CatalogMessages } from './locales.ts';

export { defineMessage, defineMessages };
export type { IntlShape, MessageDescriptor };
export { createMessageError, formatMessageError } from './messageErrors.ts';
export type { MessageErrorValues } from './messageErrors.ts';

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
  /**
   * IANA zone for `{…, date}` and `{…, time}` arguments. Left unset each
   * formatter uses the zone of whatever process it runs in, which is a
   * hydration mismatch waiting to happen on a Next host: the server renders a
   * timestamp in the container's zone and the browser re-renders it in the
   * reader's, so a message near midnight changes date between the two.
   * Fresco is the host this matters for; a Vite SPA has only one process and
   * can leave it alone.
   */
  timeZone?: string;
}): IntlShape {
  return createIntl(
    {
      locale: options.locale,
      timeZone: options.timeZone,
      // The reader's locale, NOT 'en'. react-intl formats a message through
      // `defaultLocale` whenever it falls back to the descriptor's
      // `defaultMessage` — which, with the sparse override catalogs this
      // design is built on, is nearly every message an en-GB reader sees.
      // Pinned to 'en' it made `{when, date, short}` render as `1/2/20`
      // rather than `02/01/20` for exactly the messages en-GB does not
      // override, so a locale's dates and numbers came out right only where
      // somebody had happened to translate the words around them.
      //
      // It also stops react-intl reporting MISSING_TRANSLATION, which is what
      // we want and already the case: a sparse override catalog is missing
      // most ids by design, so that error carries no signal here.
      defaultLocale: options.locale,
      // Catalog values are ICU strings in dev/tests and pre-parsed AST in
      // production builds; react-intl accepts both, but its option type only
      // names the string form.
      messages: (options.messages ?? {}) as Record<string, string>,
      onError: makeOnError(options.onError),
    },
    createIntlCache(),
  );
}
