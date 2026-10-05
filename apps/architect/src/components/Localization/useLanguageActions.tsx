import { type RefObject, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { z } from 'zod/mini';

import {
  type IntlShape,
  type MessageDescriptor,
  defineMessages,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ComboboxField from '@codaco/fresco-ui/form/fields/Combobox/Combobox';
import type { ComboboxOption } from '@codaco/fresco-ui/form/fields/Combobox/shared';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type {
  CustomFieldValidation,
  FieldValue,
} from '@codaco/fresco-ui/form/store/types';
import {
  canonicalizeLocale,
  type LocaleTag,
} from '@codaco/protocol-validation';
import { useAppDispatch } from '~/ducks/hooks';
import {
  addProtocolLocales,
  relabelProtocolLocale,
  removeProtocolLocale,
} from '~/ducks/modules/activeProtocol';
import { getLocaleRemovalImpact } from '~/ducks/modules/protocol/localeOperations';
import { getProtocol } from '~/selectors/protocol';
import { UNSPECIFIED_LOCALE } from '~/utils/localizedText';

import { getLanguageChoices, type LanguageChoice } from './languageChoices';
import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  addTitle: {
    id: 'architect.localization.languageActions.addTitle',
    defaultMessage: 'Add languages',
    description: 'Title of the dialog that adds languages to a protocol.',
  },
  addDescription: {
    id: 'architect.localization.languageActions.addDescription',
    defaultMessage:
      'Participants can take the protocol in any of its languages. Until you translate a text, participants see it in the default language.',
    description: 'Explanation in the dialog that adds languages to a protocol.',
  },
  addSubmit: {
    id: 'architect.localization.languageActions.addSubmit',
    defaultMessage: 'Add languages',
    description: 'Submit button of the dialog that adds languages.',
  },
  languagesLabel: {
    id: 'architect.localization.languageActions.languagesLabel',
    defaultMessage: 'Languages',
    description: 'Label of the searchable list of languages to add.',
  },
  languageSingular: {
    id: 'architect.localization.languageActions.languageSingular',
    defaultMessage: 'language',
    description:
      'Singular noun in the summary of chosen languages, as in "1 language selected".',
  },
  languagePlural: {
    id: 'architect.localization.languageActions.languagePlural',
    defaultMessage: 'languages',
    description:
      'Plural noun in the summary of chosen languages, as in "3 languages selected".',
  },
  chooseLanguages: {
    id: 'architect.localization.languageActions.chooseLanguages',
    defaultMessage: 'Choose languages',
    description: 'Placeholder of the list of languages to add.',
  },
  searchLanguages: {
    id: 'architect.localization.languageActions.searchLanguages',
    defaultMessage: 'Search languages',
    description: 'Placeholder of the search box in the list of languages.',
  },
  noLanguagesFound: {
    id: 'architect.localization.languageActions.noLanguagesFound',
    defaultMessage: 'No language matches your search.',
    description: 'Shown when a language search finds nothing.',
  },
  chooseAtLeastOne: {
    id: 'architect.localization.languageActions.chooseAtLeastOne',
    defaultMessage: 'Choose at least one language, or enter a language code.',
    description: 'Error when the add-languages dialog is submitted empty.',
  },
  codeLabel: {
    id: 'architect.localization.languageActions.codeLabel',
    defaultMessage: 'Other language code',
    description:
      'Label of the field for a language code that is not in the list.',
  },
  codeHint: {
    id: 'architect.localization.languageActions.codeHint',
    defaultMessage:
      'For a language or regional variant that is not in the list, enter its language code, such as "gsw" or "es-AR".',
    description:
      'Hint for the language code field. The quoted codes are examples of language codes and are not translated.',
  },
  invalidCode: {
    id: 'architect.localization.languageActions.invalidCode',
    defaultMessage:
      '"{code}" is not a language code. Use a code such as "es" or "pt-BR".',
    description:
      'Error for a malformed language code. code is what the researcher typed; the quoted examples are not translated.',
  },
  unspecifiedCode: {
    id: 'architect.localization.languageActions.unspecifiedCode',
    defaultMessage:
      '"und" stands for an unidentified language. Enter the code of the language itself.',
    description:
      'Error when the researcher enters the code reserved for unidentified languages. "und" is a code and is not translated.',
  },
  alreadyDeclared: {
    id: 'architect.localization.languageActions.alreadyDeclared',
    defaultMessage: "{language} is already one of this protocol's languages.",
    description:
      'Error when a language the protocol already has is entered again. language is the language name.',
  },
  changeTitle: {
    id: 'architect.localization.languageActions.changeTitle',
    defaultMessage: 'Change {language}',
    description:
      'Title of the dialog that says which language a protocol language really is. language is its current name.',
  },
  changeDescription: {
    id: 'architect.localization.languageActions.changeDescription',
    defaultMessage:
      'Every text marked as {language} will be marked as the language you choose. Nothing is translated or deleted.',
    description:
      'Explanation in the dialog that changes a protocol language. language is its current name.',
  },
  identifyTitle: {
    id: 'architect.localization.languageActions.identifyTitle',
    defaultMessage: 'Identify the language of your text',
    description:
      'Title of the dialog that names the language of text whose language has not been identified.',
  },
  identifyDescription: {
    id: 'architect.localization.languageActions.identifyDescription',
    defaultMessage:
      'Protocols made before protocols declared their languages have their text marked as an unidentified language. Choose the language it is written in. Nothing is translated or deleted.',
    description:
      'Explanation in the dialog that names the language of text whose language has not been identified.',
  },
  languageLabel: {
    id: 'architect.localization.languageActions.languageLabel',
    defaultMessage: 'Language',
    description:
      'Label of the list of languages in the change-language dialog.',
  },
  chooseALanguage: {
    id: 'architect.localization.languageActions.chooseALanguage',
    defaultMessage: 'Choose a language',
    description: 'Placeholder of the list of languages to change to.',
  },
  chooseOne: {
    id: 'architect.localization.languageActions.chooseOne',
    defaultMessage: 'Choose a language, or enter a language code.',
    description: 'Error when the change-language dialog is submitted empty.',
  },
  changeSubmit: {
    id: 'architect.localization.languageActions.changeSubmit',
    defaultMessage: 'Change language',
    description: 'Submit button of the change-language dialog.',
  },
  languageOption: {
    id: 'architect.localization.languageActions.languageOption',
    defaultMessage: '{name} ({tag})',
    description:
      'One entry in a list of languages. name is the language name in the interface language; tag is its language code, such as "de" or "pt-BR".',
  },
  removeTitle: {
    id: 'architect.localization.languageActions.removeTitle',
    defaultMessage: 'Remove {language}?',
    description:
      'Title of the confirmation before a language is removed from a protocol.',
  },
  removeDescription: {
    id: 'architect.localization.languageActions.removeDescription',
    defaultMessage:
      '{count, plural, =0 {There are no {language} translations yet, so no text will be deleted.} one {The # translation written in {language} will be deleted.} other {All # translations written in {language} will be deleted.}} Participants will no longer be able to choose this language.',
    description:
      'Confirmation before a language is removed. count is how many translations are deleted; language is the language name.',
  },
  removeConfirm: {
    id: 'architect.localization.languageActions.removeConfirm',
    defaultMessage: 'Remove language',
    description: 'Confirm button that removes a language from a protocol.',
  },
});

