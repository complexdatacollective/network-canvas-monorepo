import { useMemo } from 'react';
import { z } from 'zod/mini';

import {
  type IntlShape,
  type MessageDescriptor,
  defineMessages,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ComboboxField from '@codaco/fresco-ui/form/fields/Combobox/Combobox';
import type { ComboboxOption } from '@codaco/fresco-ui/form/fields/Combobox/shared';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type {
  CustomFieldValidation,
  FieldValue,
} from '@codaco/fresco-ui/form/store/types';
import {
  canonicalizeLocale,
  type LocaleTag,
} from '@codaco/protocol-validation';
import { UNSPECIFIED_LOCALE } from '~/utils/localizedText';

import type { LanguageChoice } from './languageChoices';
import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
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
    description: 'Placeholder of a list of languages to choose several from.',
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
    description:
      'Error when a dialog that asks for languages is submitted with none chosen and no language code entered.',
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
  languageOption: {
    id: 'architect.localization.languageActions.languageOption',
    defaultMessage: '{name} ({tag})',
    description:
      'One entry in a list of languages. name is the language name in the interface language; tag is its language code, such as "de" or "pt-BR".',
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
export const choiceRequiredValidation = (
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

export const languageOptionText = (
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

// Null when nothing is chosen, so the trigger shows its placeholder.
const renderChosenNames = (
  choices: ReadonlyMap<string | number, LanguageChoice>,
  intl: IntlShape,
) =>
  function ChosenNames(selected: ComboboxOption[]) {
    if (selected.length === 0) return null;
    return intl.formatList(
      selected.flatMap((option) => choices.get(option.value)?.name ?? []),
      { type: 'conjunction' },
    );
  };

/**
 * The languages chosen from a list field and the code field together, in
 * canonical form and without duplicates.
 */
export const resolveChoice = (
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

/** A language code typed in, for a language the list does not offer. */
export const LanguageCodeField = ({
  declared,
}: {
  /** Languages the protocol already has, which the code may not repeat. */
  declared: readonly LocaleTag[];
}) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const validation = useMemo(
    () => codeValidation(intl, declared, languageName),
    [intl, declared, languageName],
  );
  return (
    <Field
      name="code"
      label={intl.formatMessage(messages.codeLabel)}
      hint={intl.formatMessage(messages.codeHint)}
      component={InputField}
      initialValue=""
      custom={validation}
      dir="ltr"
    />
  );
};

type LanguagePickerProps = {
  label: string;
  hint?: string;
  choices: readonly LanguageChoice[];
  declared: readonly LocaleTag[];
  initialValue: LocaleTag[];
  /**
   * Name the chosen languages in the closed list, rather than count them, so
   * a preselected language is visible without opening it.
   */
  nameChosen?: boolean;
};

/**
 * A searchable list of languages to choose several from, and a field for a
 * language code the list does not offer. Read the result with
 * `resolveChoice(values, 'languages')`.
 */
export const LanguagePicker = ({
  label,
  hint,
  choices,
  declared,
  initialValue,
  nameChosen = false,
}: LanguagePickerProps) => {
  const intl = useAppIntl();
  const choicesByLocale = useMemo(
    () =>
      new Map<string | number, LanguageChoice>(
        choices.map((choice) => [choice.locale, choice]),
      ),
    [choices],
  );
  const options = useMemo(
    () =>
      choices.map((choice) => ({
        value: choice.locale,
        // Search matches the name in either language and the code.
        label: [choice.name, choice.autonym, choice.locale].join(' '),
      })),
    [choices],
  );
  const requiredValidation = useMemo(
    () => choiceRequiredValidation(intl, messages.chooseAtLeastOne),
    [intl],
  );
  return (
    <>
      <Field<typeof ComboboxField>
        name="languages"
        label={label}
        hint={hint}
        component={ComboboxField}
        initialValue={initialValue}
        options={options}
        renderOption={renderLanguageOption(choicesByLocale, intl)}
        renderValue={
          nameChosen ? renderChosenNames(choicesByLocale, intl) : undefined
        }
        placeholder={intl.formatMessage(messages.chooseLanguages)}
        searchPlaceholder={intl.formatMessage(messages.searchLanguages)}
        emptyMessage={intl.formatMessage(messages.noLanguagesFound)}
        singular={intl.formatMessage(messages.languageSingular)}
        plural={intl.formatMessage(messages.languagePlural)}
        showSelectAll={false}
        custom={requiredValidation}
      />
      <LanguageCodeField declared={declared} />
    </>
  );
};
