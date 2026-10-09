import { useCallback, useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { LocalizedMessageVersionsSummary } from '@codaco/protocol-builder/fields/LocalizedMessageField';
import {
  fallbackDependsOnBrowser,
  resolveTranslation,
} from '@codaco/protocol-builder/localization/localizedText';
import {
  getLocaleMetadata,
  type LocaleTag,
  type LocalizedString,
  type MessageArguments,
  messageText,
  sortByLanguageName,
} from '@codaco/protocol-validation';
import { useLanguageName } from '~/components/Localization/useLanguageName';
import Markdown from '~/components/Markdown';
import { resolveLocalizedText } from '~/utils/localizedText';

import SummaryContext from './SummaryContext';

const messages = defineMessages({
  defaultLanguage: {
    id: 'architect.protocolSummary.translations.defaultLanguage',
    defaultMessage: 'Default',
    description:
      'Badge beside the protocol’s default language in the printable protocol summary: in the list of the protocol’s languages on its cover, and beside each text, which the summary lists in every protocol language.',
  },
  notTranslated: {
    id: 'architect.protocolSummary.translations.notTranslated',
    defaultMessage: 'Not translated yet. Participants see the {language} text.',
    description:
      'Shown in the printable protocol summary beside a language that a text has no translation in, when participants using that language are certain to see it in another language instead: a closely related language, such as Brazilian Portuguese for European Portuguese, or the only language the text is written in. language is that language’s name.',
  },
  notTranslatedUnlessBrowserLists: {
    id: 'architect.protocolSummary.translations.notTranslatedUnlessBrowserLists',
    defaultMessage:
      'Not translated yet. Participants see the {language} text, unless their browser also lists a language that has it.',
    description:
      'Shown in the printable protocol summary beside a language that a text has no translation in, nor in a closely related language. Participants using that language see the text in another language their web browser lists, when the text has a translation in one, and otherwise in language: the protocol’s default language, or failing that another of its languages.',
  },
});

const languageAttributes = (locale: LocaleTag) => ({
  lang: locale,
  dir: getLocaleMetadata(locale).direction,
});

type SummaryTextProps = {
  value: LocalizedString | undefined;
};

type Format = 'plain' | 'markdown';

/** Whether the protocol has more than one language. */
export const useMultilingualSummary = () => {
  const { protocol } = useContext(SummaryContext);
  return protocol.localization.locales.length > 1;
};

/** The protocol's languages, alphabetical by the name the reader sees. */
export const useSummaryLanguages = () => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const { protocol } = useContext(SummaryContext);
  return sortByLanguageName(
    protocol.localization.locales,
    languageName,
    intl.locale,
  );
};

/**
 * Resolves protocol text in the protocol's default language, falling back
 * exactly as the interview does for a participant who chose that language.
 */
export const useDefaultLanguageText = () => {
  const { protocol } = useContext(SummaryContext);
  return useCallback(
    (value: LocalizedString | undefined) =>
      resolveLocalizedText(value, protocol.localization),
    [protocol.localization],
  );
};

/**
 * Protocol text in the default language, marked with the language of the
 * translation shown. For text that names something whose every translation the
 * summary lists where it is defined: a stage named in the contents, say.
 */
export const DefaultLanguageText = ({ value }: SummaryTextProps) => {
  const resolved = useDefaultLanguageText()(value);
  if (!resolved) return null;
  return <span {...languageAttributes(resolved.locale)}>{resolved.text}</span>;
};

export const DefaultLanguageBadge = () => {
  const intl = useAppIntl();
  return (
    <Badge render={<span />} size="sm" tone="primary">
      {intl.formatMessage(messages.defaultLanguage)}
    </Badge>
  );
};

/**
 * One translation. A message whose setting declares arguments reads as its
 * versions, one for each case it distinguishes, with its placeholders named.
 */
