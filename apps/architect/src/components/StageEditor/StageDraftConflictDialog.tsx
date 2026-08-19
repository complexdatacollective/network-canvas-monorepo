import { useEffect, useRef } from 'react';
import { useStore } from 'react-redux';
import { v4 as uuid } from 'uuid';
import { useLocation } from 'wouter';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { Stage } from '@codaco/protocol-validation';
import {
  hasOpenNestedEditor,
  useNestedEditorOpen,
} from '~/components/DialogForm/nestedDraftRegistry';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  getProtocolLockState,
  getProtocolReclaimChoiceRequest,
} from '~/ducks/modules/app';
import { resetDraft } from '~/ducks/modules/stageEditorDraft';
import type { RootState } from '~/ducks/store';
import { getProtocol } from '~/selectors/protocol';
import { getLiveStageValues } from '~/selectors/stageEditorDraft';
import { downloadActiveProtocol } from '~/utils/downloadActiveProtocol';

import { buildProtocolWithStage } from './buildProtocolWithStage';
import { flushStageLiveValues } from './StageFormBridge';

/**
 * Asks the researcher what to do when the tab holding this protocol closes
 * while an unsaved stage draft is open here.
 *
 * The two versions cannot be combined. Committing the draft would promote a
 * codebook snapshotted when this editor opened, wiping every codebook edit the
 * other tab saved; loading the saved version closes the draft's transaction and
 * takes the draft with it (#1382). Architect resolves neither on its own — the
 * researcher is offered a way to keep the work and a way to give it up, and
 * until one is chosen nothing is written, reloaded or discarded. Dismissing the
 * dialog leaves the tab exactly as it was, with ProtocolLockBanner still
 * explaining why nothing can be saved.
 */

const CONFLICT_TITLE = 'Choose what to do with your unsaved changes';

const PENDING_DESCRIPTION =
  'The other tab has been closed, so this protocol can be edited here again. Your unsaved changes to this stage were made before that tab saved its own version, and there is no safe way to combine the two. You can download a copy of the protocol as it stands here, with your changes to this stage included in it — that copy will not contain anything the other tab saved. Loading the saved version instead discards your changes to this stage, along with any attributes you added or edited while it was open.';

const DOWNLOADED_DESCRIPTION =
  'Your copy has been downloaded. It contains your changes to this stage, but not the changes the other tab saved, so keep it alongside your protocol rather than in place of it. Nothing in this tab has been changed yet. Loading the saved version now discards your changes to this stage, along with any attributes you added or edited while it was open.';

type StageDraftConflictDialogProps = {
  /** The stage being edited, or `null` when the editor is creating one. */
  stageId: string | null;
  /** Insert position for a stage being created. */
  insertAtIndex?: number;
  /**
   * Merges the identity keys no field owns back onto the form's values. The
   * downloaded copy has to be a protocol the researcher can actually open, and
   * a stage without its `type` matches no member of the schema's union.
   */
  withStageIdentity: (values: Stage) => Stage;
};

