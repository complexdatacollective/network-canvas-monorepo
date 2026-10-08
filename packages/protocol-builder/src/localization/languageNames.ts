import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { getLocaleMetadata, type LocaleTag } from '@codaco/protocol-validation';

export const languageMessages = defineMessages({
  unspecifiedLanguage: {
    id: 'protocolBuilder.localization.unspecifiedLanguage',
    defaultMessage: 'Unspecified language',
    description:
      'Name shown for a protocol language that has not been identified yet (the "und" language tag), for example a protocol made in Studio.',
  },
  editingLanguage: {
    id: 'protocolBuilder.localization.editingLanguage',
    defaultMessage: 'Editing language',
    description:
      'Accessible name of the menu that chooses which of the protocol languages the researcher is writing text in, or previewing a form field in.',
  },
  defaultLanguage: {
    id: 'protocolBuilder.localization.defaultLanguage',
    defaultMessage: 'Default',
    description:
      'Tag beside the protocol’s default language: the language participants start in when their browser lists none of the protocol’s languages, and the one untranslated text falls back to after the participant’s own languages.',
  },
  missingTranslation: {
    id: 'protocolBuilder.localization.missingTranslation',
    defaultMessage: 'Missing',
    description:
      'Tag beside a protocol language in the language menu when the text being edited has no translation in that language. In the preview of a form field the menu covers all the text the preview shows, and the tag appears when any of it has no translation in that language.',
  },
  missingCount: {
    id: 'protocolBuilder.localization.missingCount',
    defaultMessage:
      '{count, plural, one {# translation missing} other {# translations missing}}',
    description:
      'Shown beside the language menu of a text field or of a form field’s preview: how many of the protocol languages this text, or any of the text the preview shows, has no translation in.',
  },
  notTranslated: {
    id: 'protocolBuilder.localization.notTranslated',
    defaultMessage:
      'Not translated into {language} yet. Participants using {language} will see the {fallback} text.',
    description:
      'Shown under a text field when the text has no translation in the language being edited, and participants are certain to be shown it in fallback instead: a closely related language, such as Brazilian Portuguese for European Portuguese, or the only language the text is written in. language is the language being edited. Both are language names, written in the app’s own language or, in some apps, in their own language.',
  },
  notTranslatedUnlessBrowserLists: {
    id: 'protocolBuilder.localization.notTranslatedUnlessBrowserLists',
    defaultMessage:
      'Not translated into {language} yet. Participants using {language} will see the {fallback} text, unless their browser also lists a language that has it.',
    description:
      'Shown under a text field when the text has no translation in the language being edited, nor in a closely related language. Participants are shown it in another language their web browser lists, when the text has a translation in one, and otherwise in fallback: the protocol’s default language, or failing that another of its languages. language is the language being edited. Both are language names, written in the app’s own language or, in some apps, in their own language.',
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
