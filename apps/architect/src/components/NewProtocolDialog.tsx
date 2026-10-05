import { useRef, useCallback, useId, useMemo } from 'react';

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
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  CustomFieldValidation,
  FieldValue,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import {
  canonicalizeLocale,
  type LocaleTag,
} from '@codaco/protocol-validation';
import {
  getLanguageChoices,
  matchLanguageChoice,
} from '~/components/Localization/languageChoices';
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
      'Use a short, recognizable name of up to {PROTOCOL_NAME_MAX_LENGTH, number} characters. Include a version number or date when it helps distinguish drafts, but avoid long project notes.',
    description:
      'Hint for the new protocol name. PROTOCOL_NAME_MAX_LENGTH is the maximum number of user-perceived characters allowed in that name.',
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
const languageMessages = defineMessages({
  protocolLanguage: {
    id: 'architect.newProtocolDialog.protocolLanguage',
    defaultMessage: 'Protocol language',
    description:
      'Label for the choice of the language a new protocol is written in.',
  },
  protocolLanguageHint: {
    id: 'architect.newProtocolDialog.protocolLanguageHint',
    defaultMessage:
      'The language you will write this protocol in. You can add other languages, or change this one, on the Languages page.',
    description:
      'Hint for the new protocol language. "Languages page" is the protocol tab where languages are managed.',
  },
  protocolLanguageRequired: {
    id: 'architect.newProtocolDialog.protocolLanguageRequired',
    defaultMessage: 'Choose the language this protocol is written in',
    description: 'Error shown when no language is chosen for a new protocol.',
  },
  languageOption: {
    id: 'architect.newProtocolDialog.languageOption',
    defaultMessage: '{name} ({tag})',
    description:
      'One choice in the protocol language list. name is the language name in the interface language; tag is its language code, such as "de" or "pt-BR".',
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
  title?: string;
  initialName?: string;
} & (
  | {
      /** A blank protocol has no language yet, so the dialog asks for one. */
      chooseLanguage: true;
      onSubmit: (values: { name: string; locale: LocaleTag }) => void;
    }
  | {
      chooseLanguage?: false;
      onSubmit: (values: { name: string }) => void;
    }
);

const NewProtocolDialog = ({
  open,
  onOpenChange,
  title,
  initialName = '',
  ...submission
}: NewProtocolDialogProps) => {
  const intl = useAppIntl();
  const languageOptions = useMemo(
    () =>
      getLanguageChoices(intl.locale).map(({ locale, name }) => ({
        value: locale,
        label: intl.formatMessage(languageMessages.languageOption, {
          name,
          tag: locale,
        }),
      })),
    [intl],
  );
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

      if (!submission.chooseLanguage) {
        submission.onSubmit({ name });
        return { success: true };
      }

      const locale =
        typeof values.locale === 'string'
          ? canonicalizeLocale(values.locale)
          : undefined;
      if (!locale) {
        return {
          success: false,
          fieldErrors: {
            locale: [
              createMessageError(languageMessages.protocolLanguageRequired),
            ],
          },
        };
      }

      submission.onSubmit({ name, locale });
      return { success: true };
    },
    [submission],
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
          {submission.chooseLanguage && (
            <Field<typeof NativeSelectField>
              name="locale"
              label={intl.formatMessage(languageMessages.protocolLanguage)}
              hint={intl.formatMessage(languageMessages.protocolLanguageHint)}
              component={NativeSelectField}
              options={languageOptions}
              initialValue={matchLanguageChoice(intl.locale)}
              required={intl.formatMessage(
                languageMessages.protocolLanguageRequired,
              )}
            />
          )}
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
};

export default NewProtocolDialog;
