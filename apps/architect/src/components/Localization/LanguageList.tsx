import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Badge } from '@codaco/fresco-ui/Badge';
import Button, { IconButton } from '@codaco/fresco-ui/Button';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { LocaleTag } from '@codaco/protocol-validation';
import { useAppDispatch } from '~/ducks/hooks';
import {
  moveProtocolLocale,
  setProtocolDefaultLocale,
} from '~/ducks/modules/activeProtocol';
import { getLocaleRemovalImpact } from '~/ducks/modules/protocol/localeOperations';
import {
  getLocalizationCoverage,
  type LocaleCoverage,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';
import { UNSPECIFIED_LOCALE } from '~/utils/localizedText';

import { describeLanguage } from './languageChoices';
import { useLanguageActions } from './useLanguageActions';
import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  unspecifiedTitle: {
    id: 'architect.localization.languageList.unspecifiedTitle',
    defaultMessage: 'Which language is your text written in?',
    description:
      'Title of the notice asking the researcher to identify the language of text whose language has not been identified.',
  },
  unspecifiedDescription: {
    id: 'architect.localization.languageList.unspecifiedDescription',
    defaultMessage:
      'This protocol was made before protocols declared their languages, so its text is marked as an unidentified language. Identify the language before you add translations, so participants and exported data show the right language.',
    description:
      'Notice asking the researcher to identify the language of text whose language has not been identified.',
  },
  title: {
    id: 'architect.localization.languageList.title',
    defaultMessage: 'Protocol languages',
    description: 'Heading of the list of languages a protocol is written in.',
  },
  description: {
    id: 'architect.localization.languageList.description',
    defaultMessage:
      'Participants choose one of these languages. Text without a translation in their language is shown in the default language, or else in the first language in this list that has it.',
    description: 'Explanation of the list of protocol languages and its order.',
  },
  addLanguages: {
    id: 'architect.localization.languageList.addLanguages',
    defaultMessage: 'Add languages',
    description: 'Button that opens the dialog for adding languages.',
  },
  defaultBadge: {
    id: 'architect.localization.languageList.defaultBadge',
    defaultMessage: 'Default',
    description: 'Badge marking the default language of a protocol.',
  },
  moveUp: {
    id: 'architect.localization.languageList.moveUp',
    defaultMessage: 'Move {language} up',
    description: 'Button that moves a language earlier in the list.',
  },
  moveDown: {
    id: 'architect.localization.languageList.moveDown',
    defaultMessage: 'Move {language} down',
    description: 'Button that moves a language later in the list.',
  },
  moved: {
    id: 'architect.localization.languageList.moved',
    defaultMessage:
      '{language} moved to position {position, number} of {count, number}.',
    description: 'Screen-reader announcement after a language is moved.',
  },
  makeDefault: {
    id: 'architect.localization.languageList.makeDefault',
    defaultMessage: 'Make default',
    description: 'Button that makes a language the default.',
  },
  changeLanguage: {
    id: 'architect.localization.languageList.changeLanguage',
    defaultMessage: 'Change language',
    description:
      'Button that says which language the text marked with this language is really written in.',
  },
  identifyLanguage: {
    id: 'architect.localization.languageList.identifyLanguage',
    defaultMessage: 'Identify language',
    description:
      'Button that names the language of text whose language has not been identified.',
  },
  remove: {
    id: 'architect.localization.languageList.remove',
    defaultMessage: 'Remove',
    description: 'Button that removes a language from a protocol.',
  },
  coverage: {
    id: 'architect.localization.languageList.coverage',
    defaultMessage: '{translated, number} of {total, number} texts translated',
    description: 'How much of a protocol is translated into one language.',
  },
  coverageLabel: {
    id: 'architect.localization.languageList.coverageLabel',
    defaultMessage: '{language} translation progress',
    description: 'Accessible name of the progress bar of one language.',
  },
  noText: {
    id: 'architect.localization.languageList.noText',
    defaultMessage: 'There is no text to translate yet.',
    description: 'Shown instead of translation progress in an empty protocol.',
  },
  showMissing: {
    id: 'architect.localization.languageList.showMissing',
    defaultMessage:
      '{count, plural, one {Show # missing translation} other {Show # missing translations}}',
    description:
      'Button that lists the texts not yet translated into one language.',
  },
  defaultNote: {
    id: 'architect.localization.languageList.defaultNote',
    defaultMessage:
      'To remove the default language, make another language the default first.',
    description: 'Why the default language cannot be removed.',
  },
  strandedNote: {
    id: 'architect.localization.languageList.strandedNote',
    defaultMessage:
      '{count, plural, one {# text exists only in {language}. Translate it into another language before removing {language}.} other {# texts exist only in {language}. Translate them into another language before removing {language}.}}',
    description:
      'Why a language cannot be removed: some text has no other translation.',
  },
});

