import { type RefObject, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import {
  collectLocalizedStrings,
  type LocaleTag,
  type LocalizedStringHit,
} from '@codaco/protocol-validation';
import { useAppDispatch, useAppStore } from '~/ducks/hooks';
import {
  addProtocolLocales,
  relabelProtocolDefaultLocale,
  removeProtocolLocale,
} from '~/ducks/modules/activeProtocol';
import {
  getLocaleRemovalImpact,
  type LocaleRemovalImpact,
  type LocalizedStringRewrite,
  relabelledLocale,
  withoutLocale,
} from '~/ducks/modules/protocol/localeOperations';
import { getProtocol } from '~/selectors/protocol';

import { getLanguageChoices } from './languageChoices';
import {
  chosenLanguages,
  LanguagePicker,
  languageOptionText,
} from './LanguagePicker';
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
      'Participants can take the interview in any of the protocol’s languages. Until you translate a text into a new language, participants who use it see the closest translation available instead.',
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
  relabelTitle: {
    id: 'architect.localization.languageActions.relabelTitle',
    defaultMessage: 'Relabel the {language} text',
    description:
      'Title of the dialog that marks every text written in the protocol’s default language as written in another language. language is the current default language’s name.',
  },
  relabelDescription: {
    id: 'architect.localization.languageActions.relabelDescription',
    defaultMessage:
      'Use this when the text marked as {language} is really written in another language, as it can be in a protocol upgraded from an earlier version of Network Canvas, whose text was assumed to be English. Every text marked as {language} will be marked as the language you choose, which becomes the default language. Nothing is translated or deleted.',
    description:
      'Explanation in the dialog that marks every text written in the protocol’s default language as written in another language: when to use it and what it does. language is the current default language’s name.',
  },
  languageLabel: {
    id: 'architect.localization.languageActions.languageLabel',
    defaultMessage: 'Language',
    description:
      'Label of the list of languages in the dialog that marks the text of the protocol’s default language as written in another language.',
  },
  relabelHint: {
    id: 'architect.localization.languageActions.relabelHint',
    defaultMessage:
      'The protocol’s other languages are not listed. To make one of them the default instead, choose it as the default language.',
    description:
      'Hint under the list of languages in the dialog that marks the text of the protocol’s default language as written in another language, shown when the protocol has other languages. Those languages cannot be chosen, because their translations would collide.',
  },
  chooseALanguage: {
    id: 'architect.localization.languageActions.chooseALanguage',
    defaultMessage: 'Choose a language',
    description:
      'Placeholder of the list of languages that the text of the protocol’s default language can be marked as.',
  },
  chooseOne: {
    id: 'architect.localization.languageActions.chooseOne',
    defaultMessage: 'Choose a language.',
    description:
      'Error when the dialog that marks the text of the protocol’s default language as written in another language is submitted without a language.',
  },
  relabelSubmit: {
    id: 'architect.localization.languageActions.relabelSubmit',
    defaultMessage: 'Relabel text',
    description:
      'Submit button of the dialog that marks every text written in the protocol’s default language as written in another language.',
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

const NO_TEXTS: readonly LocalizedStringHit[] = [];

/**
 * A stage open in the stage editor while the protocol's languages change.
 *
 * Its unsaved text is not in the protocol, so a removal has to count it too,
 * and a removal or a change of language has to reach it as well: otherwise the
 * next save writes a language the protocol no longer has.
 */
export type OpenStageDraft = Readonly<{
  /** The stage's texts as the editor holds them, at the stage's own paths. */
  texts: readonly LocalizedStringHit[];
  /** Applies a change the protocol has just taken to the open stage. */
  rewrite: (rewrite: LocalizedStringRewrite) => void;
}>;

/**
 * The control a dialog hands focus back to when it closes, asked for only then:
 * the control that asked for the change may be gone by that time.
 */
export type ReturnFocus = () => HTMLElement | null;

/**
 * The dialogs behind each change to a protocol's languages. Each change is
 * validated here and then dispatched as one protocol edit, so it is one undo
 * step. A dialog returns focus to `returnFocus` while it is still in the page,
 * and otherwise to `finalFocus`.
 */
export const useLanguageActions = (
  finalFocus: RefObject<HTMLElement | null>,
  draft?: OpenStageDraft,
) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { openDialog, confirm } = useDialog();
  const protocol = useSelector(getProtocol);
  const languageName = useLanguageName();
  const declared = protocol?.localization.locales;
  const draftTexts = draft?.texts ?? NO_TEXTS;
  const rewriteDraft = draft?.rewrite;

  const protocolTexts = useMemo(
    () => (protocol ? collectLocalizedStrings(protocol) : NO_TEXTS),
    [protocol],
  );
  const texts = useMemo(
    () => [...protocolTexts, ...draftTexts],
    [draftTexts, protocolTexts],
  );

  /** What removing `locale` would delete, unsaved stage text included. */
  const removalImpact = useCallback(
    (locale: LocaleTag): LocaleRemovalImpact =>
      getLocaleRemovalImpact(texts, locale),
    [texts],
  );

  const declaredNow = useCallback(
    () => getProtocol(store.getState())?.localization.locales,
    [store],
  );

  const focusAfter = useCallback(
    (returnFocus?: ReturnFocus) => () => {
      const target = returnFocus?.();
      return target?.isConnected ? target : finalFocus.current;
    },
    [finalFocus],
  );

  const availableChoices = useCallback(
    (declaredLocales: readonly LocaleTag[]) =>
      getLanguageChoices(intl.locale).filter(
        (choice) => !declaredLocales.includes(choice.locale),
      ),
    [intl.locale],
  );

  const addLanguages = useCallback(async () => {
    if (!declared) return;
    const values = await openDialog({
      type: 'form',
      title: intl.formatMessage(messages.addTitle),
      description: intl.formatMessage(messages.addDescription),
      submitLabel: intl.formatMessage(messages.addSubmit),
      finalFocus,
      children: (
        <LanguagePicker
          label={intl.formatMessage(messages.languagesLabel)}
          choices={availableChoices(declared)}
          initialValue={[]}
        />
      ),
    });
    if (!values) return;
    const locales = chosenLanguages(values);
    if (locales.length > 0) dispatch(addProtocolLocales({ locales }));
  }, [availableChoices, declared, dispatch, finalFocus, intl, openDialog]);

  /**
   * Marks the text of the default language as written in another language,
   * one the protocol does not have yet, without translating anything.
   */
  const relabelDefaultLanguage = useCallback(
    async (returnFocus?: ReturnFocus) => {
      if (!protocol || !declared) return;
      const from = protocol.localization.defaultLocale;
      const language = languageName(from);
      const values = await openDialog({
        type: 'form',
        title: intl.formatMessage(messages.relabelTitle, { language }),
        description: intl.formatMessage(messages.relabelDescription, {
          language,
        }),
        submitLabel: intl.formatMessage(messages.relabelSubmit),
        finalFocus: focusAfter(returnFocus),
        children: (
          <Field<typeof NativeSelectField>
            name="language"
            label={intl.formatMessage(messages.languageLabel)}
            hint={
              declared.length > 1
                ? intl.formatMessage(messages.relabelHint)
                : undefined
            }
            component={NativeSelectField}
            placeholder={intl.formatMessage(messages.chooseALanguage)}
            options={availableChoices(declared).map((choice) => ({
              value: choice.locale,
              label: languageOptionText(intl, choice),
            }))}
            required={intl.formatMessage(messages.chooseOne)}
          />
        ),
      });
      if (!values) return;
      const tag = values.language;
      if (typeof tag !== 'string') return;
      dispatch(relabelProtocolDefaultLocale({ locale: tag }));
      // The language as the protocol now records it, which is the tag after
      // canonicalisation; unchanged if the change was refused.
      const to = getProtocol(store.getState())?.localization.defaultLocale;
      if (to !== undefined && to !== from) {
        rewriteDraft?.(relabelledLocale(from, to));
      }
    },
    [
      availableChoices,
      declared,
      dispatch,
      focusAfter,
      intl,
      languageName,
      openDialog,
      protocol,
      rewriteDraft,
      store,
    ],
  );

  const removeLanguage = useCallback(
    async (locale: LocaleTag, returnFocus?: ReturnFocus) => {
      if (!protocol) return;
      const language = languageName(locale);
      const { translationCount } = removalImpact(locale);
      await confirm({
        title: intl.formatMessage(messages.removeTitle, { language }),
        description: intl.formatMessage(messages.removeDescription, {
          count: translationCount,
          language,
        }),
        confirmLabel: intl.formatMessage(messages.removeConfirm),
        intent: 'destructive',
        finalFocus: focusAfter(returnFocus),
        onConfirm: () => {
          dispatch(removeProtocolLocale({ locale }));
          const after = declaredNow();
          if (after !== undefined && !after.includes(locale)) {
            rewriteDraft?.(withoutLocale(locale));
          }
        },
      });
    },
    [
      confirm,
      declaredNow,
      dispatch,
      intl,
      languageName,
      protocol,
      removalImpact,
      rewriteDraft,
    ],
  );

  return {
    addLanguages,
    relabelDefaultLanguage,
    removeLanguage,
    removalImpact,
  };
};
