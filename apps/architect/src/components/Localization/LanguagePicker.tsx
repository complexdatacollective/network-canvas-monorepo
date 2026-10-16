import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { type IntlShape, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ComboboxField from '@codaco/fresco-ui/form/fields/Combobox/Combobox';
import type { ComboboxOption } from '@codaco/fresco-ui/form/fields/Combobox/shared';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import type { LocaleTag } from '@codaco/protocol-validation';

import type { LanguageChoice } from './languageChoices';

const messages = defineMessages({
  otherLanguages: {
    id: 'architect.localization.languageActions.otherLanguages',
    defaultMessage: '{count, plural, one {# other} other {# others}}',
    description:
      'Last item of the list of chosen languages when the rest do not fit, as in "English, Spanish and 4 others". The list joins it with "and". count is how many chosen languages are not named.',
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

/**
 * The chosen languages' names, as many as fit the closed list's width, then a
 * count of the rest: "English, Spanish and 4 others". Measured rather than a
 * fixed count, because names and the list's width both vary.
 */
export const FittedNames = ({ names }: { names: readonly string[] }) => {
  const intl = useAppIntl();
  const boxRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [named, setNamed] = useState(names.length);

  const summary = useCallback(
    (count: number) =>
      intl.formatList(
        count >= names.length
          ? names
          : [
              ...names.slice(0, count),
              intl.formatMessage(messages.otherLanguages, {
                count: names.length - count,
              }),
            ],
        { type: 'conjunction' },
      ),
    [intl, names],
  );

  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;
    const fit = () => {
      const width = box.clientWidth;
      // At least one name is shown; if even that is too long it truncates.
      let count = names.length;
      while (count > 1) {
        measure.textContent = summary(count);
        if (measure.offsetWidth <= width) break;
        count -= 1;
      }
      measure.textContent = '';
      setNamed(count);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [names.length, summary]);

  return (
    <span ref={boxRef} className="relative block truncate">
      {summary(named)}
      <span
        ref={measureRef}
        aria-hidden
        className="invisible absolute inset-s-0 top-0 whitespace-nowrap"
      />
    </span>
  );
};

// Null when nothing is chosen, so the trigger shows its placeholder.
const renderChosenNames = (
  choices: ReadonlyMap<string | number, LanguageChoice>,
) =>
  function ChosenNames(selected: ComboboxOption[]) {
    if (selected.length === 0) return null;
    const names = selected.flatMap(
      (option) => choices.get(option.value)?.name ?? [],
    );
    // Keyed by the names, so a new list is measured afresh from all of them.
    return <FittedNames key={names.join('\n')} names={names} />;
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
};

/**
 * A searchable list of languages to choose several from. The closed list names
 * the chosen languages, so they are visible without opening it. Read the result with
 * `chosenLanguages(values)`.
 */
export const LanguagePicker = ({
  label,
  hint,
  choices,
  initialValue,
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
      renderValue={renderChosenNames(choicesByLocale)}
      placeholder={intl.formatMessage(messages.chooseLanguages)}
      searchPlaceholder={intl.formatMessage(messages.searchLanguages)}
      emptyMessage={intl.formatMessage(messages.noLanguagesFound)}
      showSelectAll={false}
      required={intl.formatMessage(messages.chooseAtLeastOne)}
    />
  );
};
