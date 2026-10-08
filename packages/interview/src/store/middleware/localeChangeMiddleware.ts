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
 * Except for a finished interview: whoever opens one later — the participant
 * on another device, or a researcher in a browser set to another language —
 * still sees it in their own language, but the language it was taken in,
 * which exports read, is never overwritten. That covers a session opened
 * already finished (`finishTime`) and one finished in this Shell
 * (`markFinished`).
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
  markFinished: () => void;
} => {
  let queue: Promise<void> = Promise.resolve();
  let finishedHere = false;

  const middleware: Middleware<
    Record<string, never>,
    LocaleChangeMiddlewareState
  > = (store) => (next) => (action: unknown) => {
    const before = store.getState().session;
    const result = next(action);
    const { id, locale, localePreference, finishTime } =
      store.getState().session;

    if (
      finishedHere ||
      finishTime !== null ||
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

  return {
    middleware,
    settled: () => queue,
    markFinished: () => {
      finishedHere = true;
    },
  };
};
