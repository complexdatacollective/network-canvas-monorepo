import { useCallback, useContext, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog, { type DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import { useFormMeta } from '@codaco/fresco-ui/form/hooks/useFormState';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { Layout } from '~/components/EditorLayout';

import { confirmDiscardNestedDraft } from './confirmDiscardNestedDraft';
import {
  withFormLevelValidate,
  type FormLevelValidate,
  type LenientSubmitHandler,
} from './formLevelValidate';
import { isFormStoreDirty } from './formStoreDirty';
import { useNestedDraft } from './nestedDraftRegistry';

export type DialogFormProps = {
  /** Whether the dialog is open. */
  open: boolean;
  /** Closes the dialog — called on Cancel and after a successful submit. */
  onClose: () => void;
  title?: React.ReactNode;
  /**
   * Stable, human-readable NAME for the underlying `<form>` (e.g.
   * `'editable-list-form'`). It is only the stem of the element's DOM id — a
   * per-instance suffix is appended (see `DialogFormBody`) — so callers may
   * reuse one name across every editor dialog of a kind.
   */
  formId: string;
  /** Footer submit button label, e.g. 'Add' or 'Save'. */
  submitLabel: string;
  cancelLabel?: string;
  /**
   * Called with the form's values on submit, after `validate` (if provided)
   * has passed. May return `{success: false, fieldErrors}` to keep the
   * dialog open with those errors displayed (e.g. from an async uniqueness
   * check), or void/`{success: true}` for a plain success.
   */
  onSubmit: LenientSubmitHandler;
  /**
   * Form-level validation run before `onSubmit`. A non-empty result
   * short-circuits the submit with those field errors — see
   * ./formLevelValidate.
   */
  validate?: FormLevelValidate;
  /**
   * The committed array index of the item being edited, when this dialog
   * edits one member of a field array. Forwarded to `validate` as context —
   * see DialogArrayField's `editorValidate`.
   */
  editIndex?: number;
  /**
   * Shared-layout id, for a dialog that animates out of the element that
   * opened it (an array row's Edit button — see arrayFields/DialogArrayField).
   */
  layoutId?: string;
  style?: React.CSSProperties;
  /**
   * Where focus RETURNS when this dialog closes. Resolve lazily (a function) —
   * it is read after the exit animation, by which time a control that unmounted
   * while the dialog was open has been remounted as a different element.
   */
  finalFocus?: DialogProps['finalFocus'];
  children?: React.ReactNode;
};

/** Distinguishes concurrently mounted forms — see `domFormId` below. */
let nextDialogFormInstance = 0;

const DialogFormBody = ({
  open,
  onClose,
  title,
  formId,
  submitLabel,
  cancelLabel = 'Cancel',
  onSubmit,
  validate,
  editIndex,
  layoutId,
  style,
  finalFocus,
  children,
}: DialogFormProps) => {
  const { isSubmitting } = useFormMeta();
  const storeApi = useContext(FormStoreContext);
  const { openDialog } = useDialog();

  /**
   * Every dialog form is guarded by construction. The previous arrangement was
   * opt-in per caller (`DirtyProbe` + a hand-written confirm in
   * `NewVariableWindow` and `EntityTypeDialog`), and the array-row editor —
   * the one in the bug report — simply never opted in.
   */
  const isDirty = useCallback(
    () => (storeApi ? isFormStoreDirty(storeApi) : false),
    [storeApi],
  );

  useNestedDraft(open, isDirty);

  /**
   * The footer's SubmitButton is not a descendant of the `<form>` — it sits in
   * the dialog footer — so it associates with it through the native `form=`
   * attribute, which resolves by DOM id. That resolution takes the FIRST
   * element with the id in document order, so the id has to be unique in the
   * document, and a caller-supplied `formId` is not: a dialog stays mounted
   * while it animates closed (Base UI `keepMounted` under `AnimatePresence`),
   * so a second dialog of the same kind opened during that window renders a
   * second `<form>` with the same id. The new dialog's Submit then resolved to
   * the OLD, closing form, and pressing it did nothing at all — no submit, no
   * error, the dialog simply stayed open. Suffixing makes each mounted form
   * addressable on its own; the caller's name is kept as the stem so the ids
   * stay legible.
   *
   * The suffix is a per-MOUNT counter rather than `useId`, which answers by
   * tree position: a dialog that closes and reopens in the same slot remounts
   * there and would be handed the same id again, recreating the collision for
   * exactly the overlap this guards against.
   */
  const [domFormId] = useState(() => {
    nextDialogFormInstance += 1;
    return `${formId}-${nextDialogFormInstance}`;
  });

  /**
   * Cancel, the close button, Escape and a backdrop click all arrive here —
   * fresco-ui's `Dialog` routes every dismissal through the single
   * `closeDialog` prop — so one gate covers all four. Before this, a dirty
   * nested editor was discarded silently by every one of them.
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;

    if (!isDirty()) {
      onClose();
      return;
    }

    void confirmDiscardNestedDraft(openDialog).then((confirmed) => {
      if (confirmed) onClose();
    });
  }, [isDirty, isSubmitting, onClose, openDialog]);

  const handleSubmit = withFormLevelValidate(onSubmit, validate, {
    editIndex,
  });

  return (
    <Dialog
      open={open}
      closeDialog={handleClose}
      dismissible={!isSubmitting}
      title={title}
      size="editor"
      layoutId={layoutId}
      style={style}
      finalFocus={finalFocus}
      footer={
        <>
          <Button color="default" onClick={handleClose} disabled={isSubmitting}>
            {cancelLabel}
          </Button>
          <SubmitButton form={domFormId}>{submitLabel}</SubmitButton>
        </>
      }
    >
      <Layout>
        <FormWithoutProvider id={domFormId} onSubmit={handleSubmit}>
          {children}
        </FormWithoutProvider>
      </Layout>
    </Dialog>
  );
};

/**
 * The InlineEditScreen + InlineEditScreen/Form replacement: a dialog whose
 * body is a fresco-ui form, submitted via a footer `SubmitButton` associated
 * to the form by DOM id (`form={formId}`) rather than being a form
 * descendant. Per-field `initialValue`s are the caller's concern (pass them
 * to the `Field`s rendered as `children`); use a React `key` on `DialogForm`
 * if a fresh field store is needed when switching what's being edited (the
 * fresco-ui form store does not itself support whole-form reinitialize).
 */
const DialogForm = (props: DialogFormProps) => (
  <FormStoreProvider>
    <DialogFormBody {...props} />
  </FormStoreProvider>
);

export default DialogForm;