const StageDraftConflictDialog = ({
  stageId,
  insertAtIndex,
  withStageIdentity,
}: StageDraftConflictDialogProps) => {
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const { openDialog, closeDialog } = useDialog();
  const [, setLocation] = useLocation();
  // An OPEN nested editor is asked about first (NestedDraftReclaimDialog): the
  // download offered below builds its file from the stage draft, which does not
  // contain that editor's values, so offering it here would hand the researcher
  // a copy silently missing them. Once the inner editor is finished its values
  // ARE in the draft, and this choice becomes the right one to ask.
  //
  // Open, not dirty, because that is the condition `useProtocolTabLock` itself
  // stops on — an untouched editor is seeded from the buffer a reclaim
  // replaces, so it is no safer (see `hasOpenNestedEditor`). Gating this on
  // dirtiness instead put both dialogs on screen at once for a pristine open
  // editor, each telling the researcher to do something different.
  const nestedEditorOpen = useNestedEditorOpen();
  const conflictPending = useAppSelector(
    (state) => getProtocolLockState(state) === 'reclaim-blocked',
  );
  const stageConflictPending = conflictPending && !nestedEditorOpen;
  // Bumped by ProtocolLockBanner when the researcher asks to see the choice
  // again after dismissing it. A change re-runs the effect below, which closes
  // anything still open and asks afresh.
  const choiceRequest = useAppSelector(getProtocolReclaimChoiceRequest);

  // Everything the ask needs, read at the moment it is used. Depending on these
  // directly would restart the effect whenever one changed identity, which
  // means a second dialog stacked on the first.
  const latest = useRef({
    closeDialog,
    dispatch,
    insertAtIndex,
    openDialog,
    reduxStore,
    setLocation,
    stageId,
    withStageIdentity,
  });
  latest.current = {
    closeDialog,
    dispatch,
    insertAtIndex,
    openDialog,
    reduxStore,
    setLocation,
    stageId,
    withStageIdentity,
  };

  const openDialogId = useRef<string | null>(null);

  useEffect(() => {
    if (!stageConflictPending) return;
    // `useNestedEditorOpen` reads its snapshot during render, so an editor that
    // registers in the same commit as this mount is still invisible to it when
    // this effect runs — and `ask` opens its dialog synchronously, before the
    // re-render carrying the true answer could take it away again. The live
    // registry decides. Returning here is not a dead end: that re-render is
    // already scheduled, and the close that eventually resolves the editor
    // flips `stageConflictPending` back on and re-runs this.
    if (hasOpenNestedEditor()) return;
    let cancelled = false;

    // The protocol as it stands in this tab, with the draft applied: the
    // canonical buffer, the editor's working codebook (already overlaid by
    // `getProtocol`), and the stage exactly as the form holds it. The same
    // shape Preview launches, so what the researcher gets is what they see.
    const downloadWithDraft = async (): Promise<boolean> => {
      const {
        dispatch: run,
        openDialog: ask,
        reduxStore: store,
      } = latest.current;
      // The mirror is debounced; without a flush the copy would be missing the
      // last few seconds of typing — in the one download offered to save it.
      flushStageLiveValues();
      const state = store.getState();
      const protocol = getProtocol(state);
      if (!protocol) return false;

      const liveValues = getLiveStageValues(state);
      const withDraft = liveValues
        ? buildProtocolWithStage(
            protocol,
            latest.current.withStageIdentity(liveValues),
            latest.current.stageId,
            latest.current.insertAtIndex,
          )
        : protocol;

      return await downloadActiveProtocol(run, ask, withDraft);
    };

    const ask = async () => {
      let downloaded = false;

      for (;;) {
        if (cancelled) return;
        const id = uuid();
        openDialogId.current = id;
        const choice = await latest.current.openDialog({
          id,
          type: 'choice',
          intent: 'warning',
          size: 'readable',
          title: CONFLICT_TITLE,
          description: downloaded
            ? DOWNLOADED_DESCRIPTION
            : PENDING_DESCRIPTION,
          actions: {
            // Keeping the work leads: it is the only action here that loses
            // nothing, and the other one cannot be taken back.
            // Short enough that all three fit one row of the dialog footer,
            // which does not wrap; the description carries the detail.
            primary: {
              label: 'Download a Copy',
              value: 'download' as const,
            },
            secondary: {
              label: 'Discard My Changes',
              value: 'discard' as const,
            },
            cancel: { label: 'Decide Later', value: null },
          },
        });
        // Only if it is still ours: a re-ask started by `choiceRequest` has
        // already put its own id here, and clearing that would orphan its
        // dialog with no way to take it off the screen.
        if (openDialogId.current === id) openDialogId.current = null;
        if (cancelled) return;

        if (choice === 'download') {
          // The question is still open after a download, so it is asked again —
          // now saying that the copy exists.
          downloaded = (await downloadWithDraft()) || downloaded;
          continue;
        }

        if (choice === 'discard') {
          // Clearing the draft is also what releases the blocked reclaim:
          // `useProtocolTabLock` then re-reads the saved copy and hands editing
          // back. Leaving the editor too, exactly as the banner's discard does
          // — a form left mounted over a closed transaction reports itself
          // unchanged and can never be saved again.
          latest.current.dispatch(resetDraft(null));
          latest.current.setLocation('/protocol');
        }

        return;
      }
    };

    void ask();

    return () => {
      cancelled = true;
      const id = openDialogId.current;
      openDialogId.current = null;
      // The question stopped being the right one — the other tab re-claimed the
      // protocol, or the draft was discarded from the banner instead. Take the
      // dialog away rather than leave a stale choice on screen.
      if (id) void latest.current.closeDialog(id, null);
    };
  }, [stageConflictPending, choiceRequest]);

  return null;
};

export default StageDraftConflictDialog;
