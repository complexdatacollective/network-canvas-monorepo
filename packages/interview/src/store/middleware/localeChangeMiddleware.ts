'use client';

import type { Middleware } from '@reduxjs/toolkit';

import { ensureError } from '@codaco/shared-consts';

import type {
  ProtocolLocaleChangeHandler,
  SessionSnapshot,
} from '../../contract/types';

type LocaleChangeMiddlewareState = { session: SessionSnapshot };

/**
 * Hands every change to the session's locale fields to the host's
 * `ProtocolLocaleChangeHandler`, once per change, one call at a time.
 *
 * `settled` resolves once every call made so far has finished, so a flush can
 * wait for the locale write as well as the session write.
 */
export const createLocaleChangeMiddleware = ({
  onProtocolLocaleChange,
}: {
  onProtocolLocaleChange: ProtocolLocaleChangeHandler;
}): {
  middleware: Middleware<Record<string, never>, LocaleChangeMiddlewareState>;
  settled: () => Promise<void>;
} => {
  let queue: Promise<void> = Promise.resolve();

  const middleware: Middleware<
    Record<string, never>,
    LocaleChangeMiddlewareState
  > = (store) => (next) => (action: unknown) => {
    const before = store.getState().session;
    const result = next(action);
    const { id, locale, localePreference } = store.getState().session;

    if (
      locale === null ||
      (locale === before.locale && localePreference === before.localePreference)
    ) {
      return result;
    }

    const change = { locale, localePreference };
    queue = queue
      .then(() => onProtocolLocaleChange(id, change))
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error(
          '❌ Error saving the interview language:',
          ensureError(e),
        );
      });
    return result;
  };

  return { middleware, settled: () => queue };
};
