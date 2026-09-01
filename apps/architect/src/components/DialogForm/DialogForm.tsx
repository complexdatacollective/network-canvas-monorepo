import { useCallback, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog, { type DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { ResizableFlexPanel } from '@codaco/fresco-ui/ResizableFlexPanel';
import { useRefusedNestedCommit } from '~/hooks/useRefusedNestedCommit';

import {
  withFormLevelValidate,
  type FormLevelValidate,
  type LenientSubmitHandler,
} from './formLevelValidate';
import { useNestedDraftDialog } from './useNestedDraftDialog';

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
  /** Semantic width preset forwarded to the underlying Dialog. */
  size?: DialogProps['size'];
  /**
   * Where focus RETURNS when this dialog closes. Resolve lazily (a function) —
   * it is read after the exit animation, by which time a control that unmounted
   * while the dialog was open has been remounted as a different element.
   */
  finalFocus?: DialogProps['finalFocus'];
  /**
   * Optional supporting content rendered beside the form in a workspace-sized
   * dialog. It remains outside the form element, so interactive previews can
   * own their own form semantics without nesting forms.
   */
  aside?: React.ReactNode;
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
  size,
  finalFocus,
  aside,
  children,
}: DialogFormProps) => {
  const refusedCommit = useRefusedNestedCommit();

  /**
   * Every dialog form is guarded by construction. The previous arrangement was
   * opt-in per caller (`DirtyProbe` + a hand-written confirm in
   * `NewVariableWindow` and `EntityTypeDialog`), and the array-row editor —
   * the one in the bug report — simply never opted in.
   *
   * The registration and the confirm-before-dismissal both live in
   * `useNestedDraftDialog`, which the Geospatial API-key browser — a dialog
   * that is not and cannot be a `DialogForm` — uses on exactly the same terms.
   */
  const { isSubmitting, requestClose } = useNestedDraftDialog({
    open,
    onClose,
  });

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
   * A tab that cannot save must not accept a Finish that looks like it worked
   * — see `useRefusedNestedCommit` for which commits that covers and why.
   */
  const guardedSubmit = useCallback<LenientSubmitHandler>(
    async (values) => {
      const refusal = refusedCommit();
      if (refusal) return { success: false, formErrors: [refusal] };
      return await onSubmit(values);
    },
    [onSubmit, refusedCommit],
  );

  const handleSubmit = withFormLevelValidate(guardedSubmit, validate, {
    editIndex,
  });

  return (
    <Dialog
      open={open}
      closeDialog={requestClose}
      dismissible={!isSubmitting}
      title={title}
      layoutId={layoutId}
      style={style}
      finalFocus={finalFocus}
      size={size ?? (aside ? 'workspace' : undefined)}
      footer={
        <>
          <Button
            color="default"
            onClick={requestClose}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </Button>
          <SubmitButton form={domFormId}>{submitLabel}</SubmitButton>
        </>
      }
    >
      {aside ? (
        // Keep every responsive rule below anchored to Dialog's container.
        // Making this panel a container would make its descendants query the
        // narrower inner width while the panel itself still queries Dialog,
        // desynchronising the split layout and the handle's visibility.
        <ResizableFlexPanel
          storageKey={`${formId}-workspace-split`}
          defaultBasis={50}
          min={30}
          max={70}
          stickyHandle
          aria-label="Resize form and preview panes"
          className="[&>button>span]:bg-text/30 @min-[60rem]:[&>button:hover>span]:bg-text/50 @min-[60rem]:[&>button:focus-visible>span]:bg-text/50 w-full min-w-0 flex-col items-start gap-8 @min-[60rem]:flex-row @min-[60rem]:gap-0 [&>button]:hidden @min-[60rem]:[&>button]:flex"
        >
          <FormWithoutProvider
            id={domFormId}
            onSubmit={handleSubmit}
            className="min-w-0 @min-[60rem]:pr-4"
          >
            {children}
          </FormWithoutProvider>
          <aside className="z-10 min-w-0 @min-[60rem]:sticky @min-[60rem]:top-0 @min-[60rem]:pl-4">
            {aside}
          </aside>
        </ResizableFlexPanel>
      ) : (
        <FormWithoutProvider id={domFormId} onSubmit={handleSubmit}>
          {children}
        </FormWithoutProvider>
      )}
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
