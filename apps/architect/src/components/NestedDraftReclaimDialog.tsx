import { useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useNestedEditorOpen } from '~/components/DialogForm/nestedDraftRegistry';
import { useAppSelector } from '~/ducks/hooks';
import {
  getProtocolLockState,
  getProtocolReclaimChoiceRequest,
} from '~/ducks/modules/app';
import { getStageEditorCodebookTransactionOpen } from '~/selectors/stageEditorDraft';

/**
 * Explains a reclaim that is waiting on an editor the researcher still has
 * open.
 *
 * The tab holding this protocol has closed, so editing could resume here — but
 * a variable, entity-type, resource or rule editor is still open. Anything
 * typed into it lives in that editor's own form store and nowhere else, so
 * re-reading the saved copy would unmount the editor and take it; and even an
 * untouched editor was filled in from the version this tab had before, so
 * saving it after the re-read would write those older values back over what the
 * other tab saved.
 *
 * Deliberately NOT the stage editor's three-action choice. That dialog's
 * "Download a Copy" builds the file from the stage draft, and a nested editor's
 * in-progress values are not in that buffer — the researcher would be handed a
 * protocol silently missing the very work they were trying to keep. The inner
 * editor has to be resolved first; once it is finished, its values ARE in the
 * stage draft and the stage flow applies unchanged.
 *
 * The lock stays `reclaim-blocked` throughout, so nothing is written, reloaded
 * or discarded while the question is open — and this dialog is dismissible on
 * purpose, because the editor it is asking about is on the screen behind it.
 * ProtocolLockBanner keeps explaining the situation and can raise it again.
 */

const TITLE = 'An editor is still open';

// One whole message per situation, never assembled, so both can be localised.
// They differ in what finishing the inner editor would actually achieve, and
// promising the wrong one is how a researcher loses work believing they saved
// it.
const IN_STAGE_EDITOR_DESCRIPTION =
  'The other tab has been closed, so this protocol can be edited here again. Before that can happen, the editor you have open needs to be dealt with: anything in it is not part of this stage yet, and it exists nowhere else. Finish that editor to move its changes into this stage, or cancel it to discard them. You will then be asked what to do about your unsaved changes to this stage.';

const ELSEWHERE_DESCRIPTION =
  'The other tab has been closed, so this protocol can be edited here again. Before that can happen, the editor you have open needs to be dealt with. It was filled in from the version this tab had before, so saving it now would write those older settings over what the other tab saved. Cancel that editor to continue — if you have made changes in it, you will be asked to confirm before anything is discarded.';

const NestedDraftReclaimDialog = () => {
  const { openDialog, closeDialog } = useDialog();
  const nestedEditorOpen = useNestedEditorOpen();
  const blocked = useAppSelector(
    (state) => getProtocolLockState(state) === 'reclaim-blocked',
  );
  // Whether finishing the inner editor would write the stage editor's own draft
  // (safe, and the way to keep the work) or the canonical protocol (refused —
  // see DialogForm). Read at ask time, like everything else here.
  const inStageEditor = useAppSelector(getStageEditorCodebookTransactionOpen);
  // Bumped by ProtocolLockBanner when the researcher asks to see the
  // explanation again after dismissing it.
  const choiceRequest = useAppSelector(getProtocolReclaimChoiceRequest);

  const pending = blocked && nestedEditorOpen;

  // Read at the moment they are used, so a changed identity cannot restart the
  // effect and stack a second dialog on the first.
  const latest = useRef({ closeDialog, inStageEditor, openDialog });
  latest.current = { closeDialog, inStageEditor, openDialog };

  const openDialogId = useRef<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;

    const ask = async () => {
      const id = uuid();
      openDialogId.current = id;
      await latest.current.openDialog({
        id,
        // `info`, not `warning`, and the severity is deliberate rather than
        // squeamish: nothing here decides anything or gives anything up — it
        // describes a wait, and the banner behind it carries the warning for as
        // long as the wait lasts. It also decides focus: `DialogProvider`
        // autofocuses the CANCEL action on a warning, to make a discouraged
        // choice deliberate, and there is no discouraged choice here — focus
        // belongs on the action that resolves the situation.
        type: 'choice',
        intent: 'info',
        size: 'readable',
        title: TITLE,
        description: latest.current.inStageEditor
          ? IN_STAGE_EDITOR_DESCRIPTION
          : ELSEWHERE_DESCRIPTION,
        actions: {
          // Both actions merely close this, because only the editor itself can
          // validate a Finish or say what a Cancel would discard — duplicating
          // either control out here would be a second control with the same
          // name doing a worse job. What they name is where the researcher is
          // going next, and `cancel` is also what Escape and the backdrop
          // resolve to, so leaving it unlabelled would hide a route out that
          // exists either way.
          primary: { label: 'Back to the Editor', value: 'return' as const },
          cancel: { label: 'Decide Later', value: null },
        },
      });
      if (openDialogId.current === id) openDialogId.current = null;
      if (cancelled) return;
    };

    void ask();

    return () => {
      cancelled = true;
      const id = openDialogId.current;
      openDialogId.current = null;
      // The question stopped being the right one — the editor was resolved, or
      // a peer took the protocol back. Take the dialog away rather than leave a
      // stale explanation on screen.
      if (id) void latest.current.closeDialog(id, null);
    };
  }, [pending, choiceRequest]);

  return null;
};

export default NestedDraftReclaimDialog;
