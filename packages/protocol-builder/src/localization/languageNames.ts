import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { getLocaleMetadata, type LocaleTag } from '@codaco/protocol-validation';

export const languageMessages = defineMessages({
  unspecifiedLanguage: {
    id: 'protocolBuilder.localization.unspecifiedLanguage',
    defaultMessage: 'Unspecified language',
    description:
      'Name shown for a protocol language that has not been identified yet (the "und" language tag), for example a protocol upgraded from an older version.',
  },
  editingLanguage: {
    id: 'protocolBuilder.localization.editingLanguage',
    defaultMessage: 'Editing language',
    description:
      'Accessible name of the menu that chooses which of the protocol languages the researcher is writing text in.',
  },
  defaultLanguage: {
    id: 'protocolBuilder.localization.defaultLanguage',
    defaultMessage: 'Default',
    description:
      'Tag beside the protocol language participants see when their own language has no translation.',
  },
  missingTranslation: {
    id: 'protocolBuilder.localization.missingTranslation',
    defaultMessage: 'Missing',
    description:
      'Tag beside a protocol language in the language menu when the text being edited has no translation in that language.',
  },
  missingCount: {
    id: 'protocolBuilder.localization.missingCount',
    defaultMessage:
      '{count, plural, one {# translation missing} other {# translations missing}}',
    description:
      'Shown beside the language menu of a text field: how many of the protocol languages this text has no translation in.',
  },
  notTranslated: {
    id: 'protocolBuilder.localization.notTranslated',
    defaultMessage:
      'Not translated into {language} yet. Participants using {language} will see the {fallback} text.',
    description:
      'Shown under a text field when the text has no translation in the language being edited. language is the language being edited; fallback is the language participants are shown instead. Both are language names written in their own language.',
  },
});

/**
 * Names a protocol language in its own language ("Español", "日本語"). The
 * undetermined language has no name of its own — `Intl.DisplayNames` calls it
 * "root" — so it is described in the reader's language instead.
 */
export function useLanguageName(): (locale: LocaleTag) => string {
  const intl = useAppIntl();
  return useCallback(
    (locale: LocaleTag) =>
      locale === 'und'
        ? intl.formatMessage(languageMessages.unspecifiedLanguage)
        : getLocaleMetadata(locale).label,
    [intl],
  );
}
