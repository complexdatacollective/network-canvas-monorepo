import { type RefObject, useCallback } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type { LocaleTag } from '@codaco/protocol-validation';
import { useAppDispatch } from '~/ducks/hooks';
import {
  addProtocolLocales,
  relabelProtocolLocale,
  removeProtocolLocale,
} from '~/ducks/modules/activeProtocol';
import { getLocaleRemovalImpact } from '~/ducks/modules/protocol/localeOperations';
import { getProtocol } from '~/selectors/protocol';
import { UNSPECIFIED_LOCALE } from '~/utils/localizedText';

import { getLanguageChoices } from './languageChoices';
import {
  choiceRequiredValidation,
  LanguageCodeField,
  LanguagePicker,
  languageOptionText,
  resolveChoice,
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
      'Participants can take the protocol in any of its languages. Until you translate a text, participants see it in the default language.',
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
  changeTitle: {
    id: 'architect.localization.languageActions.changeTitle',
    defaultMessage: 'Change {language}',
    description:
      'Title of the dialog that says which language a protocol language really is. language is its current name.',
  },
  changeDescription: {
    id: 'architect.localization.languageActions.changeDescription',
    defaultMessage:
      'Every text marked as {language} will be marked as the language you choose. Nothing is translated or deleted.',
    description:
      'Explanation in the dialog that changes a protocol language. language is its current name.',
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
      'Label of the list of languages in the change-language dialog.',
  },
  chooseALanguage: {
    id: 'architect.localization.languageActions.chooseALanguage',
    defaultMessage: 'Choose a language',
    description: 'Placeholder of the list of languages to change to.',
  },
  chooseOne: {
    id: 'architect.localization.languageActions.chooseOne',
    defaultMessage: 'Choose a language, or enter a language code.',
    description: 'Error when the change-language dialog is submitted empty.',
  },
  changeSubmit: {
    id: 'architect.localization.languageActions.changeSubmit',
    defaultMessage: 'Change language',
    description: 'Submit button of the change-language dialog.',
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

/**
 * The dialogs behind each change to a protocol's languages. Each change is
 * validated here and then dispatched as one protocol edit, so it is one undo
 * step.
 */
export const useLanguageActions = (
  finalFocus: RefObject<HTMLElement | null>,
) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { openDialog, confirm } = useDialog();
  const protocol = useSelector(getProtocol);
  const languageName = useLanguageName();
  const declared = protocol?.localization.locales;

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
          declared={declared}
          initialValue={[]}
        />
      ),
    });
    if (!values) return;
    const locales = resolveChoice(values, 'languages');
    if (locales.length > 0) dispatch(addProtocolLocales({ locales }));
  }, [availableChoices, declared, dispatch, finalFocus, intl, openDialog]);

  const changeLanguage = useCallback(
    async (from: LocaleTag) => {
      if (!declared) return;
      const isUnspecified = from === UNSPECIFIED_LOCALE;
      const values = await openDialog({
        type: 'form',
        title: isUnspecified
          ? intl.formatMessage(messages.identifyTitle)
          : intl.formatMessage(messages.changeTitle, {
              language: languageName(from),
            }),
        description: isUnspecified
          ? intl.formatMessage(messages.identifyDescription)
          : intl.formatMessage(messages.changeDescription, {
              language: languageName(from),
            }),
        submitLabel: intl.formatMessage(messages.changeSubmit),
        finalFocus,
        children: (
          <>
            <Field<typeof NativeSelectField>
              name="language"
              label={intl.formatMessage(messages.languageLabel)}
              component={NativeSelectField}
              placeholder={intl.formatMessage(messages.chooseALanguage)}
              options={availableChoices(declared).map((choice) => ({
                value: choice.locale,
                label: languageOptionText(intl, choice),
              }))}
              custom={choiceRequiredValidation(intl, messages.chooseOne)}
            />
            <LanguageCodeField declared={declared} />
          </>
        ),
      });
      if (!values) return;
      // A typed code is the more specific answer, so it wins over the list.
      const [to] = resolveChoice(values, 'language').toReversed();
      if (to !== undefined) dispatch(relabelProtocolLocale({ from, to }));
    },
    [
      availableChoices,
      declared,
      dispatch,
      finalFocus,
      intl,
      languageName,
      openDialog,
    ],
  );

  const removeLanguage = useCallback(
    async (locale: LocaleTag) => {
      if (!protocol) return;
      const language = languageName(locale);
      const { translationCount } = getLocaleRemovalImpact(protocol, locale);
      await confirm({
        title: intl.formatMessage(messages.removeTitle, { language }),
        description: intl.formatMessage(messages.removeDescription, {
          count: translationCount,
          language,
        }),
        confirmLabel: intl.formatMessage(messages.removeConfirm),
        intent: 'destructive',
        finalFocus,
        onConfirm: () => {
          dispatch(removeProtocolLocale({ locale }));
        },
      });
    },
    [confirm, dispatch, finalFocus, intl, languageName, protocol],
  );

  return { addLanguages, changeLanguage, removeLanguage };
};