const TranslationContent = ({
  text,
  format,
  locale,
  messageArguments,
}: {
  text: string;
  format: Format;
  locale: LocaleTag;
  messageArguments: MessageArguments | undefined;
}) => {
  if (messageArguments !== undefined) {
    return (
      <LocalizedMessageVersionsSummary
        message={text}
        declaration={messageArguments}
        locale={locale}
      />
    );
  }
  const literal = messageText(text);
  return format === 'markdown' ? <Markdown label={literal} /> : literal;
};

/**
 * What participants using `locale` see in place of the missing translation:
 * only a closely related language, or the only translation there is, is
 * certain, since Architect cannot know which other languages a browser lists.
 */
const MissingTranslation = ({
  value,
  locale,
}: {
  value: LocalizedString;
  locale: LocaleTag;
}) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const { protocol } = useContext(SummaryContext);
  const shown = resolveTranslation(value, protocol.localization, locale);
  if (shown.lang === undefined) return null;
  return (
    <span className="text-current/65 italic">
      {intl.formatMessage(
        fallbackDependsOnBrowser(value, protocol.localization, shown)
          ? messages.notTranslatedUnlessBrowserLists
          : messages.notTranslated,
        { language: languageName(shown.lang) },
      )}
    </span>
  );
};

/** Every translation of a text, one protocol language per row. */
const Translations = ({
  value,
  format,
  messageArguments,
}: {
  value: LocalizedString;
  format: Format;
  messageArguments: MessageArguments | undefined;
}) => {
  const languageName = useLanguageName();
  const { protocol } = useContext(SummaryContext);
  const locales = useSummaryLanguages();

  return (
    <dl className="m-0 flex flex-col gap-2">
      {locales.map((locale) => {
        const message = value[locale];
        return (
          // The language and its text wrap onto two lines where the column is
          // too narrow for both, such as in a table cell.
          <div
            key={locale}
            className="flex break-inside-avoid flex-wrap items-baseline gap-x-4 gap-y-0.5"
          >
            <dt className="flex w-40 flex-none flex-wrap items-center gap-1 text-xs font-semibold text-current/70">
              {languageName(locale)}
              {locale === protocol.localization.defaultLocale && (
                <DefaultLanguageBadge />
              )}
            </dt>
            {message === undefined ? (
              <dd className="m-0 min-w-[min(12rem,100%)] flex-1">
                <MissingTranslation value={value} locale={locale} />
              </dd>
            ) : (
              <dd
                {...languageAttributes(locale)}
                className="m-0 min-w-[min(12rem,100%)] flex-1"
              >
                <TranslationContent
                  text={message}
                  format={format}
                  locale={locale}
                  messageArguments={messageArguments}
                />
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
};

/**
 * Protocol text as the summary shows it: plainly, marked with its language, in
 * a protocol with one language, and otherwise in every protocol language. A
 * text with no translation in any declared language reads as absent.
 */
const LocalizedText = ({
  value,
  format,
  messageArguments,
}: SummaryTextProps & {
  format: Format;
  messageArguments?: MessageArguments;
}) => {
  const multilingual = useMultilingualSummary();
  const resolved = useDefaultLanguageText()(value);
  if (!resolved || value === undefined) return null;
  const text = value[resolved.locale];
  if (text === undefined) return null;
  if (multilingual) {
    return (
      <Translations
        value={value}
        format={format}
        messageArguments={messageArguments}
      />
    );
  }
  return (
    <span {...languageAttributes(resolved.locale)}>
      <TranslationContent
        text={text}
        format={format}
        locale={resolved.locale}
        messageArguments={messageArguments}
      />
    </span>
  );
};

export const SummaryText = ({ value }: SummaryTextProps) => (
  <LocalizedText value={value} format="plain" />
);

export const SummaryMarkdown = ({ value }: SummaryTextProps) => (
  <LocalizedText value={value} format="markdown" />
);

/** A message that reads differently by what it is about: its versions. */
export const SummaryMessage = ({
  value,
  messageArguments,
}: SummaryTextProps & { messageArguments: MessageArguments }) => (
  <LocalizedText
    value={value}
    format="plain"
    messageArguments={messageArguments}
  />
);
