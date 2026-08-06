import { useCallback } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import { useFormMeta } from '@codaco/fresco-ui/form/hooks/useFormState';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { Layout } from '~/components/EditorLayout';

import {
  withFormLevelValidate,
  type FormLevelValidate,
  type LenientSubmitHandler,
} from './formLevelValidate';

export type DialogFormProps = {
  /** Whether the dialog is open. */
  open: boolean;
  /** Closes the dialog — called on Cancel and after a successful submit. */
  onClose: () => void;
  title?: React.ReactNode;
  /**
   * DOM id for the underlying `<form>`. The footer's SubmitButton associates
   * with it via the native `form=` attribute so it can live outside the form
   * element, in the dialog footer. Callers pass stable ids (e.g.
   * `'editable-list-form'`) — the same id is safe to reuse across every
   * editor dialog of a kind, since only one such dialog is ever open at once.
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
  children?: React.ReactNode;
};

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
  children,
}: DialogFormProps) => {
  const { isSubmitting } = useFormMeta();

  const handleClose = useCallback(() => {
    if (!isSubmitting) onClose();
  }, [isSubmitting, onClose]);

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
      footer={
        <>
          <Button color="default" onClick={handleClose} disabled={isSubmitting}>
            {cancelLabel}
          </Button>
          <SubmitButton form={formId}>{submitLabel}</SubmitButton>
        </>
      }
    >
      <Layout>
        <FormWithoutProvider id={formId} onSubmit={handleSubmit}>
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