type CodeProblem = {
  message: MessageDescriptor;
  values: Record<string, string>;
};

const findCodeProblem = (
  code: string,
  declared: readonly LocaleTag[],
  languageName: (locale: LocaleTag) => string,
): CodeProblem | null => {
  const locale = canonicalizeLocale(code.trim());
  if (locale === undefined) {
    return { message: messages.invalidCode, values: { code: code.trim() } };
  }
  if (locale === UNSPECIFIED_LOCALE) {
    return { message: messages.unspecifiedCode, values: {} };
  }
  if (declared.includes(locale)) {
    return {
      message: messages.alreadyDeclared,
      values: { language: languageName(locale) },
    };
  }
  return null;
};

const isBlank = (value: FieldValue | undefined) =>
  typeof value !== 'string' || value.trim() === '';

const issue = (
  value: unknown,
  message: string,
): { code: 'custom'; input: unknown; message: string; path: [] } => ({
  code: 'custom',
  input: value,
  message,
  path: [],
});

const codeValidation = (
  intl: IntlShape,
  declared: readonly LocaleTag[],
  languageName: (locale: LocaleTag) => string,
): CustomFieldValidation => ({
  schema: () =>
    z.unknown().check(
      z.superRefine((value, ctx) => {
        if (typeof value !== 'string' || value.trim() === '') return;
        const problem = findCodeProblem(value, declared, languageName);
        if (problem) {
          ctx.addIssue(
            issue(value, intl.formatMessage(problem.message, problem.values)),
          );
        }
      }),
    ),
});

