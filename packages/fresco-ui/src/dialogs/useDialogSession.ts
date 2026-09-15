'use client';

import { useState } from 'react';

/**
 * One opening of a dialog whose CONTENT is the thing being edited, plus
 * whether that dialog is open.
 */
export type DialogSession<T> = T & { open: boolean };

export type DialogSessionControls<T> = {
  /** The current opening, kept until its dialog has finished animating out. */
  session: DialogSession<T> | null;
  /** Opens a new one, replacing whatever was there. */
  openSession: (session: T) => void;
  /** Closes the current one, leaving it in place for the exit animation. */
  closeSession: () => void;
  /** Pass as the dialog's `onExitComplete`; drops the session it closed. */
  onSessionExited: () => void;
};

/**
 * Holds a dialog's opening across its close, so the dialog can animate out.
 *
 * A dialog rendered only while there is something to edit —
 * `{session !== null && <Dialog open …>}` — has no exit animation at all:
 * closing unmounts it in the same tick, and the `AnimatePresence` that would
 * run the exit goes with it, so the dialog vanishes instead of closing. The
 * fix is to render it whenever there is a session, open or closed, pass
 * `open={session.open}`, and drop the session when the dialog reports that it
 * has gone.
 *
 * ```tsx
 * const { session, openSession, closeSession, onSessionExited } =
 *   useDialogSession<{ rowId: string }>();
 *
 * <Button onClick={() => openSession({ rowId })}>Edit</Button>
 * {session !== null && (
 *   <Dialog
 *     open={session.open}
 *     onExitComplete={onSessionExited}
 *     closeDialog={closeSession}
 *   >
 *     <RowEditor rowId={session.rowId} />
 *   </Dialog>
 * )}
 * ```
 */
export function useDialogSession<T>(): DialogSessionControls<T> {
  const [session, setSession] = useState<DialogSession<T> | null>(null);

  return {
    session,
    openSession: (next) => setSession({ ...next, open: true }),
    closeSession: () =>
      setSession((current) =>
        current === null ? null : { ...current, open: false },
      ),
    /**
     * Guarded on the session still being CLOSED, so that this can only ever
     * drop the session it was reporting on. Reopening during an exit cancels
     * that exit rather than completing it, so the guard is not reachable
     * today — it is here because "drop whatever is open" would be wrong the
     * moment that stopped being true.
     */
    onSessionExited: () =>
      setSession((current) => (current?.open === false ? null : current)),
  };
}
