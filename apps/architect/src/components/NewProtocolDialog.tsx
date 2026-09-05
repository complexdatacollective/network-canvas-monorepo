import { useRef, useCallback, useId } from 'react';

import {
  type IntlShape,
  createMessageError,
  defineMessages,
} from '@codaco/app-i18n/messages';
const makeNameLengthValidation = (
  getIntl: () => IntlShape,
): CustomFieldValidation => ({
  schema: () =>
    z.unknown().check(
      z.superRefine((value, ctx) => {
        if (typeof value !== 'string') return;
        if (countGraphemes(value.trim()) <= PROTOCOL_NAME_MAX_LENGTH) return;
        ctx.addIssue({
          code: 'custom',
          input: value,
          message: getIntl().formatMessage(PROTOCOL_NAME_TOO_LONG_MESSAGE, {
            max: PROTOCOL_NAME_MAX_LENGTH,
          }),
          path: [],
        });
      }),
    ),
  hint: '',
});

import { z } from 'zod/mini';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
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
const remainingMessages = defineMessages({
  protocolNameIsRequired: {
    id: 'architect.remaining.newProtocolDialog.protocolNameIsRequired',
    defaultMessage: 'Protocol name is required',
    description: 'The required text in components / NewProtocolDialog.',
  },
});
const messages = defineMessages({
  createProtocol: {
    id: 'architect.newProtocolDialog.createProtocol',
    defaultMessage: 'Create Protocol',
    description: 'Visible text in components / NewProtocolDialog.',
  },
  protocolName: {
    id: 'architect.newProtocolDialog.protocolName',
    defaultMessage: 'Protocol Name',
    description: 'The label text in components / NewProtocolDialog.',
  },
  optionUseAShortRecognizableNameOf: {
    id: 'architect.newProtocolDialog.useAShortRecognizableNameOf',
    defaultMessage:
      'Use a short, recognizable name of up to {PROTOCOL_NAME_MAX_LENGTH} characters. Include a version number or date when it helps distinguish drafts, but avoid long project notes.',
    description: 'The hint text in components / NewProtocolDialog.',
  },
  enterANameForYourProtocol: {
    id: 'architect.newProtocolDialog.enterANameForYourProtocol',
    defaultMessage: 'Enter a name for your protocol...',
    description: 'The placeholder text in components / NewProtocolDialog.',
  },
});
const extraMessages = defineMessages({
  title: {
    id: 'architect.newProtocolDialog.title',
    defaultMessage: 'Create New Protocol',
    description: 'Researcher-facing Architect control or feedback.',
  },
});
const finalMessages = defineMessages({
  required: {
    id: 'architect.final.components.NewProtocolDialog.required',
    defaultMessage: 'Protocol name is required',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

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
  title,
  initialName = '',
}: NewProtocolDialogProps) => {
  const intl = useAppIntl();
  const formId = useId();
  const intlRef = useRef(intl);
  intlRef.current = intl;
  const nameLengthValidation = useRef(
    makeNameLengthValidation(() => intlRef.current),
  );

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
            name: [createMessageError(finalMessages.required)],
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
        title={title ?? intl.formatMessage(extraMessages.title)}
        size="readable"
        footer={
          <>
            <Button color="default" onClick={() => handleOpenChange(false)}>
              {intl.formatMessage(commonMessages.cancel)}
            </Button>
            <SubmitButton form={formId}>
              {intl.formatMessage(messages.createProtocol)}
            </SubmitButton>
          </>
        }
      >
        <FormWithoutProvider id={formId} onSubmit={handleSubmit}>
          <Field
            name="name"
            label={intl.formatMessage(messages.protocolName)}
            hint={intl.formatMessage(
              messages.optionUseAShortRecognizableNameOf,
              {
                PROTOCOL_NAME_MAX_LENGTH: PROTOCOL_NAME_MAX_LENGTH,
              },
            )}
            component={InputField}
            initialValue={initialName}
            placeholder={intl.formatMessage(messages.enterANameForYourProtocol)}
            required={intl.formatMessage(
              remainingMessages.protocolNameIsRequired,
            )}
            custom={nameLengthValidation.current}
            dir="auto"
            autoFocus
          />
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
};

export default NewProtocolDialog;
