import { useCallback, useEffect, useRef } from 'react';

import { useResourceClient, useStagedResources } from './client.tsx';

/**
 * The files a dialog inside a stage edit imports, discarded again if the
 * dialog closes without its save going through.
 *
 * A dialog opened from a stage editor shares the stage edit's staged files,
 * because what it saves is kept with the stage's draft and promoted by the
 * stage's save. So a file the dialog imported and then abandoned would be
 * promoted with the stage, though nothing the stage saves names it. What the
 * dialog adds is told apart from what the stage had already staged by a
 * checkpoint taken when it opens: only files staged since then are discarded,
 * never one the stage itself is using.
 *
 * Answers with what the dialog calls once its save has gone through, to keep
 * them: before it hands over, since the caller may close the dialog at once.
 * While `active` is false (a dialog with an edit of its own, whose files go
 * with it) nothing is taken.
 */
export function useDialogUploadCheckpoint(active: boolean): () => void {
  const client = useResourceClient();
  const { staged } = useStagedResources();
  const latest = useRef(staged);
  const kept = useRef(false);

  useEffect(() => {
    latest.current = staged;
  }, [staged]);

  useEffect(() => {
    if (!active) return undefined;
    kept.current = false;
    const before = new Set(latest.current.map(({ id }) => id));
    return () => {
      if (kept.current) return;
      for (const { id } of latest.current) {
        if (!before.has(id)) void client.discardStaged(id);
      }
    };
  }, [active, client]);

  return useCallback(() => {
    kept.current = true;
  }, []);
}
