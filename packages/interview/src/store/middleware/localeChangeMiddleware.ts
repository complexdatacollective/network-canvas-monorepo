'use client';

import type { Middleware } from '@reduxjs/toolkit';

import { ensureError } from '@codaco/shared-consts';

import type {
  ProtocolLocaleChange,
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
 * (`markFinished`). A host that opens a finished interview as an unfinished
 * one, to be edited (`openFinishedAsActive`), still has its language changes
 * recorded until it is finished again.
 *
 * A refused call is not forgotten. The newest change stays unsaved until a call
 * carrying it (or a later change, which carries both fields) succeeds, and
 * `settled` tries it again before resolving. General sync never writes the
 * locale fields, so nothing else would.
 *
 * `settled` resolves once every call made so far has finished, with whether
 * the newest change has been stored, so finishing can stay when the language
 * the interview was taken in was not recorded.
 */
export const createLocaleChangeMiddleware = ({
  onProtocolLocaleChange,
  openFinishedAsActive = false,
}: {
  onProtocolLocaleChange: ProtocolLocaleChangeHandler;
  openFinishedAsActive?: boolean;
}): {
  middleware: Middleware<Record<string, never>, LocaleChangeMiddlewareState>;
  settled: () => Promise<boolean>;
  markFinished: () => void;
} => {
  type Pending = { id: string; change: ProtocolLocaleChange };

  let queue: Promise<void> = Promise.resolve();
  let finishedHere = false;
  // The newest change not yet known to be stored.
  let unsaved: Pending | null = null;

  // Queued behind every earlier call, so calls stay one at a time and in order.
  // A retry is skipped once something else has stored the change or a newer
  // one has replaced it.
  const enqueue = (pending: Pending, retry = false) => {
    queue = queue
      .then(() =>
        retry && unsaved !== pending
          ? undefined
          : onProtocolLocaleChange(pending.id, pending.change),
      )
      .then(
        () => {
          // A newer change still has to be stored on its own.
          if (unsaved === pending) unsaved = null;
        },
        (e: unknown) => {
          // eslint-disable-next-line no-console
          console.error(
            '❌ Error saving the interview language:',
            ensureError(e),
          );
        },
      );
  };

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
      (finishTime !== null && !openFinishedAsActive) ||
      locale === null ||
      (locale === before.locale && localePreference === before.localePreference)
    ) {
      return result;
    }

    unsaved = { id, change: { locale, localePreference } };
    enqueue(unsaved);
    return result;
  };

  // Waits out calls queued while waiting, too.
  const drain = async () => {
    let current: Promise<void>;
    do {
      current = queue;
      await current;
    } while (current !== queue);
  };

  const settled = async (): Promise<boolean> => {
    await drain();
    // Every call made so far has finished; one that was refused is tried once
    // more. A finished interview's language is never written again.
    const pending = unsaved;
    if (pending && !finishedHere) {
      enqueue(pending, true);
      await drain();
    }
    return unsaved === null;
  };

  return {
    middleware,
    settled,
    markFinished: () => {
      finishedHere = true;
    },
  };
};
