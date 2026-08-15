import { useCallback, useContext } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useFormMeta } from '@codaco/fresco-ui/form/hooks/useFormState';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import { confirmDiscardNestedDraft } from './confirmDiscardNestedDraft';
import { isFormStoreDirty } from './formStoreDirty';
import { useNestedDraft } from './nestedDraftRegistry';

type NestedDraftDialogOptions = {
  /** Whether the dialog is open. */
  open: boolean;
  /**
   * Closes the dialog. Called straight away when there is nothing to lose, and
   * only after the researcher confirms when there is.
   */
  onClose: () => void;
};

/**
 * The two things a dialog holding a form owes the researcher, in one place: it
 * declares its half-typed values to the nested-draft registry for as long as it
 * is open, so every guard that could destroy them (Back, refresh, a read-only
 * demotion, a cross-tab reclaim) can see them; and every route that DISMISSES
 * it asks first.
 *
 * Extracted from `DialogForm`, which was the only registrant that owned a
 * dialog, because the registry is not a `DialogForm` feature — `Query/Rules`
 * already registers its own draft directly, and the Geospatial API-key browser
 * is a dialog that cannot be a `DialogForm` (see APIKeyBrowser). Two copies of
 * this would drift, and the copy that drifts loses somebody's work.
 *
 * Must be called under a `FormStoreProvider` that is a PARENT of the dialog:
 * the dismissal routes it guards (the footer Cancel, the close button, Escape,
 * a backdrop click) live outside the `<form>` element, and they have to be able
 * to ask whether the fields inside it hold anything.
 *
 * Dirtiness is `isFormStoreDirty` — a live comparison against the values the
 * fields registered with, never the form store's own sticky `isDirty` flag,
 * which never returns to false once anything has been typed and would nag about
 * a form the researcher had already restored by hand.
 */
export const useNestedDraftDialog = ({
  open,
  onClose,
}: NestedDraftDialogOptions) => {
  const storeApi = useContext(FormStoreContext);
  const { openDialog } = useDialog();
  const { isSubmitting } = useFormMeta();

  const isDirty = useCallback(
    () => (storeApi ? isFormStoreDirty(storeApi) : false),
    [storeApi],
  );

  useNestedDraft(open, isDirty);

  /**
   * Cancel, the close button, Escape and a backdrop click all arrive here —
   * fresco-ui's `Dialog` routes every dismissal through the single `closeDialog`
   * prop — so one gate covers all four. Before this, a dirty nested editor was
   * discarded silently by every one of them.
   *
   * Deliberately NOT the route a dialog takes when it has DONE what it is for
   * (a successful submit): that closes with `onClose` directly, because there
   * is nothing left to lose and a confirmation there would be a question about
   * work the researcher has just saved.
   */
  const requestClose = useCallback(() => {
    if (isSubmitting) return;

    if (!isDirty()) {
      onClose();
      return;
    }

    void confirmDiscardNestedDraft(openDialog).then((confirmed) => {
      if (confirmed) onClose();
    });
  }, [isDirty, isSubmitting, onClose, openDialog]);

  return { isSubmitting, requestClose };
};
