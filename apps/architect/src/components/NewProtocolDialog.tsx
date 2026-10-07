import {
  type ComponentProps,
  useRef,
  useCallback,
  useId,
  useMemo,
} from 'react';
import { z } from 'zod/mini';

import { commonMessages } from '@codaco/app-i18n/common';
import {
  type IntlShape,
  createMessageError,
  defineMessages,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  CustomFieldValidation,
  FieldValue,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import {
  type LocaleTag,
  sortByLanguageName,
} from '@codaco/protocol-validation';
import {
  describeLanguage,
  getLanguageChoices,
  matchLanguageChoice,
} from '~/components/Localization/languageChoices';
import {
  chosenLanguages,
  LanguagePicker,
  languageOptionText,
} from '~/components/Localization/LanguagePicker';
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
  protocolLanguages: {
    id: 'architect.newProtocolDialog.protocolLanguages',
    defaultMessage: 'Protocol languages',
    description:
      'Label for the choice of the languages a new protocol is written in.',
  },
  protocolLanguagesHint: {
    id: 'architect.newProtocolDialog.protocolLanguagesHint',
    defaultMessage:
      'The languages participants can take the interview in. You can change them later on the Languages page.',
    description:
      'Hint for the new protocol languages. "Languages page" is the protocol tab where languages are managed.',
  },
  defaultLanguage: {
    id: 'architect.newProtocolDialog.defaultLanguage',
    defaultMessage: 'Default language',
    description:
      'Label for the choice of which of the languages chosen for a new protocol is its default language.',
  },
  defaultLanguageHint: {
    id: 'architect.newProtocolDialog.defaultLanguageHint',
    defaultMessage:
      "Text without a translation in a participant's language is shown in the default language.",
    description: 'Hint for the default language of a new protocol.',
  },
});

// The default is derived from the chosen languages rather than trusted as
// stored: a field that unmounts keeps its value, so after the chosen languages
// change the stored default may no longer be one of them.
const pickDefaultLocale = (
  chosen: readonly LocaleTag[],
  stored: FieldValue,
  preferred: LocaleTag,
): LocaleTag | undefined =>
  [stored, preferred].find(
    (locale): locale is LocaleTag =>
      typeof locale === 'string' && chosen.includes(locale),
  ) ?? chosen[0];

type DefaultLanguageSelectProps = ComponentProps<typeof NativeSelectField> & {
  chosen: readonly LocaleTag[];
  preferred: LocaleTag;
};

const DefaultLanguageSelect = ({
  chosen,
  preferred,
  value,
  ...props
}: DefaultLanguageSelectProps) => (
  <NativeSelectField
    {...props}
    value={pickDefaultLocale(chosen, value, preferred)}
  />
);

const DefaultLanguageField = ({ preferred }: { preferred: LocaleTag }) => {
  const intl = useAppIntl();
  const values = useFormValue(['languages']);
  const chosen = chosenLanguages(values);
  if (chosen.length < 2) return null;
  return (
    <Field<typeof DefaultLanguageSelect>
      name="defaultLocale"
      label={intl.formatMessage(languageMessages.defaultLanguage)}
      hint={intl.formatMessage(languageMessages.defaultLanguageHint)}
      component={DefaultLanguageSelect}
      options={sortByLanguageName(
        chosen.map((locale) => describeLanguage(locale, intl.locale)),
        (choice) => choice.name,
        intl.locale,
      ).map((choice) => ({
        value: choice.locale,
        label: languageOptionText(intl, choice),
      }))}
      chosen={chosen}
      preferred={preferred}
    />
  );
};

type NewProtocolDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  initialName?: string;
} & (
  | {
      /** A blank protocol has no languages yet, so the dialog asks for them. */
      chooseLanguages: true;
      onSubmit: (values: {
        name: string;
        localization: { defaultLocale: LocaleTag; locales: LocaleTag[] };
      }) => void;
    }
  | {
      chooseLanguages?: false;
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
  // The language Architect is shown in, which the researcher most likely
  // writes in too.
  const preferredLocale = useMemo(
    () => matchLanguageChoice(intl.locale),
    [intl.locale],
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

      if (!submission.chooseLanguages) {
        submission.onSubmit({ name });
        return { success: true };
      }

      // The languages field's own validation refuses an empty choice.
      const locales = chosenLanguages(values);
      const defaultLocale = pickDefaultLocale(
        locales,
        values.defaultLocale,
        preferredLocale,
      );
      if (defaultLocale === undefined) return { success: false };

      submission.onSubmit({ name, localization: { defaultLocale, locales } });
      return { success: true };
    },
    [preferredLocale, submission],
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
          {submission.chooseLanguages && (
            <>
              <LanguagePicker
                label={intl.formatMessage(languageMessages.protocolLanguages)}
                hint={intl.formatMessage(
                  languageMessages.protocolLanguagesHint,
                )}
                choices={getLanguageChoices(intl.locale)}
                initialValue={[preferredLocale]}
                nameChosen
              />
              <DefaultLanguageField preferred={preferredLocale} />
            </>
          )}
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
};

export default NewProtocolDialog;
