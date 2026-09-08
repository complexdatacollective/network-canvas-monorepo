import { createElement, useEffect, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import { useToast } from '@codaco/fresco-ui/Toast';
import { migrateStoredProtocols } from '~/lib/db/api';
import type { StoredProtocolMigrationResult } from '~/lib/db/migrateStoredProtocols';

const messages = defineMessages({
  updatedTitle: {
    id: 'interviewer.storedProtocolMigration.updatedTitle',
    defaultMessage:
      '{count, plural, one {Protocol updated} other {Protocols updated}}',
    description:
      'Administration text in Interviewer useStoredProtocolMigration.',
  },
  updatedDescription: {
    id: 'interviewer.storedProtocolMigration.updatedDescription',
    defaultMessage:
      '{count, plural, one {{name} was migrated to the current schema.} other {# protocols were migrated to the current schema.}}',
    description:
      'Administration text in Interviewer useStoredProtocolMigration.',
  },
  failedTitle: {
    id: 'interviewer.storedProtocolMigration.failedTitle',
    defaultMessage:
      '{count, plural, one {Protocol could not be updated} other {Protocols could not be updated}}',
    description:
      'Administration text in Interviewer useStoredProtocolMigration.',
  },
  failedDescription: {
    id: 'interviewer.storedProtocolMigration.failedDescription',
    defaultMessage:
      '{count, plural, one {{name} could not be migrated to the current schema. Its interviews cannot be continued, though their responses remain on the data screen. Repair it in Architect and import it again to start new interviews.} other {# protocols could not be migrated to the current schema. Their interviews cannot be continued, though their responses remain on the data screen. Repair them in Architect and import them again to start new interviews.}}',
    description:
      'Administration text in Interviewer useStoredProtocolMigration.',
  },
});

// 'pending' until the sweep has run for the current unlocked session,
// 'settled' once it has resolved — whether it migrated anything, failed on a
// row, or found nothing to do.
export type StoredProtocolMigrationPhase = 'pending' | 'settled';

function migratedToast(names: string[]) {
  return {
    title: createElement(AppMessage, {
      message: messages.updatedTitle,
      values: { count: names.length },
    }),
    description: createElement(AppMessage, {
      message: messages.updatedDescription,
      values: {
        count: names.length,
        name: names[0] ?? '',
      },
    }),
  };
}

function failedToast(names: string[]) {
  return {
    title: createElement(AppMessage, {
      message: messages.failedTitle,
      values: { count: names.length },
    }),
    description: createElement(AppMessage, {
      message: messages.failedDescription,
      values: {
        count: names.length,
        name: names[0] ?? '',
      },
    }),
  };
}

/**
 * Run the stored-protocol schema migration once per unlocked session, and
 * report what it did.
 *
 * `enabled` says the database is readable — the vault is unlocked, or there is
 * no vault and rows are plaintext. Protocol documents are encrypted at rest, so
 * there is nothing this can do before that point; it looks again after a
 * lock/unlock cycle, because that cycle can change the key rows are readable
 * under.
 *
 * The caller is expected to withhold the app's routes until this reports
 * 'settled', so every protocol that can migrate has migrated before a session
 * loads. A protocol this sweep could NOT migrate is left at its old version
 * and reported in a toast rather than held against the app starting; the
 * interview route separately refuses to run a session whose protocol is not
 * at the runtime's schema version, so such a row cannot reach the runtime.
 */
export function useStoredProtocolMigration(
  enabled: boolean,
): StoredProtocolMigrationPhase {
  const toast = useToast();
  const [phase, setPhase] = useState<StoredProtocolMigrationPhase>('pending');
  // The sweep in flight for the current unlocked session, held as the promise
  // itself rather than an "already started" flag so a remount (StrictMode runs
  // every effect twice) re-attaches to the same run instead of either starting
  // a second one or waiting forever on a result it is never told about.
  const run = useRef<Promise<StoredProtocolMigrationResult> | null>(null);
  const notified = useRef(false);

  // `useToast()` returns a fresh object every render, so it cannot be an effect
  // dependency without re-running the sweep on every render. Hold it in a ref
  // the effect below reads at the moment it needs it.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });

  useEffect(() => {
    if (!enabled) {
      // Locking drops the session key, so the next unlock has to look again.
      run.current = null;
      notified.current = false;
      setPhase('pending');
      return;
    }

    const sweep = run.current ?? migrateStoredProtocols();
    run.current = sweep;

    let active = true;
    void sweep
      .catch((cause: unknown): StoredProtocolMigrationResult => {
        // The sweep is written not to reject. If it ever did, the app's first
        // paint is waiting on this promise, so nothing may be left holding it.
        console.error('The stored-protocol migration check failed', cause);
        return { migrated: [], failed: [] };
      })
      .then((result) => {
        // Toasts are an app-level side effect of the sweep itself, not of this
        // component's lifetime, so they are reported once per run regardless of
        // whether this effect instance is still the live one.
        if (!notified.current) {
          notified.current = true;
          if (result.migrated.length > 0) {
            toastRef.current.add({
              ...migratedToast(result.migrated.map((entry) => entry.name)),
              variant: 'success',
            });
          }
          if (result.failed.length > 0) {
            toastRef.current.add({
              ...failedToast(result.failed.map((entry) => entry.name)),
              variant: 'destructive',
            });
          }
        }
        if (active) setPhase('settled');
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  return phase;
}
