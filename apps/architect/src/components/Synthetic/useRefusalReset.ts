import { useEffect, useRef } from 'react';

/**
 * Drops what a control is holding about a refused proposal as soon as the
 * block it was refused against stops being the block on screen.
 *
 * A refusal is the schema's answer about ONE proposal over ONE block. It is
 * held by the control that made the proposal — nothing else can say which box
 * caused it — and a control cannot see the block being replaced from
 * somewhere else: a "Reset to default", an undo, or an accepted edit by a
 * sibling control. Left standing, the sentence describes a table that is no
 * longer there: zero the last drawable option weight, watch the schema refuse
 * it, then reset — and the complaint about an all-zero table sat beside the
 * restored, perfectly drawable defaults.
 *
 * Compared by VALUE rather than by reference, because the drafts these
 * surfaces hold are rebuilt as they render; an identity check would clear
 * every refusal in the frame that raised it. The clear itself is read through
 * a ref so a caller may pass an inline closure without re-running this.
 */
export const useRefusalReset = (identity: unknown, clear: () => void): void => {
  const revision = JSON.stringify(identity ?? null);
  const latest = useRef(clear);
  latest.current = clear;
  const seen = useRef(revision);

  useEffect(() => {
    if (seen.current === revision) return;
    seen.current = revision;
    latest.current();
  }, [revision]);
};