// The list and the code field are alternatives, so an empty submission is
// reported on the list, which comes first.
const choiceRequiredValidation = (
  intl: IntlShape,
  message: MessageDescriptor,
): CustomFieldValidation => ({
  schema: (formValues) =>
    z.unknown().check(
      z.superRefine((value, ctx) => {
        const chosen = Array.isArray(value)
          ? value.length > 0
          : typeof value === 'string' && value !== '';
        if (!chosen && isBlank(formValues.code)) {
          ctx.addIssue(issue(value, intl.formatMessage(message)));
        }
      }),
    ),
});

const languageOptionText = (
  intl: IntlShape,
  { name, locale }: LanguageChoice,
) => intl.formatMessage(messages.languageOption, { name, tag: locale });

const renderLanguageOption = (
  choices: ReadonlyMap<string | number, LanguageChoice>,
  intl: IntlShape,
) =>
  function LanguageOption(option: ComboboxOption) {
    const choice = choices.get(option.value);
    if (!choice) return null;
    return (
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span>{languageOptionText(intl, choice)}</span>
          {choice.autonym !== choice.name && (
            <span
              lang={choice.locale}
              dir={choice.direction}
              className="text-current/70"
            >
              {choice.autonym}
            </span>
          )}
        </span>
      </span>
    );
  };

const resolveChoice = (
  values: Record<string, FieldValue>,
  listField: string,
): LocaleTag[] => {
  const listed = values[listField];
  const fromList = (Array.isArray(listed) ? listed : [listed]).filter(
    (value): value is string => typeof value === 'string' && value !== '',
  );
  const code = values.code;
  const fromCode =
    typeof code === 'string' && code.trim() !== '' ? [code.trim()] : [];
  return [
    ...new Set(
      [...fromList, ...fromCode].flatMap(
        (tag) => canonicalizeLocale(tag) ?? [],
      ),
    ),
  ];
};

/**
 * The dialogs behind each change to a protocol's languages. Each change is
 * validated here and then dispatched as one protocol edit, so it is one undo
 * step.
 */
