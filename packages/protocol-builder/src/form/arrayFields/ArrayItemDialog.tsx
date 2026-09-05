import { type CSSProperties, type ReactNode, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog, { type DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FormSubmissionResult,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { ResizableFlexPanel } from '@codaco/fresco-ui/ResizableFlexPanel';

/**
 * ────────────────────────────────────────────────────────────────────────────
 * THIN ADAPTER — REPLACE WITH THE PACKAGE `DialogForm`.
 *
 * The package-owned `DialogForm` primitive (`src/form/DialogForm.tsx`) is
 * being extracted in parallel and had not landed when the list editors moved.
 * This stands in for it so `DialogArrayField` could be ported without waiting,
 * and it is deliberately the SMALLEST thing that works: a dialog whose body is
 * a Fresco form, submitted from a footer button associated by DOM id.
 *
 * What it does NOT yet do, and what adopting the real primitive must restore:
 *
 * - the unsaved-draft guard that asks before a dismissal throws work away, and
 *   the registration that lets an enclosing editor refuse a save while a
 *   nested draft is open (Architect's `useNestedDraftDialog` /
 *   `useRefusedNestedCommit`).
 *
 * Everything else here — the per-mount form id, the form-level validate, the
 * `aside` split — is behaviour `DialogArrayField` depends on and should be
 * satisfied by the real primitive rather than kept as a second copy.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Context surfaced to a form-level `validate`: the committed array index of
 * the row being edited, so a sibling-duplicate check can exclude that row. A
 * new (not-yet-committed) row reports no index.
 */
export type FormLevelValidateContext = { editIndex?: number };

/**
 * A form-level validator run at the top of onSubmit, ahead of the caller's own
 * onSubmit. A non-empty result short-circuits the submit with those field
 * errors.
 */
export type FormLevelValidate = (
  values: Record<string, FieldValue>,
  context?: FormLevelValidateContext,
) => Record<string, string | string[]> | undefined;

/**
 * A submit handler that may resolve without an explicit result. Some callers
 * signal success by simply not throwing.
 */
export type LenientSubmitHandler = (
  values: Record<string, FieldValue>,
) => FormSubmissionResult | void | Promise<FormSubmissionResult | void>;

// `FormSubmissionResult`'s fieldErrors are string[]; a form-level validate may
// report a single message per field as a bare string, so normalize it here.
const normalizeFieldErrors = (
  errors: Record<string, string | string[]>,
): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(errors).map(([field, message]) => [
      field,
      Array.isArray(message) ? message : [message],
    ]),
  );

/**
 * Wraps a caller's onSubmit with a form-level `validate` run first. A
 * non-empty validate result short-circuits to `{success: false, fieldErrors}`
 * without invoking onSubmit, so it flows through fresco-ui's normal
 * invalid-submit path exactly like a field-level validation failure.
 */
function withFormLevelValidate(
  onSubmit: LenientSubmitHandler,
  validate?: FormLevelValidate,
  context?: FormLevelValidateContext,
): FormSubmitHandler {
  return async (values) => {
    if (validate) {
      const errors = validate(values, context);
      if (errors && Object.keys(errors).length > 0) {
        return { success: false, fieldErrors: normalizeFieldErrors(errors) };
      }
    }

    const result = await onSubmit(values);
    return result ?? { success: true };
  };
}

export type ArrayItemDialogProps = {
  open: boolean;
  /** Closes the dialog — called on Cancel and after a successful submit. */
  onClose: () => void;
  title?: ReactNode;
  /**
   * Stable, human-readable NAME for the underlying `<form>`. It is only the
   * stem of the element's DOM id — a per-instance suffix is appended — so
   * callers may reuse one name across every editor dialog of a kind.
   */
  formId: string;
  submitLabel: string;
  cancelLabel?: string;
  onSubmit: LenientSubmitHandler;
  validate?: FormLevelValidate;
  editIndex?: number;
  layoutId?: string;
  style?: CSSProperties;
  size?: DialogProps['size'];
  /**
   * Where focus RETURNS when this dialog closes. Resolve lazily — it is read
   * after the exit animation, by which time a control that unmounted while the
   * dialog was open has been remounted as a different element.
   */
  finalFocus?: DialogProps['finalFocus'];
  /** Supporting content rendered beside the form, outside the form element. */
  aside?: ReactNode;
  children?: ReactNode;
};

/** Distinguishes concurrently mounted forms — see `domFormId` below. */
let nextDialogFormInstance = 0;

function ArrayItemDialogBody({
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
}: ArrayItemDialogProps) {
  /**
   * The footer's SubmitButton is not a descendant of the `<form>` — it sits in
   * the dialog footer — so it associates with it through the native `form=`
   * attribute, which resolves by DOM id. That resolution takes the FIRST
   * element with the id in document order, so the id has to be unique in the
   * document, and a caller-supplied `formId` is not: a dialog stays mounted
   * while it animates closed, so a second dialog of the same kind opened
   * during that window renders a second `<form>` with the same id, and the new
   * dialog's Submit resolves to the old, closing one.
   *
   * The suffix is a per-MOUNT counter rather than `useId`, which answers by
   * tree position: a dialog that closes and reopens in the same slot remounts
   * there and would be handed the same id again.
   */
  const [domFormId] = useState(() => {
    nextDialogFormInstance += 1;
    return `${formId}-${nextDialogFormInstance}`;
  });

  const handleSubmit = withFormLevelValidate(
    onSubmit,
    validate,
    editIndex === undefined ? {} : { editIndex },
  );

  return (
    <Dialog
      open={open}
      closeDialog={onClose}
      title={title}
      layoutId={layoutId}
      style={style}
      finalFocus={finalFocus}
      size={size ?? (aside ? 'workspace' : undefined)}
      footer={
        <>
          <Button color="default" onClick={onClose}>
            {cancelLabel}
          </Button>
          <SubmitButton form={domFormId}>{submitLabel}</SubmitButton>
        </>
      }
    >
      {aside ? (
        // Keep every responsive rule below anchored to Dialog's container.
        // Making this panel a container would make its descendants query the
        // narrower inner width while the panel itself still queries Dialog.
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
}

/**
 * A dialog whose body is a Fresco form, submitted via a footer `SubmitButton`
 * associated to the form by DOM id rather than by being a form descendant.
 *
 * Per-field `initialValue`s are the caller's concern; use a React `key` when a
 * fresh field store is needed for a different row, because the Fresco form
 * store has no whole-form reinitialise.
 */
export default function ArrayItemDialog(props: ArrayItemDialogProps) {
  return (
    <FormStoreProvider>
      <ArrayItemDialogBody {...props} />
    </FormStoreProvider>
  );
}
