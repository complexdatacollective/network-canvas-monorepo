import { isEqual } from 'es-toolkit';
import { useCallback, useContext, useEffect, useRef } from 'react';

import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import { STAGED_CODEBOOK_PATH } from '../stageDocument.ts';
import { StagedCodebookContext } from '../state/stagedCodebook.ts';

/**
 * The open stage editor's codebook changes as they stood when a dialog
 * opened, put back if the dialog closes without saving.
 *
 * A dialog inside a stage editor changes the stage's codebook directly, so that
 * everything behind it reads what it changed — the checks its own save runs
 * are made by the section that opened it, outside it — and so that a dialog
 * over a dialog needs nothing of its own. What makes the change the dialog's is
 * this checkpoint: cancelled, the dialog takes it back. While the stage's
 * changes differ from the checkpoint, the dialog's own form holds them too
 * (`STAGED_CODEBOOK_PATH`, which no submission carries) is marked as changed,
 * so the dialog has unsaved work to ask about before it is dismissed.
 *
 * Answers with what the dialog calls to say whether the changes are to be
 * kept when it closes: `true` while its save is under way and once it has
 * succeeded, `false` again if the save is refused. Outside a stage editor
 * there is nothing to take back, and calling it does nothing.
 */
export function useStagedCodebookCheckpoint(
  open: boolean,
): (keep: boolean) => void {
  const stage = useContext(StagedCodebookContext);
  const dialogStore = useContext(FormStoreContext);
  const kept = useRef(false);

  useEffect(() => {
    if (!open || stage === undefined) return undefined;
    kept.current = false;
    const taken = stage.read();
    let seen = taken;
    const unsubscribe = stage.subscribe(() => {
      const now = stage.read();
      if (now === seen || dialogStore === undefined) return;
      seen = now;
      dialogStore
        .getState()
        .setFieldValue(
          STAGED_CODEBOOK_PATH,
          isEqual(now, taken) ? undefined : true,
        );
    });
    return () => {
      unsubscribe();
      if (!kept.current) stage.restore(taken);
    };
  }, [dialogStore, open, stage]);

  return useCallback((keep: boolean) => {
    kept.current = keep;
  }, []);
}
