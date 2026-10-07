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
  relabelProtocolLocale,
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
import { UNSPECIFIED_LOCALE } from '~/utils/localizedText';

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
    defaultMessage: 'Relabel {language} translations',
    description:
      'Title of the dialog that marks every text written in one protocol language as written in another. language is the current language name.',
  },
  relabelDescription: {
    id: 'architect.localization.languageActions.relabelDescription',
    defaultMessage:
      'Use this when these translations are really in another language or regional variant, such as Mexican Spanish rather than Spanish. Every text marked as {language} will be marked as the language you choose. Nothing is translated or deleted.',
    description:
      'Explanation in the dialog that relabels a protocol language: when to use it and what it does. language is the current language name. The example names a regional variant of a language.',
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
      'Label of the list of languages in the dialog that relabels a protocol language, or identifies the language of unidentified text.',
  },
  chooseALanguage: {
    id: 'architect.localization.languageActions.chooseALanguage',
    defaultMessage: 'Choose a language',
    description:
      'Placeholder of the list of languages that text can be relabelled as.',
  },
  chooseOne: {
    id: 'architect.localization.languageActions.chooseOne',
    defaultMessage: 'Choose a language.',
    description:
      'Error when the dialog that relabels a protocol language is submitted without a language.',
  },
  relabelSubmit: {
    id: 'architect.localization.languageActions.relabelSubmit',
    defaultMessage: 'Relabel translations',
    description:
      'Submit button of the dialog that marks every text written in one protocol language as written in another.',
  },
  identifySubmit: {
    id: 'architect.localization.languageActions.identifySubmit',
    defaultMessage: 'Identify language',
    description:
      'Submit button of the dialog that names the language of text whose language has not been identified.',
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

  const relabelLanguage = useCallback(
    async (from: LocaleTag, returnFocus?: ReturnFocus) => {
      if (!declared) return;
      const isUnspecified = from === UNSPECIFIED_LOCALE;
      const values = await openDialog({
        type: 'form',
        title: isUnspecified
          ? intl.formatMessage(messages.identifyTitle)
          : intl.formatMessage(messages.relabelTitle, {
              language: languageName(from),
            }),
        description: isUnspecified
          ? intl.formatMessage(messages.identifyDescription)
          : intl.formatMessage(messages.relabelDescription, {
              language: languageName(from),
            }),
        submitLabel: intl.formatMessage(
          isUnspecified ? messages.identifySubmit : messages.relabelSubmit,
        ),
        finalFocus: focusAfter(returnFocus),
        children: (
          <Field<typeof NativeSelectField>
            name="language"
            label={intl.formatMessage(messages.languageLabel)}
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
      const before = declaredNow() ?? [];
      dispatch(relabelProtocolLocale({ from, to: tag }));
      // The language as the protocol now declares it, which is the tag after
      // canonicalisation, and nothing at all if the change was refused.
      const to = declaredNow()?.find((locale) => !before.includes(locale));
      if (to !== undefined) rewriteDraft?.(relabelledLocale(from, to));
    },
    [
      availableChoices,
      declared,
      declaredNow,
      dispatch,
      intl,
      languageName,
      openDialog,
      rewriteDraft,
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

  return { addLanguages, relabelLanguage, removeLanguage, removalImpact };
};
