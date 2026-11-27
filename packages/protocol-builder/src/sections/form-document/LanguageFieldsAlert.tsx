import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import {
  formFieldPlacement,
  type LocaleTag,
  type LocalizationDeclaration,
  type Variables,
} from '@codaco/protocol-validation';

import {
  VariablePill,
  variablePillKindOf,
} from '../../fields/VariablePill.tsx';
import { useLanguageNaming } from '../../localization/LanguageNaming.tsx';
import { formDocumentMessages as messages } from './formDocumentMessages.ts';
import type { FormFieldDraft } from './formDocumentValue.ts';

type LanguageFieldsAlertProps = Readonly<{
  fields: readonly FormFieldDraft[];
  content: Readonly<Record<string, string>>;
  locale: LocaleTag;
  localization: LocalizationDeclaration;
  variables: Readonly<Variables>;
}>;

/**
 * Which attributes one language's form leaves out or adds, compared with the
 * form in the default language. Each language's form is its own document, so
 * this is information, never a problem: the forms may differ on purpose.
 */
export function LanguageFieldsAlert({
  fields,
  content,
  locale,
  localization,
  variables,
}: LanguageFieldsAlertProps) {
  const { defaultLocale } = localization;
  const intl = useAppIntl();
  const { name: languageName } = useLanguageNaming();
  const message = content[locale];

  // The attributes of the fields that each form places, in its order: the
  // default language's form may itself be another language's document.
  const { missing, extra } = useMemo(() => {
    const placement = formFieldPlacement(content, localization);
    const byId = new Map(fields.map((field) => [field.id, field.variable]));
    const variablesIn = (language: LocaleTag) =>
      [...(placement.get(language) ?? [])].flatMap((fieldId) => {
        const variable = byId.get(fieldId);
        return variable === undefined || variable === '' ? [] : [variable];
      });
    const here = variablesIn(locale);
    const there = variablesIn(defaultLocale);
    return {
      missing: there.filter((id) => !here.includes(id)),
      extra: here.filter((id) => !there.includes(id)),
    };
  }, [content, defaultLocale, fields, locale, localization]);

  // A language whose form is not written yet differs from nothing.
  if (locale === defaultLocale || message === undefined || message === '') {
    return null;
  }
  if (missing.length === 0 && extra.length === 0) return null;

  // The pills are joined as a list is in the interface's language ("age,
  // employer and income").
  const pills = (ids: readonly string[]) => {
    let next = 0;
    return intl
      .formatListToParts([...ids], { type: 'conjunction' })
      .map((part, partIndex) => {
        if (part.type === 'literal') return part.value;
        const id = ids[next++];
        if (id === undefined) return part.value;
        const variable = variables[id];
        return (
          <VariablePill
            key={`${id}-${partIndex}`}
            name={
              variable?.name ?? intl.formatMessage(messages.missingAttribute)
            }
            size="inline"
            missing={variable === undefined}
            {...(variable === undefined
              ? {}
              : { kind: variablePillKindOf(variable.type) })}
          />
        );
      });
  };

  const languages = {
    language: languageName(locale),
    defaultLanguage: languageName(defaultLocale),
  };

  return (
    <Alert variant="info" data-language-fields="">
      <AlertDescription>
        {missing.length > 0 && (
          <p>
            {intl.formatMessage(messages.languageFieldsMissing, {
              ...languages,
              count: missing.length,
              attributes: <span key="pills">{pills(missing)}</span>,
            })}
          </p>
        )}
        {extra.length > 0 && (
          <p>
            {intl.formatMessage(messages.languageFieldsExtra, {
              ...languages,
              count: extra.length,
              attributes: <span key="pills">{pills(extra)}</span>,
            })}
          </p>
        )}
        <p>{intl.formatMessage(messages.languageFieldsAllowed)}</p>
      </AlertDescription>
    </Alert>
  );
}
