import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  type LocaleTag,
  suppliedBaseLanguage,
} from '@codaco/protocol-validation';

import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  title: {
    id: 'architect.localization.addBaseLanguage.title',
    defaultMessage: 'Also add {base}?',
    description:
      'Title of the question asked when the researcher adds a language to a protocol that Network Canvas has no built-in wording in, but that is a regional variant of a language it has wording in. base is that language (for example Spanish, when the added language is Mexican Spanish).',
  },
  description: {
    id: 'architect.localization.addBaseLanguage.description',
    defaultMessage:
      'Network Canvas has built-in wording, such as button labels and the closing screen, in {base} but not in {language}. If you also add {base}, participants using {language} see the {base} wording wherever you haven’t written your own.{isDefault, select, true { Because {language} is the default language, the protocol can’t be downloaded until its built-in wording is translated into {language}, or {base} is made the default.} other {}}',
    description:
      'Explanation in the question asked when a regional variant of a language Network Canvas has built-in wording in is added to a protocol. language is the added language (for example Mexican Spanish); base is the language it is a variant of (for example Spanish). Adding the base language as a second language lets the interview show its built-in wording in place of any the researcher has not written for the variant. isDefault is true when the added language is the protocol’s default language, whose text must be complete before the protocol can be downloaded.',
  },
  confirm: {
    id: 'architect.localization.addBaseLanguage.confirm',
    defaultMessage: 'Add {base}',
    description:
      'Button that also adds the language a regional variant belongs to, as another of the protocol’s languages. base is that language (for example Spanish).',
  },
  cancel: {
    id: 'architect.localization.addBaseLanguage.cancel',
    defaultMessage: 'Don’t add {base}',
    description:
      'Button that declines the offer: the regional variant the researcher chose is still added (or the protocol still created in it), without also adding the language it belongs to. base is that language (for example Spanish).',
  },
});

/**
 * Asks, for each new language that is a regional variant of a language
 * Network Canvas writes its own wording in (Mexican Spanish of Spanish),
 * whether to add that language too, unless the protocol already has it.
 * Network Canvas writes its wording only in a language it has it in exactly,
 * so a variant on its own has none; beside its base language, the interview
 * shows the base language's wording wherever the variant has no text of its
 * own. The base language is never made the default. A language merely close
 * to one Network Canvas has wording in (Galician to Spanish) is not offered
 * one, as its participants would read another language.
 *
 * Resolves to the base languages the researcher chose to add.
 */
export const useBaseLanguageOffer = () => {
  const intl = useAppIntl();
  const { confirm } = useDialog();
  const languageName = useLanguageName();

  return useCallback(
    async (
      chosen: readonly LocaleTag[],
      declared: readonly LocaleTag[],
      defaultLocale?: LocaleTag,
    ): Promise<LocaleTag[]> => {
      const added: LocaleTag[] = [];
      const offered = new Set<LocaleTag>([...declared, ...chosen]);
      for (const locale of chosen) {
        const baseLocale = suppliedBaseLanguage(locale);
        if (baseLocale === undefined || offered.has(baseLocale)) continue;
        // Asked once, even when two variants of it are chosen together.
        offered.add(baseLocale);
        const language = languageName(locale);
        const base = languageName(baseLocale);
        const accepted = await confirm({
          title: intl.formatMessage(messages.title, { base }),
          description: intl.formatMessage(messages.description, {
            language,
            base,
            isDefault: String(locale === defaultLocale),
          }),
          confirmLabel: intl.formatMessage(messages.confirm, { base }),
          cancelLabel: intl.formatMessage(messages.cancel, { base }),
          onConfirm: () => undefined,
        });
        if (accepted === true) added.push(baseLocale);
      }
      return added;
    },
    [confirm, intl, languageName],
  );
};
