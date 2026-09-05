import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import Dialog, { type DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type {
  FieldProps,
  ValidFieldComponent,
} from '@codaco/fresco-ui/form/Field/types';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import { useFormMeta } from '@codaco/fresco-ui/form/hooks/useFormState';
import FormStoreProvider, {
  FormStoreContext,
  selectIsFormDirty,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

/**
 * What a form-level check reports. `formErrors` describe the submission as a
 * whole and are rendered by Fresco's `FormErrors` above the fields;
 * `fieldErrors` attach to a named field, for a check a single field cannot
 * make on its own — a value that has to be unique among its siblings, say.
 */
export type DialogFormErrors = Readonly<{
  formErrors?: readonly string[];
  fieldErrors?: Readonly<Record<string, string | readonly string[]>>;
}>;

/**
 * A check over the whole draft, run after every field has validated itself and
 * before `onSubmit`. Returning nothing — or an empty result — means the draft
 * may be submitted.
 */
export type DialogFormValidate = (
  values: Record<string, FieldValue>,
) => DialogFormErrors | undefined;

export type DialogFormProps = Readonly<{
  /** Whether the dialog is on screen. */
  open: boolean;
  /**
   * Closes the dialog. Called once a submit has succeeded, and on a dismissal
   * the researcher has nothing to lose by — or has confirmed.
   */
  onClose: () => void;
  title: string;
  /** Supporting prose under the title, for a dialog whose title cannot carry it. */
  description?: ReactNode;
  /**
   * A stable, human-readable name for the `<form>` element — `'rule-editor'`,
   * `'prompt-editor'`. It is only the stem of the element's DOM id, so the
   * same name may be reused by every dialog of a kind.
   */
  formId: string;
  /**
   * What the draft starts as, keyed by field name. Read by `DialogFormField`,
   * so a field that names a key opens holding its value. An absent value is
   * `undefined`; there is no `null`.
   */
  initialValues?: Readonly<Record<string, FieldValue>>;
  validate?: DialogFormValidate;
  /**
   * Receives the draft once every field and `validate` have passed. The dialog
   * closes when this resolves.
   *
   * Throwing keeps it open with the draft intact and reports the failure above
   * the fields, so write the thrown message for the researcher who has to act
   * on it — 'That name is already used by another rule.', not a stack trace. A
   * failure carrying no message of its own falls back to Fresco's generic,
   * translated wording; nothing is ever swallowed.
   */
  onSubmit: (values: Record<string, FieldValue>) => void | Promise<void>;
  /** Footer submit label — 'Save', 'Add rule'. */
  submitLabel: string;
  cancelLabel?: string;
  /** Semantic width preset, forwarded to `Dialog`. */
  size?: DialogProps['size'];
  /**
   * Where focus RETURNS when the dialog closes. Prefer a function: it is
   * resolved after the exit animation, by which time a control that unmounted
   * while the dialog was open has been remounted as a different element.
   */
  finalFocus?: DialogProps['finalFocus'];
  children: ReactNode;
}>;

const NO_INITIAL_VALUES: Readonly<Record<string, FieldValue>> = Object.freeze(
  {},
);

const DialogFormInitialValuesContext =
  createContext<Readonly<Record<string, FieldValue>>>(NO_INITIAL_VALUES);

/**
 * A field inside a `DialogForm`, seeded from the dialog's `initialValues`.
 *
 * The stage editor's own `ProtocolField` reads its starting value from the
 * stage document, which a dialog editing a rule or a single row is not part
 * of — so this is the same idea against the values the dialog was opened with.
 * A field may still state its own `initialValue`, which wins.
 */
export function DialogFormField<C extends ValidFieldComponent>(
  props: FieldProps<C>,
) {
  const initialValues = useContext(DialogFormInitialValuesContext);
  const fieldProps = {
    ...props,
    initialValue: props.initialValue ?? initialValues[props.name],
  } as FieldProps<C>;

  return <Field<C> {...fieldProps} />;
}

/** Distinguishes concurrently mounted forms — see `domFormId` below. */
let nextDialogFormInstance = 0;

const normalizeFieldErrors = (
  fieldErrors: DialogFormErrors['fieldErrors'],
): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(fieldErrors ?? {}).map(([field, messages]) => [
      field,
      typeof messages === 'string' ? [messages] : [...messages],
    ]),
  );

/**
 * What a failed save has to say for itself, or `undefined` when it says
 * nothing worth reading.
 *
 * A host throws to report that it could not take the draft — a name already
 * used by a sibling only it can see, a write that was refused — and the
 * researcher is the person who has to act on that, so the reason is put above
 * the fields rather than swallowed. A failure with no message of its own is
 * left to Fresco, whose form hook already renders one translated sentence for
 * exactly this case; duplicating that string here would be a second copy to
 * translate and to keep in step.
 */
const failureMessage = (failure: unknown): string | undefined => {
  if (!(failure instanceof Error)) return undefined;
  const message = failure.message.trim();
  return message === '' ? undefined : message;
};

const hasErrors = (errors: DialogFormErrors | undefined): boolean =>
  errors !== undefined &&
  ((errors.formErrors?.length ?? 0) > 0 ||
    Object.keys(errors.fieldErrors ?? {}).length > 0);

function DialogFormBody({
  open,
  onClose,
  title,
  description,
  formId,
  initialValues = NO_INITIAL_VALUES,
  validate,
  onSubmit,
  submitLabel,
  cancelLabel = 'Cancel',
  size,
  finalFocus,
  children,
}: DialogFormProps) {
  const storeApi = useContext(FormStoreContext);
  const { confirm } = useDialog();
  const { isSubmitting } = useFormMeta();

  /**
   * The footer's submit control is not a descendant of the `<form>` — it sits
   * in the dialog footer — so it associates with it through the native `form=`
   * attribute, which resolves by DOM id and takes the FIRST element with that
   * id in document order. A dialog stays mounted while it animates closed, so
   * a second dialog of the same kind opened during that window would render a
   * second `<form>` under the caller's name, and the new dialog's submit would
   * resolve to the old, closing one. The caller's name stays the stem so the
   * ids remain legible; the suffix is a per-mount counter rather than `useId`,
   * which answers by tree position and would hand a reopened dialog the same
   * id again.
   */
  const [domFormId] = useState(() => {
    nextDialogFormInstance += 1;
    return `${formId}-${nextDialogFormInstance}`;
  });

  /**
   * A live comparison against the values the fields registered with, never the
   * store's own sticky `isDirty` flag — that never returns to false once
   * anything has been typed, and would ask about a draft the researcher had
   * already put back by hand.
   */
  const isDirty = useCallback(
    () => (storeApi ? selectIsFormDirty(storeApi.getState()) : false),
    [storeApi],
  );

  /**
   * Cancel, the close button, Escape and a click outside all arrive here —
   * Fresco's `Dialog` routes every dismissal through one `closeDialog` — so a
   * single gate covers all four.
   *
   * Deliberately not the route a successful submit takes: there is nothing
   * left to lose by then, and asking would be a question about work that has
   * just been saved.
   */
  const requestClose = useCallback(() => {
    if (isSubmitting) return;

    if (!isDirty()) {
      onClose();
      return;
    }

    void (async () => {
      const confirmed = await confirm({
        title: 'Discard your changes?',
        description:
          'This editor holds changes that have not been saved. Closing it now discards them.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        intent: 'warning',
        onConfirm: () => undefined,
      });
      if (confirmed === true) onClose();
    })();
  }, [confirm, isDirty, isSubmitting, onClose]);

  /**
   * Fresco runs every field's own validation before this is reached, so the
   * form-level check only ever sees a draft whose individual fields are
   * already good. Reporting through the submission result — rather than
   * throwing — is what puts the errors on the same path as a field-level
   * failure, so the first offending control is focused for correction. A save
   * that fails takes the same route, for the same reason: only a submission
   * that SUCCEEDS reaches `onClose`.
   */
  const handleSubmit: FormSubmitHandler = async (values) => {
    const errors = validate?.(values);
    if (hasErrors(errors)) {
      return {
        success: false,
        formErrors: [...(errors?.formErrors ?? [])],
        fieldErrors: normalizeFieldErrors(errors?.fieldErrors),
      };
    }

    try {
      await onSubmit(values);
    } catch (failure) {
      const reason = failureMessage(failure);
      // Nothing to report of its own: hand it back to Fresco's own catch,
      // which renders the generic message. The dialog stays open either way,
      // because `onClose` below is never reached.
      if (reason === undefined) throw failure;
      return { success: false, formErrors: [reason], fieldErrors: {} };
    }

    onClose();
    return { success: true };
  };

  return (
    <Dialog
      open={open}
      closeDialog={requestClose}
      dismissible={!isSubmitting}
      title={title}
      description={description}
      size={size}
      finalFocus={finalFocus}
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
      <DialogFormInitialValuesContext value={initialValues}>
        <FormWithoutProvider id={domFormId} onSubmit={handleSubmit}>
          {children}
        </FormWithoutProvider>
      </DialogFormInitialValuesContext>
    </Dialog>
  );
}

/**
 * A dialog that edits one self-contained thing — a rule, a prompt, one row of
 * an array — inside a form store of its own.
 *
 * That store is the point. The editor is opened from inside the stage form,
 * but nothing typed in it reaches that form until the researcher saves: the
 * draft is separate until it is committed, so abandoning it leaves the stage
 * exactly as it was. It is the same shape as the auxiliary sessions the
 * package already uses for nested codebook editing, one level down.
 *
 * It knows nothing about what it is editing. The values are whatever the
 * fields inside it are named, and identity — a record's id, a stage's type —
 * belongs to whatever opened the dialog, never to the draft on screen.
 */
export default function DialogForm(props: DialogFormProps) {
  return (
    <FormStoreProvider>
      <DialogFormBody {...props} />
    </FormStoreProvider>
  );
}
