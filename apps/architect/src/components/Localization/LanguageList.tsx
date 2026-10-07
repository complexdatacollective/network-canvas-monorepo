import { Plus } from 'lucide-react';
import { useId, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Badge } from '@codaco/fresco-ui/Badge';
import Button from '@codaco/fresco-ui/Button';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import Section from '@codaco/fresco-ui/Section';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  type LocaleTag,
  sortByLanguageName,
} from '@codaco/protocol-validation';
import { useAppDispatch } from '~/ducks/hooks';
import { setProtocolDefaultLocale } from '~/ducks/modules/activeProtocol';
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
      'Participants can take the interview in any of these languages. Each text is shown in the closest language that has it: the participant’s own language, then a related language, then another language their browser lists, then the default language, then any other.',
    description:
      'Explanation of the list of protocol languages, shown when the protocol has more than one. A related language is, for example, Brazilian Portuguese for a participant using European Portuguese. The list is in alphabetical order; its order has no effect.',
  },
  descriptionSingle: {
    id: 'architect.localization.languageList.descriptionSingle',
    defaultMessage:
      'Participants take the interview in this language. Add more languages to let them choose one.',
    description:
      'Explanation of the list of protocol languages, shown when the protocol has only one language.',
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
    description:
      'Tooltip and screen-reader description of the unavailable Remove button of the default language, saying why it cannot be removed.',
  },
  strandedNote: {
    id: 'architect.localization.languageList.strandedNote',
    defaultMessage:
      '{count, plural, one {# text exists only in {language}. Translate it into another language before removing {language}.} other {# texts exist only in {language}. Translate them into another language before removing {language}.}}',
    description:
      'Tooltip and screen-reader description of an unavailable Remove button, saying why the language cannot be removed: some text has no other translation.',
  },
});

const EMPTY_LOCALES: readonly LocaleTag[] = [];

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
  const { addLanguages, changeLanguage, removeLanguage } =
    useLanguageActions(addButtonRef);
  const locales = protocol?.localization.locales ?? EMPTY_LOCALES;
  const sortedLocales = useMemo(
    () => sortByLanguageName(locales, languageName, intl.locale),
    [intl.locale, languageName, locales],
  );

  const coverageByLocale = useMemo(
    () => new Map(coverage.locales.map((entry) => [entry.locale, entry])),
    [coverage],
  );

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

  if (!protocol) return null;

  return (
    <Section
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(
        locales.length > 1 ? messages.description : messages.descriptionSingle,
      )}
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
      <ul className="divide-outline flex flex-col divide-y">
        {sortedLocales.map((locale) => {
          const entry = coverageByLocale.get(locale);
          if (!entry) return null;
          return (
            <LanguageRow
              key={locale}
              entry={entry}
              total={coverage.total}
              strandedCount={
                removalImpacts.get(locale)?.strandedStrings.length ?? 0
              }
              onMakeDefault={() =>
                dispatch(setProtocolDefaultLocale({ locale }))
              }
              onChange={() => void changeLanguage(locale)}
              onRemove={() => void removeLanguage(locale)}
              onShowMissing={() => onShowMissing(locale)}
            />
          );
        })}
      </ul>
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
  strandedCount: number;
  onMakeDefault: () => void;
  onChange: () => void;
  onRemove: () => void;
  onShowMissing: () => void;
};

const LanguageRow = ({
  entry,
  total,
  strandedCount,
  onMakeDefault,
  onChange,
  onRemove,
  onShowMissing,
}: LanguageRowProps) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  const removalReasonId = useId();
  const { locale, isDefault, translated, missing } = entry;
  const isUnspecified = locale === UNSPECIFIED_LOCALE;
  const language = languageName(locale);
  const own = isUnspecified ? null : describeLanguage(locale, intl.locale);
  const removalBlockedReason = isDefault
    ? intl.formatMessage(messages.defaultNote)
    : strandedCount > 0
      ? intl.formatMessage(messages.strandedNote, {
          count: strandedCount,
          language,
        })
      : null;

  // Making this language the default unmounts the button that did it; focus
  // moves on to the row's next action instead of falling to the page.
  const makeDefault = () => {
    flushSync(onMakeDefault);
    changeButtonRef.current?.focus();
  };

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
                label={intl.formatMessage(messages.coverageLabel, {
                  language,
                })}
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
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {!isDefault && (
          <Button size="sm" variant="text" onClick={makeDefault}>
            {intl.formatMessage(messages.makeDefault)}
          </Button>
        )}
        <Button
          ref={changeButtonRef}
          size="sm"
          variant={isUnspecified ? 'default' : 'text'}
          color={isUnspecified ? 'warning' : 'default'}
          onClick={onChange}
        >
          {intl.formatMessage(
            isUnspecified ? messages.identifyLanguage : messages.changeLanguage,
          )}
        </Button>
        {removalBlockedReason ? (
          // `aria-disabled` rather than `disabled`, which would take the
          // button out of the focus order and stop the pointer events that
          // open the tooltip, leaving keyboard and screen-reader users with
          // no way to learn why it is unavailable. It has no click handler.
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="text"
                  color="destructive"
                  aria-disabled
                  aria-describedby={removalReasonId}
                >
                  {intl.formatMessage(messages.remove)}
                </Button>
              }
            />
            <span id={removalReasonId} className="sr-only">
              {removalBlockedReason}
            </span>
            <TooltipContent aria-hidden="true">
              {removalBlockedReason}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button
            size="sm"
            variant="text"
            color="destructive"
            onClick={onRemove}
          >
            {intl.formatMessage(messages.remove)}
          </Button>
        )}
      </div>
    </li>
  );
};

export default LanguageList;
