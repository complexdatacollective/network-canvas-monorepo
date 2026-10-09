import { createElement, useEffect, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import { useToast } from '@codaco/fresco-ui/Toast';
import { migrateStoredProtocols } from '~/lib/db/api';
import type { StoredProtocolMigrationResult } from '~/lib/db/migrateStoredProtocols';

import { recordStoredProtocolMigrationFailures } from './storedProtocolMigrationFailures';

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
      '{count, plural, =1 {{name} was migrated to the current schema.} other {# protocols were migrated to the current schema.}}',
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
      '{count, plural, =1 {{name} could not be migrated to the current schema. Its interviews cannot be continued, though their responses remain on the data screen. Repair it in Architect and import it again to start new interviews.} other {# protocols could not be migrated to the current schema. Their interviews cannot be continued, though their responses remain on the data screen. Repair them in Architect and import them again to start new interviews.}}',
    description:
      'Administration text in Interviewer useStoredProtocolMigration.',
  },
  interviewsNotUpdatedTitle: {
    id: 'interviewer.storedProtocolMigration.interviewsNotUpdatedTitle',
    defaultMessage:
      '{count, plural, one {A protocol is waiting for an update} other {Protocols are waiting for an update}}',
    description:
      'Title of a notice shown when the interviews recorded with one or more protocols could not be updated to work with this version of the app, so those protocols were left as they were.',
  },
  interviewsNotUpdatedDescription: {
    id: 'interviewer.storedProtocolMigration.interviewsNotUpdatedDescription',
    defaultMessage:
      '{count, plural, =1 {Some interviews recorded with {name} could not be updated to work with this version of the app. The protocol and all its interviews have been kept exactly as they were, and the app will try again each time it starts. Until then, its interviews cannot be started or continued, though their responses remain on the data screen.} other {Some interviews recorded with # protocols could not be updated to work with this version of the app. These protocols and all their interviews have been kept exactly as they were, and the app will try again each time it starts. Until then, their interviews cannot be started or continued, though their responses remain on the data screen.}}',
    description:
      'Notice shown when the interviews recorded with one or more protocols could not be updated to work with this version of the app. Nothing was changed, and a later version of the app may be able to update them. name is the protocol name.',
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

function interviewsNotUpdatedToast(names: string[]) {
  return {
    title: createElement(AppMessage, {
      message: messages.interviewsNotUpdatedTitle,
      values: { count: names.length },
    }),
    description: createElement(AppMessage, {
      message: messages.interviewsNotUpdatedDescription,
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
 * loads. A protocol this sweep could NOT migrate — itself, or together with
 * all its sessions — is left at its old version and reported in a toast
 * rather than held against the app starting, and why is recorded for the
 * protocol's own screens (`storedProtocolMigrationFailures`); the
 * interview route separately refuses to run a session whose protocol is not
 * at the runtime's schema version, so such a row cannot reach the runtime.
 */
export function useStoredProtocolMigration(
  enabled: boolean,
): StoredProtocolMigrationPhase {
  const toast = useToast();
  // Each readable window gets its own epoch, and a sweep records the epoch it
  // ran for. The reported phase compares the two, so a result that lands after
  // the vault re-locked can never be read as an answer about the window that
  // follows it — the reason this is not a plain 'pending' | 'settled' flag.
  const [epoch, setEpoch] = useState(0);
  const [settledEpoch, setSettledEpoch] = useState<number | null>(null);
  // The sweep in flight for the current unlocked session, held as the promise
  // itself rather than an "already started" flag so a remount (StrictMode runs
  // every effect twice) re-attaches to the same run instead of either starting
  // a second one or waiting forever on a result it is never told about.
  const run = useRef<Promise<StoredProtocolMigrationResult> | null>(null);
  // The sweep whose result has been reported in toasts, so the effect
  // instances attached to one sweep (StrictMode attaches two) toast once.
  const notified = useRef<Promise<StoredProtocolMigrationResult> | null>(null);

  // `useToast()` returns a fresh object every render, so it cannot be an effect
  // dependency without re-running the sweep on every render. Hold it in a ref
  // the effect below reads at the moment it needs it.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });

  // Readability changing in either direction opens a new window: losing it
  // puts the answer back out of reach, and regaining it can change the key
  // rows are readable under. Counted during render, so the frame that reports
  // the change already reports 'pending' — that is the frame the caller gates
  // routes on.
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    setEpoch((current) => current + 1);
  }

  useEffect(() => {
    if (!enabled) {
      // Locking drops the session key, so the next unlock has to look again.
      // Clearing the sweep also retires it: a result it delivers from here on
      // is about rows read under the previous key, and reports nothing.
      run.current = null;
      return;
    }

    const sweep = run.current ?? migrateStoredProtocols();
    run.current = sweep;

    let active = true;
    void sweep
      .catch((cause: unknown): StoredProtocolMigrationResult => {
        // The sweep is written not to reject. If it ever did, the app's first
        // paint is waiting on this promise, so nothing may be left holding it.
        // oxlint-disable-next-line no-console -- only diagnostic for a contract violation (migrateStoredProtocols is documented never to reject) that would otherwise silently stall first paint
        console.error('The stored-protocol migration check failed', cause);
        return { migrated: [], failed: [] };
      })
      .then((result) => {
        // Every effect of a sweep's result is conditional on that sweep still
        // being the current one. A lock/unlock cycle while it ran started
        // another sweep (or none yet), and a superseded sweep resolving late,
        // in either order, must neither overwrite the current failures nor
        // take the current sweep's notices.
        if (run.current !== sweep) return;
        recordStoredProtocolMigrationFailures(result.failed);
        // Toasts are an app-level side effect of the sweep itself, not of this
        // component's lifetime, so they are reported once per sweep regardless
        // of whether this effect instance is still the live one.
        if (notified.current !== sweep) {
          notified.current = sweep;
          if (result.migrated.length > 0) {
            toastRef.current.add({
              ...migratedToast(result.migrated.map((entry) => entry.name)),
              variant: 'success',
            });
          }
          const protocolFailures = result.failed.filter(
            (entry) => entry.kind === 'protocol',
          );
          if (protocolFailures.length > 0) {
            toastRef.current.add({
              ...failedToast(protocolFailures.map((entry) => entry.name)),
              variant: 'destructive',
            });
          }
          // Nothing is wrong with these protocols or their data: a later
          // version of the app can update them, so the notice is calm.
          const sessionFailures = result.failed.filter(
            (entry) => entry.kind === 'sessions',
          );
          if (sessionFailures.length > 0) {
            toastRef.current.add({
              ...interviewsNotUpdatedToast(
                sessionFailures.map((entry) => entry.name),
              ),
              variant: 'info',
            });
          }
        }
        if (active) setSettledEpoch(epoch);
      });

    return () => {
      active = false;
    };
  }, [enabled, epoch]);

  return enabled && settledEpoch === epoch ? 'settled' : 'pending';
}
