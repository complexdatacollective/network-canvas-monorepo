import {
  Check,
  Ellipsis,
  Languages,
  Plus,
  Star,
  Table2,
  Trash2,
} from 'lucide-react';
import { type MouseEvent, useId, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useLocation } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Badge } from '@codaco/fresco-ui/Badge';
import Button, { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  type LocaleTag,
  sortByLanguageName,
} from '@codaco/protocol-validation';
import { readStageDraft } from '~/components/StageEditor/stageDraftBeacon';
import { useAppDispatch } from '~/ducks/hooks';
import { setProtocolDefaultLocale } from '~/ducks/modules/activeProtocol';
import { promptDiscardDraft } from '~/hooks/useProtocolNavGuard';
import {
  getLocalizationCoverage,
  type LocaleCoverage,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';
import { UNSPECIFIED_LOCALE } from '~/utils/localizedText';

import { describeLanguage } from './languageChoices';
import TranslationFallback from './TranslationFallback';
import { translationTableHref } from './translationTableLinks';
import {
  type OpenStageDraft,
  type ReturnFocus,
  useLanguageActions,
} from './useLanguageActions';
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
      'Participants can take the interview in any of these languages.',
    description:
      'Lead sentence of the list of protocol languages, shown when the protocol has more than one. The list is in alphabetical order; its order has no effect on which language participants see.',
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
  openTable: {
    id: 'architect.localization.languageList.openTable',
    defaultMessage: 'Open translation table',
    description:
      'Link under the list of protocol languages to the translation table, which shows every participant-facing text beside its translation into each language.',
  },
  defaultBadge: {
    id: 'architect.localization.languageList.defaultBadge',
    defaultMessage: 'Default',
    description: 'Badge marking the default language of a protocol.',
  },
  actionsFor: {
    id: 'architect.localization.languageList.actionsFor',
    defaultMessage: 'Actions for {language}',
    description:
      'Accessible name of the button that opens the menu of actions for one protocol language, and of that menu. language is the language name.',
  },
  makeDefault: {
    id: 'architect.localization.languageList.makeDefault',
    defaultMessage: 'Make default',
    description:
      'Item in the menu of actions for one protocol language that makes it the default language.',
  },
  relabel: {
    id: 'architect.localization.languageList.relabel',
    defaultMessage: 'Relabel translations…',
    description:
      'Item in the menu of actions for one protocol language. It opens a dialog that marks every text written in this language as written in another language, for when the language was chosen wrongly. Nothing is translated.',
  },
  identifyLanguage: {
    id: 'architect.localization.languageList.identifyLanguage',
    defaultMessage: 'Identify language',
    description:
      'Button that names the language of text whose language has not been identified.',
  },
  identifyItem: {
    id: 'architect.localization.languageList.identifyItem',
    defaultMessage: 'Identify language…',
    description:
      'Item in the menu of actions for the unidentified language. It opens a dialog that names the language the text is written in.',
  },
  remove: {
    id: 'architect.localization.languageList.remove',
    defaultMessage: 'Remove',
    description:
      'Item in the menu of actions for one protocol language that removes it from the protocol.',
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
      '{count, plural, one {Show # missing {language} translation} other {Show # missing {language} translations}}',
    description:
      'Link that opens the translation table showing only the texts not yet translated into one language. language is the language name.',
  },
  defaultNote: {
    id: 'architect.localization.languageList.defaultNote',
    defaultMessage:
      'To remove the default language, make another language the default first.',
    description:
      'Shown under the unavailable Remove item in the menu of actions for the default language, saying why it cannot be removed.',
  },
  strandedNote: {
    id: 'architect.localization.languageList.strandedNote',
    defaultMessage:
      '{count, plural, one {# text exists only in {language}. Translate it into another language before removing {language}.} other {# texts exist only in {language}. Translate them into another language before removing {language}.}}',
    description:
      'Shown under the unavailable Remove item in the menu of actions for a language, saying why it cannot be removed: some text has no other translation.',
  },
});

const EMPTY_LOCALES: readonly LocaleTag[] = [];

/** The Languages page's list of the protocol's languages. */
const LanguageList = () => {
  const intl = useAppIntl();
  const protocol = useSelector(getProtocol);
  const locales = protocol?.localization.locales ?? EMPTY_LOCALES;

  if (!protocol) return null;

  const multilingual = locales.length > 1;

  return (
    <Section
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(
        multilingual ? messages.description : messages.descriptionSingle,
      )}
    >
      {multilingual && <TranslationFallback />}
      <ProtocolLanguages />
    </Section>
  );
};

type ProtocolLanguagesProps = {
  /** A stage open in the stage editor, which every change has to reach too. */
  draft?: OpenStageDraft;
};

/**
 * The protocol's languages and every change that can be made to them, for
 * whichever page shows them.
 */