export const useLanguageActions = (
  finalFocus: RefObject<HTMLElement | null>,
) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { openDialog, confirm } = useDialog();
  const protocol = useSelector(getProtocol);
  const languageName = useLanguageName();
  const declared = protocol?.localization.locales;

  const availableChoices = useCallback(
    (declaredLocales: readonly LocaleTag[]) =>
      getLanguageChoices(intl.locale).filter(
        (choice) => !declaredLocales.includes(choice.locale),
      ),
    [intl.locale],
  );

  const addLanguages = useCallback(async () => {
    if (!declared) return;
    const choices = availableChoices(declared);
    const choicesByLocale = new Map<string | number, LanguageChoice>(
      choices.map((choice) => [choice.locale, choice]),
    );
    const values = await openDialog({
      type: 'form',
      title: intl.formatMessage(messages.addTitle),
      description: intl.formatMessage(messages.addDescription),
      submitLabel: intl.formatMessage(messages.addSubmit),
      finalFocus,
      children: (
        <>
          <Field<typeof ComboboxField>
            name="languages"
            label={intl.formatMessage(messages.languagesLabel)}
            component={ComboboxField}
            initialValue={[]}
            options={choices.map((choice) => ({
              value: choice.locale,
              // Search matches the name in either language and the code.
              label: [choice.name, choice.autonym, choice.locale].join(' '),
            }))}
            renderOption={renderLanguageOption(choicesByLocale, intl)}
            placeholder={intl.formatMessage(messages.chooseLanguages)}
            searchPlaceholder={intl.formatMessage(messages.searchLanguages)}
            emptyMessage={intl.formatMessage(messages.noLanguagesFound)}
            singular={intl.formatMessage(messages.languageSingular)}
            plural={intl.formatMessage(messages.languagePlural)}
            showSelectAll={false}
            custom={choiceRequiredValidation(intl, messages.chooseAtLeastOne)}
          />
          <Field
            name="code"
            label={intl.formatMessage(messages.codeLabel)}
            hint={intl.formatMessage(messages.codeHint)}
            component={InputField}
            initialValue=""
            custom={codeValidation(intl, declared, languageName)}
            dir="ltr"
          />
        </>
      ),
    });
    if (!values) return;
    const locales = resolveChoice(values, 'languages');
    if (locales.length > 0) dispatch(addProtocolLocales({ locales }));
  }, [
    availableChoices,
    declared,
    dispatch,
    finalFocus,
    intl,
    languageName,
    openDialog,
  ]);

  const changeLanguage = useCallback(
    async (from: LocaleTag) => {
      if (!declared) return;
      const isUnspecified = from === UNSPECIFIED_LOCALE;
      const values = await openDialog({
        type: 'form',
        title: isUnspecified
          ? intl.formatMessage(messages.identifyTitle)
          : intl.formatMessage(messages.changeTitle, {
              language: languageName(from),
            }),
        description: isUnspecified
          ? intl.formatMessage(messages.identifyDescription)
          : intl.formatMessage(messages.changeDescription, {
              language: languageName(from),
            }),
        submitLabel: intl.formatMessage(messages.changeSubmit),
        finalFocus,
        children: (
          <>
            <Field<typeof NativeSelectField>
              name="language"
              label={intl.formatMessage(messages.languageLabel)}
              component={NativeSelectField}
              placeholder={intl.formatMessage(messages.chooseALanguage)}
              options={availableChoices(declared).map((choice) => ({
                value: choice.locale,
                label: languageOptionText(intl, choice),
              }))}
              custom={choiceRequiredValidation(intl, messages.chooseOne)}
            />
            <Field
              name="code"
              label={intl.formatMessage(messages.codeLabel)}
              hint={intl.formatMessage(messages.codeHint)}
              component={InputField}
              initialValue=""
              custom={codeValidation(intl, declared, languageName)}
              dir="ltr"
            />
          </>
        ),
      });
      if (!values) return;
      // A typed code is the more specific answer, so it wins over the list.
      const [to] = resolveChoice(values, 'language').toReversed();
      if (to !== undefined) dispatch(relabelProtocolLocale({ from, to }));
    },
    [
      availableChoices,
      declared,
      dispatch,
      finalFocus,
      intl,
      languageName,
      openDialog,
    ],
  );

  const removeLanguage = useCallback(
    async (locale: LocaleTag) => {
      if (!protocol) return;
      const language = languageName(locale);
      const { translationCount } = getLocaleRemovalImpact(protocol, locale);
      await confirm({
        title: intl.formatMessage(messages.removeTitle, { language }),
        description: intl.formatMessage(messages.removeDescription, {
          count: translationCount,
          language,
        }),
        confirmLabel: intl.formatMessage(messages.removeConfirm),
        intent: 'destructive',
        finalFocus,
        onConfirm: () => {
          dispatch(removeProtocolLocale({ locale }));
        },
      });
    },
    [confirm, dispatch, finalFocus, intl, languageName, protocol],
  );

  return { addLanguages, changeLanguage, removeLanguage };
};
