import { Check, Plus, Table2, Trash2 } from 'lucide-react';
import { type MouseEvent, useId, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Link, useLocation } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Button, { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
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
import { readStageDraft } from '~/components/StageEditor/stageDraftBeacon';
import { useAppDispatch } from '~/ducks/hooks';
import { setProtocolDefaultLocale } from '~/ducks/modules/activeProtocol';
import { promptDiscardDraft } from '~/hooks/useProtocolNavGuard';
import {
  getLocalizationCoverage,
  type LocaleCoverage,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

import { describeLanguage } from './languageChoices';
import TranslationFallback from './TranslationFallback';
import {
  openedFromLanguagesState,
  translationTableHref,
} from './translationTableLinks';
import {
  type OpenStageDraft,
  type ReturnFocus,
  useLanguageActions,
} from './useLanguageActions';
import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  title: {
    id: 'architect.localization.languageList.title',
    defaultMessage: 'Protocol languages',
    description: 'Heading of the list of languages a protocol is written in.',
  },
  description: {
    id: 'architect.localization.languageList.description',
    defaultMessage:
      'Participants can take the interview in any of these languages. They see each text in the first of the following languages that has a translation of it:',
    description:
      'Introduction to the list of protocol languages, shown when the protocol has more than one. Its second sentence introduces a numbered list, under it, of the languages a participant may see a text in, in the order they are tried. The list of protocol languages is in alphabetical order; its order has no effect on which language participants see.',
  },
  descriptionSingle: {
    id: 'architect.localization.languageList.descriptionSingle',
    defaultMessage:
      'Participants take the interview in this language. Add more languages to let them choose one.',
    description:
      'Explanation of the list of protocol languages, shown when the protocol has only one language.',
  },
  defaultLanguage: {
    id: 'architect.localization.languageList.defaultLanguage',
    defaultMessage: 'Default language',
    description:
      'Label of the list above the protocol languages that chooses which of them is the default.',
  },
  defaultLanguageHint: {
    id: 'architect.localization.languageList.defaultLanguageHint',
    defaultMessage:
      'Participants see text in this language when it has no translation in a language they use.',
    description:
      'Hint under the list that chooses the protocol’s default language, saying what the default language does.',
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
  relabelDefault: {
    id: 'architect.localization.languageList.relabelDefault',
    defaultMessage: 'Relabel default language',
    description:
      'Button beside the choice of the protocol’s default language. It opens a dialog that marks every text written in the default language as written in another language, for a protocol whose text is in a different language than it says, such as one upgraded from an earlier version and assumed to be English. Nothing is translated.',
  },
  removeLanguage: {
    id: 'architect.localization.languageList.removeLanguage',
    defaultMessage: 'Remove {language}',
    description:
      'Accessible name of the delete button at the end of a protocol language’s row, which removes that language from the protocol. language is the language name.',
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
  missingBadge: {
    id: 'architect.localization.languageList.missingBadge',
    defaultMessage: 'Missing translations',
    description:
      'Badge on a protocol language that some texts have not been translated into yet.',
  },
  defaultNote: {
    id: 'architect.localization.languageList.defaultNote',
    defaultMessage:
      'To remove the default language, make another language the default first.',
    description:
      'Tooltip and accessible description of the unavailable delete button of the default language, saying why it cannot be removed.',
  },
  strandedNote: {
    id: 'architect.localization.languageList.strandedNote',
    defaultMessage:
      '{count, plural, one {# text exists only in {language}. Translate it into another language before removing {language}.} other {# texts exist only in {language}. Translate them into another language before removing {language}.}}',
    description:
      'Tooltip and accessible description of the unavailable delete button of a language, saying why it cannot be removed: some text has no other translation.',
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
      description={
        multilingual ? (
          <>
            <Paragraph>{intl.formatMessage(messages.description)}</Paragraph>
            <TranslationFallback />
          </>
        ) : (
          intl.formatMessage(messages.descriptionSingle)
        )
      }
    >
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
  const relabelButtonRef = useRef<HTMLButtonElement>(null);
  const {
    addLanguages,
    relabelDefaultLanguage,
    removeLanguage,
    removalImpact,
  } = useLanguageActions(addButtonRef, draft);
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

  // The translation table opens over the Languages page, so going to it from
  // the stage editor leaves the stage, and unsaved changes to it are confirmed
  // first, as Back confirms them. From the Languages page itself, its entry in
  // the history says so, and closing it goes back.
  const tableLinkState = draft === undefined ? openedFromLanguagesState : null;
  const guardLeavingStage =
    (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (draft === undefined || !readStageDraft().dirty) return;
      event.preventDefault();
      void promptDiscardDraft(openDialog, () => setLocation(href), true);
    };
  const tableHref = translationTableHref();

  return (
    <>
      {/* The default language is chosen, or its text relabelled, here. The
          field sits in a wrapper of its own, so its spacing for a following
          field does not part it from the button. */}
      <div className="mb-4 flex flex-col items-start gap-3">
        {locales.length > 1 && (
          <div className="w-full">
            <UnconnectedField
              name="default-language"
              label={intl.formatMessage(messages.defaultLanguage)}
              hint={intl.formatMessage(messages.defaultLanguageHint)}
              component={NativeSelectField}
              options={sortedLocales.map((locale) => ({
                value: locale,
                label: languageName(locale),
              }))}
              value={protocol.localization.defaultLocale}
              onChange={(locale) => {
                if (typeof locale === 'string') {
                  dispatch(setProtocolDefaultLocale({ locale }));
                }
              }}
            />
          </div>
        )}
        <Button
          ref={relabelButtonRef}
          size="sm"
          variant="link"
          onClick={() =>
            void relabelDefaultLanguage(() => relabelButtonRef.current)
          }
        >
          {intl.formatMessage(messages.relabelDefault)}
        </Button>
      </div>
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
              onRemove={(returnFocus) => removeLanguage(locale, returnFocus)}
            />
          );
        })}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        {locales.length > 1 && (
          <Button asChild color="primary" icon={<Table2 aria-hidden />}>
            <Link
              href={tableHref}
              state={tableLinkState}
              onClick={guardLeavingStage(tableHref)}
            >
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
  onRemove: (returnFocus: ReturnFocus) => Promise<void>;
};

const LanguageRow = ({
  entry,
  total,
  strandedCount,
  onRemove,
}: LanguageRowProps) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const removalReasonId = useId();
  const { locale, isDefault, translated, missing } = entry;
  const isComplete = total > 0 && translated === total;
  const language = languageName(locale);
  const own = describeLanguage(locale, intl.locale);
  const removalBlockedReason = isDefault
    ? intl.formatMessage(messages.defaultNote)
    : strandedCount > 0
      ? intl.formatMessage(messages.strandedNote, {
          count: strandedCount,
          language,
        })
      : null;

  return (
    <li className="flex items-start gap-4 py-5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-lg font-semibold">{language}</span>
          {own.autonym !== language && (
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
          {total > 0 && missing > 0 && (
            <Badge render={<span />} size="sm" tone="warning">
              {intl.formatMessage(messages.missingBadge)}
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
      </div>
      {/* An unavailable button stays focusable (aria-disabled rather than
          disabled), so its reason reaches keyboard and pointer users as a
          tooltip and screen readers as its description. */}
      <Tooltip disabled={removalBlockedReason === null}>
        <TooltipTrigger
          render={
            <IconButton
              ref={removeButtonRef}
              variant="text"
              color="dynamic"
              aria-label={intl.formatMessage(messages.removeLanguage, {
                language,
              })}
              aria-disabled={removalBlockedReason !== null || undefined}
              aria-describedby={
                removalBlockedReason === null ? undefined : removalReasonId
              }
              icon={<Trash2 aria-hidden />}
              onClick={() => {
                if (removalBlockedReason !== null) return;
                void onRemove(() => removeButtonRef.current);
              }}
            />
          }
        />
        {removalBlockedReason !== null && (
          <TooltipContent side="left" className="max-w-64">
            {removalBlockedReason}
          </TooltipContent>
        )}
      </Tooltip>
      {removalBlockedReason !== null && (
        <span id={removalReasonId} hidden>
          {removalBlockedReason}
        </span>
      )}
    </li>
  );
};

export default LanguageList;
