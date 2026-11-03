import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  type LocaleTag,
  type StartFrom,
  suppliedBaseLanguage,
} from '@codaco/protocol-validation';

import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  title: {
    id: 'architect.localization.startFromBase.title',
    defaultMessage: 'Start {language} from {base}?',
    description:
      'Title of the question asked when a language is added to a protocol that Network Canvas has no built-in wording in, but whose base language it has. language is the added language (for example Mexican Spanish); base is the language it could start from (for example Spanish).',
  },
  description: {
    id: 'architect.localization.startFromBase.description',
    defaultMessage:
      'Network Canvas has built-in wording, such as button labels and the closing screen, in {base} but not in {language}. You can start with a copy of the {base} wording and adapt it to {language}. Participants see it exactly as written, so review it before you use the protocol. {isDefault, select, true {If you don’t copy it, this wording starts in English.} other {If you don’t copy it, this wording starts untranslated in {language}.}}',
    description:
      'Explanation in the question asked when a language is added that Network Canvas has no built-in wording in, but whose base language it has. language is the added language; base is the language it could start from; isDefault is true when the added language is the protocol’s default language, whose wording falls back to English.',
  },
  confirm: {
    id: 'architect.localization.startFromBase.confirm',
    defaultMessage: 'Copy {base} wording',
    description:
      'Button that starts an added language from a copy of the built-in wording in its base language. base is that base language (for example Spanish).',
  },
  cancel: {
    id: 'architect.localization.startFromBase.cancel',
    defaultMessage: 'Don’t copy',
    description:
      'Button that adds a language without copying the built-in wording of its base language.',
  },
});

/**
 * Asks, for each new language that is a regional variant of a language
 * Network Canvas writes its own wording in (Mexican Spanish of Spanish), whether
 * it should start from a copy of that wording. Network Canvas never copies it
 * unasked, since text written into a protocol must be in the language it is
 * recorded under. Resolves to the languages the researcher chose to start
 * from their base language.
 */
export const useStartFromBaseOffer = () => {
  const intl = useAppIntl();
  const { confirm } = useDialog();
  const languageName = useLanguageName();

  return useCallback(
    async (
      locales: readonly LocaleTag[],
      defaultLocale?: LocaleTag,
    ): Promise<StartFrom> => {
      const startFrom: Record<LocaleTag, LocaleTag> = {};
      for (const locale of locales) {
        const baseLocale = suppliedBaseLanguage(locale);
        if (baseLocale === undefined) continue;
        const language = languageName(locale);
        const base = languageName(baseLocale);
        const accepted = await confirm({
          title: intl.formatMessage(messages.title, { language, base }),
          description: intl.formatMessage(messages.description, {
            language,
            base,
            isDefault: String(locale === defaultLocale),
          }),
          confirmLabel: intl.formatMessage(messages.confirm, { base }),
          cancelLabel: intl.formatMessage(messages.cancel),
          onConfirm: () => undefined,
        });
        if (accepted === true) startFrom[locale] = baseLocale;
      }
      return startFrom;
    },
    [confirm, intl, languageName],
  );
};
