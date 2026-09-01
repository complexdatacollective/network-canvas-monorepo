import { useCallback, useId } from 'react';
import { z } from 'zod/mini';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  CustomFieldValidation,
  FieldValue,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import {
  PROTOCOL_NAME_MAX_LENGTH,
  PROTOCOL_NAME_TOO_LONG_MESSAGE,
} from '~/config';
import countGraphemes from '~/utils/countGraphemes';

/**
 * The same cap the editor's own name control enforces, counted the same way.
 *
 * NOT fresco-ui's built-in `maxLength`, which measures `value.length` — UTF-16
 * code units. That would refuse a 20-emoji name (160 code units) that the
 * editor accepts and commits, so a researcher could not create the protocol
 * they can rename into. One unit, one number, one message across both surfaces.
 *
 * Soft (blocks submission with a visible error) rather than hard (dropping
 * keystrokes) because this surface HAS a submit gate: a 300-character paste
 * stays in the field, is explained, and can be edited down. The editor's
 * blur-commit control has no such gate, which is why it caps hard instead.
 *
 * Module-level, and a schema FACTORY rather than a schema value, for the reason
 * `toZodValidation.ts` documents: `useField` memoises its validation on
 * `JSON.stringify` of the validation props. A function is dropped by
 * `JSON.stringify`, so the memo key stays a tiny constant; handing it a live
 * Zod object instead would serialise that object's internals on every render.
 */
const nameLengthValidation: CustomFieldValidation = {
  schema: () =>
    z.unknown().check(
      z.superRefine((value, ctx) => {
        if (typeof value !== 'string') return;
        if (countGraphemes(value.trim()) <= PROTOCOL_NAME_MAX_LENGTH) return;
        ctx.addIssue({
          code: 'custom',
          input: value,
          message: PROTOCOL_NAME_TOO_LONG_MESSAGE,
          path: [],
        });
      }),
    ),
  hint: `Enter at most ${PROTOCOL_NAME_MAX_LENGTH} characters.`,
};

type NewProtocolDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { name: string }) => void;
  title?: string;
  initialName?: string;
};

const NewProtocolDialog = ({
  open,
  onOpenChange,
  onSubmit,
  title = 'Create New Protocol',
  initialName = '',
}: NewProtocolDialogProps) => {
  const formId = useId();

  const handleOpenChange = useCallback(
    (newOpen: boolean) => onOpenChange(newOpen),
    [onOpenChange],
  );

  const handleSubmit = useCallback(
    (values: Record<string, FieldValue>): FormSubmissionResult => {
      const name = typeof values.name === 'string' ? values.name.trim() : '';

      if (!name) {
        return {
          success: false,
          fieldErrors: {
            name: ['Protocol name is required'],
          },
        };
      }

      onSubmit({ name });
      return { success: true };
    },
    [onSubmit],
  );

  return (
    <FormStoreProvider>
      <Dialog
        open={open}
        closeDialog={() => handleOpenChange(false)}
        title={title}
        size="readable"
        footer={
          <>
            <Button color="default" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId}>Create Protocol</SubmitButton>
          </>
        }
      >
        <FormWithoutProvider id={formId} onSubmit={handleSubmit}>
          <Field
            name="name"
            label="Protocol Name"
            hint={`Use a short, recognizable name of up to ${PROTOCOL_NAME_MAX_LENGTH} characters. Include a version number or date when it helps distinguish drafts, but avoid long project notes.`}
            component={InputField}
            initialValue={initialName}
            placeholder="Enter a name for your protocol..."
            required="Protocol name is required"
            custom={nameLengthValidation}
            dir="auto"
            autoFocus
          />
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
};

export default NewProtocolDialog;
