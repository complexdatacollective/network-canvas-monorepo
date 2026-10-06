import { useMemo } from 'react';

import { type IntlShape, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ComboboxField from '@codaco/fresco-ui/form/fields/Combobox/Combobox';
import type { ComboboxOption } from '@codaco/fresco-ui/form/fields/Combobox/shared';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import type { LocaleTag } from '@codaco/protocol-validation';

import type { LanguageChoice } from './languageChoices';

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
    defaultMessage: 'Choose at least one language.',
    description:
      'Error when a dialog that asks for languages is submitted with none chosen.',
  },
  languageOption: {
    id: 'architect.localization.languageActions.languageOption',
    defaultMessage: '{name} ({tag})',
    description:
      'One entry in a list of languages. name is the language name in the interface language; tag is its language code, such as "de" or "pt-BR".',
  },
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

/** The languages chosen in a `LanguagePicker`, from the form's values. */
export const chosenLanguages = (
  values: Record<string, FieldValue>,
): LocaleTag[] => {
  const { languages } = values;
  return (Array.isArray(languages) ? languages : []).filter(
    (locale): locale is LocaleTag => typeof locale === 'string',
  );
};

type LanguagePickerProps = {
  label: string;
  hint?: string;
  choices: readonly LanguageChoice[];
  initialValue: LocaleTag[];
  /**
   * Name the chosen languages in the closed list, rather than count them, so
   * a preselected language is visible without opening it.
   */
  nameChosen?: boolean;
};

/**
 * A searchable list of languages to choose several from. Read the result with
 * `chosenLanguages(values)`.
 */
export const LanguagePicker = ({
  label,
  hint,
  choices,
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
  return (
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
      required={intl.formatMessage(messages.chooseAtLeastOne)}
    />
  );
};