type PendingFocus = {
  locale: LocaleTag;
  actions: readonly string[];
};

type LanguageListProps = {
  onShowMissing: (locale: LocaleTag) => void;
};

const LanguageList = ({ onShowMissing }: LanguageListProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const protocol = useSelector(getProtocol);
  const coverage = useSelector(getLocalizationCoverage);
  const languageName = useLanguageName();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const { addLanguages, changeLanguage, removeLanguage } =
    useLanguageActions(addButtonRef);
  const [announcement, setAnnouncement] = useState('');
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null);

  const removalImpacts = useMemo(
    () =>
      new Map(
        protocol?.localization.locales.map((locale) => [
          locale,
          getLocaleRemovalImpact(protocol, locale),
        ]),
      ),
    [protocol],
  );

  // A move or a new default re-renders the row, which can drop focus from the
  // control that was used; it goes back to that control, or the next one in
  // `actions` when that one is now disabled or gone.
  useEffect(() => {
    if (!pendingFocus) return;
    setPendingFocus(null);
    for (const action of pendingFocus.actions) {
      const target = listRef.current?.querySelector<HTMLButtonElement>(
        `[data-locale="${pendingFocus.locale}"][data-action="${action}"]`,
      );
      if (target && !target.disabled) {
        target.focus();
        return;
      }
    }
  }, [pendingFocus]);

  if (!protocol) return null;
  const { locales } = protocol.localization;

  const move = (locale: LocaleTag, index: number, direction: 'up' | 'down') => {
    dispatch(moveProtocolLocale({ locale, index }));
    setAnnouncement(
      intl.formatMessage(messages.moved, {
        language: languageName(locale),
        position: index + 1,
        count: locales.length,
      }),
    );
    setPendingFocus({
      locale,
      actions: direction === 'up' ? ['up', 'down'] : ['down', 'up'],
    });
  };

  const makeDefault = (locale: LocaleTag) => {
    dispatch(setProtocolDefaultLocale({ locale }));
    setPendingFocus({ locale, actions: ['change', 'remove'] });
  };

  return (
    <Section
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
    >
      {locales.includes(UNSPECIFIED_LOCALE) && (
        <Alert variant="warning" className="mb-6">
          <AlertTitle>
            {intl.formatMessage(messages.unspecifiedTitle)}
          </AlertTitle>
          <AlertDescription className="space-y-4">
            <span className="block">
              {intl.formatMessage(messages.unspecifiedDescription)}
            </span>
            <Button
              size="sm"
              color="warning"
              onClick={() => void changeLanguage(UNSPECIFIED_LOCALE)}
            >
              {intl.formatMessage(messages.identifyLanguage)}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <ol ref={listRef} className="divide-outline flex flex-col divide-y">
        {coverage.locales.map((entry, index) => (
          <LanguageRow
            key={entry.locale}
            entry={entry}
            total={coverage.total}
            isFirst={index === 0}
            isLast={index === coverage.locales.length - 1}
            strandedCount={
              removalImpacts.get(entry.locale)?.strandedStrings.length ?? 0
            }
            onMoveUp={() => move(entry.locale, index - 1, 'up')}
            onMoveDown={() => move(entry.locale, index + 1, 'down')}
            onMakeDefault={() => makeDefault(entry.locale)}
            onChange={() => void changeLanguage(entry.locale)}
            onRemove={() => void removeLanguage(entry.locale)}
            onShowMissing={() => onShowMissing(entry.locale)}
          />
        ))}
      </ol>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <Button
        ref={addButtonRef}
        className="mt-6"
        icon={<Plus aria-hidden />}
        onClick={() => void addLanguages()}
      >
        {intl.formatMessage(messages.addLanguages)}
      </Button>
    </Section>
  );
};

type LanguageRowProps = {
  entry: LocaleCoverage;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  strandedCount: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMakeDefault: () => void;
  onChange: () => void;
  onRemove: () => void;
  onShowMissing: () => void;
};

const LanguageRow = ({
  entry,
  total,
  isFirst,
  isLast,
  strandedCount,
  onMoveUp,
  onMoveDown,
  onMakeDefault,
  onChange,
  onRemove,
  onShowMissing,
}: LanguageRowProps) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const { locale, isDefault, translated, missing } = entry;
  const isUnspecified = locale === UNSPECIFIED_LOCALE;
  const language = languageName(locale);
  const own = isUnspecified ? null : describeLanguage(locale, intl.locale);
  const removalBlocked = isDefault || strandedCount > 0;

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-5">
      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-lg font-semibold">{language}</span>
          {own && own.autonym !== language && (
            <span
              lang={own.locale}
              dir={own.direction}
              className="text-current/70"
            >
              {own.autonym}
            </span>
          )}
          <Badge render={<span />} size="sm" appearance="outline" mono>
            {locale}
          </Badge>
          {isDefault && (
            <Badge render={<span />} size="sm" tone="primary">
              {intl.formatMessage(messages.defaultBadge)}
            </Badge>
          )}
        </div>
        {total === 0 ? (
          <Paragraph emphasis="muted" margin="none">
            {intl.formatMessage(messages.noText)}
          </Paragraph>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="w-40">
              <ProgressBar
                orientation="horizontal"
                percentProgress={(translated / total) * 100}
                nudge={false}
                label={intl.formatMessage(messages.coverageLabel, { language })}
              />
            </div>
            <span className="text-sm">
              {intl.formatMessage(messages.coverage, { translated, total })}
            </span>
            {missing > 0 && (
              <Button size="sm" variant="text" onClick={onShowMissing}>
                {intl.formatMessage(messages.showMissing, { count: missing })}
              </Button>
            )}
          </div>
        )}
        {removalBlocked && (
          <Paragraph emphasis="muted" margin="none" className="text-sm">
            {isDefault
              ? intl.formatMessage(messages.defaultNote)
              : intl.formatMessage(messages.strandedNote, {
                  count: strandedCount,
                  language,
                })}
          </Paragraph>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <IconButton
          size="sm"
          variant="text"
          icon={<ArrowUp />}
          aria-label={intl.formatMessage(messages.moveUp, { language })}
          disabled={isFirst}
          onClick={onMoveUp}
          data-locale={locale}
          data-action="up"
        />
        <IconButton
          size="sm"
          variant="text"
          icon={<ArrowDown />}
          aria-label={intl.formatMessage(messages.moveDown, { language })}
          disabled={isLast}
          onClick={onMoveDown}
          data-locale={locale}
          data-action="down"
        />
        {!isDefault && (
          <Button size="sm" variant="outline" onClick={onMakeDefault}>
            {intl.formatMessage(messages.makeDefault)}
          </Button>
        )}
        <Button
          size="sm"
          variant={isUnspecified ? 'default' : 'outline'}
          color={isUnspecified ? 'warning' : 'default'}
          onClick={onChange}
          data-locale={locale}
          data-action="change"
        >
          {intl.formatMessage(
            isUnspecified ? messages.identifyLanguage : messages.changeLanguage,
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          color="destructive"
          disabled={removalBlocked}
          onClick={onRemove}
          data-locale={locale}
          data-action="remove"
        >
          {intl.formatMessage(messages.remove)}
        </Button>
      </div>
    </li>
  );
};

export default LanguageList;
