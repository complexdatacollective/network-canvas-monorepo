import { type ReactNode, useEffect, useState } from 'react';

import Spinner from '@codaco/fresco-ui/Spinner';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import { getSessionProtocolSchemaVersion } from '~/lib/db/api';
import { returnToInterviewer9 } from '~/lib/interviewer9Navigation';

// Interviewer 8 served inside Interviewer 9 (a /v8/ build) is the interview
// alone: Interviewer 9 lists, starts, resumes and reviews schema 8 interviews,
// and frames this app at /interview/<id> only to run one
// (lib/interviewer9Embed.ts). Nothing passes back: the interview's answers are
// written to the database both apps share.

/**
 * Every address a /v8/ build does not run, and every top-level load of it.
 * Returns to Interviewer 9 at once, before any lock screen, onboarding or Home
 * could show (vite.config.ts leaves Home, the data view, onboarding and
 * Settings out of that build): framed, by ending the embedded interview; at
 * the top level, by replacing the page with Interviewer 9's own address for
 * it, so an interview is hosted, and unlocked once, by Interviewer 9.
 */
export function ReturnToInterviewer9() {
  useEffect(() => {
    returnToInterviewer9();
  }, []);
  return null;
}

function Waiting() {
  return (
    <div className="bg-background flex h-full items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

type Check = { sessionId: string; runnable: boolean };

/**
 * In front of the interview route in a /v8/ build: an interview this app
 * cannot run — no such session, or one whose protocol is not at this app's
 * schema (a schema 9 interview's id typed at /v8/interview/<id>, say) —
 * returns to Interviewer 9 at once, before the lock screen. The check reads
 * only the rows' plaintext fields, so it needs no key, and opens no database
 * that does not exist yet.
 */
export function ReturnToInterviewer9UnlessRunnable({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) {
  const [check, setCheck] = useState<Check | null>(null);

  useEffect(() => {
    let active = true;
    getSessionProtocolSchemaVersion(sessionId)
      .then(
        (schemaVersion) => schemaVersion === COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      )
      .catch((error: unknown) => {
        // oxlint-disable-next-line no-console -- only diagnostic for a /v8/ page that could not read the interview it was opened for; the tab returns to Interviewer 9
        console.error('Could not look up the interview to run', error);
        return false;
      })
      .then((runnable) => {
        if (!active) return;
        if (!runnable) returnToInterviewer9();
        setCheck({ sessionId, runnable });
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  if (check?.sessionId !== sessionId || !check.runnable) return <Waiting />;
  return <>{children}</>;
}