export const ProtocolLanguages = ({ draft }: ProtocolLanguagesProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const [, setLocation] = useLocation();
  const protocol = useSelector(getProtocol);
  const coverage = useSelector(getLocalizationCoverage);
  const languageName = useLanguageName();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const { addLanguages, relabelLanguage, removeLanguage, removalImpact } =
    useLanguageActions(addButtonRef, draft);
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
    () => new Map(locales.map((locale) => [locale, removalImpact(locale)])),
    [locales, removalImpact],
  );

  if (!protocol) return null;

  // The translation table is a page of its own, and going to it from the
  // stage editor leaves the stage, so unsaved changes to it are confirmed
  // first, as Back confirms them.
  const guardLeavingStage =
    (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (draft === undefined || !readStageDraft().dirty) return;
      event.preventDefault();
      void promptDiscardDraft(openDialog, () => setLocation(href), true);
    };
  const tableHref = translationTableHref();

  return (
    <>
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
              onClick={() => void relabelLanguage(UNSPECIFIED_LOCALE)}
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
          const missingHref = translationTableHref({
            kind: 'language',
            locale,
          });
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
              onRelabel={(returnFocus) => relabelLanguage(locale, returnFocus)}
              onRemove={(returnFocus) => removeLanguage(locale, returnFocus)}
              missingHref={missingHref}
              onShowMissing={guardLeavingStage(missingHref)}
            />
          );
        })}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        {locales.length > 1 && (
          <Button asChild color="primary" icon={<Table2 aria-hidden />}>
            <Link href={tableHref} onClick={guardLeavingStage(tableHref)}>
              {intl.formatMessage(messages.openTable)}
            </Link>
          </Button>
        )}
        <Button
          ref={addButtonRef}
          icon={<Plus aria-hidden />}
          onClick={() => void addLanguages()}
        >
          {intl.formatMessage(messages.addLanguages)}
        </Button>
      </div>
    </>
  );
};

type LanguageRowProps = {
  entry: LocaleCoverage;
  total: number;
  strandedCount: number;
  onMakeDefault: () => void;
  onRelabel: (returnFocus: ReturnFocus) => Promise<void>;
  onRemove: (returnFocus: ReturnFocus) => Promise<void>;
  /** The translation table, showing this language's missing translations. */
  missingHref: string;
  onShowMissing: (event: MouseEvent<HTMLAnchorElement>) => void;
};

const LanguageRow = ({
  entry,
  total,
  strandedCount,
  onMakeDefault,
  onRelabel,
  onRemove,
  missingHref,
  onShowMissing,
}: LanguageRowProps) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const removeLabelId = useId();
  const removalReasonId = useId();
  const { locale, isDefault, translated, missing } = entry;
  const isUnspecified = locale === UNSPECIFIED_LOCALE;
  const isComplete = total > 0 && translated === total;
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

  // A dialog opened from the menu waits for the menu to close, so the menu
  // handing focus back to its button cannot pull it out of the dialog.
  const runMenuAction =
    (action: (returnFocus: ReturnFocus) => Promise<void>) => () => {
      setMenuOpen(false);
      void Promise.resolve().then(() => action(() => triggerRef.current));
    };

  return (
    <li className="flex items-start gap-4 py-5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="w-40">
              <ProgressBar
                orientation="horizontal"
                percentProgress={(translated / total) * 100}
                nudge={false}
                tone="info"
                label={intl.formatMessage(messages.coverageLabel, {
                  language,
                })}
              />
            </div>
            <span className="flex items-center gap-1 text-sm">
              {isComplete && (
                <Check aria-hidden className="text-success size-4 shrink-0" />
              )}
              {intl.formatMessage(messages.coverage, { translated, total })}
            </span>
          </div>
        )}
        {total > 0 && missing > 0 && (
          <Button asChild size="sm" variant="link" className="self-start">
            <Link href={missingHref} onClick={onShowMissing}>
              {intl.formatMessage(messages.showMissing, {
                count: missing,
                language,
              })}
            </Link>
          </Button>
        )}
      </div>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <IconButton
              ref={triggerRef}
              variant="text"
              color="dynamic"
              aria-label={intl.formatMessage(messages.actionsFor, {
                language,
              })}
              icon={<Ellipsis aria-hidden />}
            />
          }
        />
        <DropdownMenuContent side="bottom" align="end">
          {!isDefault && (
            <DropdownMenuItem
              icon={<Star aria-hidden />}
              onClick={onMakeDefault}
            >
              {intl.formatMessage(messages.makeDefault)}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            icon={<Languages aria-hidden />}
            onClick={runMenuAction(onRelabel)}
          >
            {intl.formatMessage(
              isUnspecified ? messages.identifyItem : messages.relabel,
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {removalBlockedReason ? (
            // Disabled items stay reachable with the arrow keys, and the
            // reason is part of the item rather than a tooltip, so it is read
            // out and seen by everyone who finds the item unavailable.
            <DropdownMenuItem
              disabled
              aria-labelledby={removeLabelId}
              aria-describedby={removalReasonId}
              icon={<Trash2 aria-hidden className="opacity-50" />}
              className="items-start data-disabled:opacity-100"
            >
              <span className="flex flex-col gap-1">
                <span id={removeLabelId} className="opacity-50">
                  {intl.formatMessage(messages.remove)}
                </span>
                <span id={removalReasonId} className="max-w-64 text-sm">
                  {removalBlockedReason}
                </span>
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              icon={<Trash2 aria-hidden className="text-destructive-ink" />}
              onClick={runMenuAction(onRemove)}
            >
              <span className="text-destructive-ink">
                {intl.formatMessage(messages.remove)}
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
};

export default LanguageList;
