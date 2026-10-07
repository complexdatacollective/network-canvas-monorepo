import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import { Popover, PopoverContent } from '@codaco/fresco-ui/Popover';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import RichTextField from '@codaco/protocol-builder/fields/RichTextField';
import {
  localeDirection,
  type ProtocolLocalization,
  resolveTranslation,
  translationText,
  withTranslation,
} from '@codaco/protocol-builder/localization/localizedText';
import type {
  LocaleTag,
  LocalizedString,
  LocalizedStringFormat,
} from '@codaco/protocol-validation';
import { cx } from '~/utils/cva';

import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  shownIn: {
    id: 'architect.localization.translationTable.shownIn',
    defaultMessage: 'Shown in {language}',
    description:
      'Tag in an empty cell of the translation table, under the text participants see instead of the missing translation. language is the language of that text.',
  },
  shownInUnlessBrowserLists: {
    id: 'architect.localization.translationTable.shownInUnlessBrowserLists',
    defaultMessage: 'Shown in {language}*',
    description:
      'Tag in an empty cell of the translation table, under the text participants see instead of the missing translation, when they may see another language instead. The asterisk refers to a note below the table explaining that the participant’s browser can list a language that has the text. language is the language of the text shown.',
  },
  notTranslated: {
    id: 'architect.localization.translationTable.notTranslated',
    defaultMessage: 'Not translated yet. Participants see the {language} text.',
    description:
      'Screen-reader description of an empty cell of the translation table, when participants see a closely related language instead, such as Brazilian Portuguese for European Portuguese. language is that language.',
  },
  notTranslatedUnlessBrowserLists: {
    id: 'architect.localization.translationTable.notTranslatedUnlessBrowserLists',
    defaultMessage:
      'Not translated yet. Participants see the {language} text, unless their browser also lists a language that has it.',
    description:
      'Screen-reader description of an empty cell of the translation table. Participants see the text in another language their web browser lists, when the text has a translation in one, and otherwise in language: the protocol’s default language, or failing that another of its languages.',
  },
  noTranslation: {
    id: 'architect.localization.translationTable.noTranslation',
    defaultMessage: 'Not translated into any language.',
    description:
      'Shown in an empty cell of the translation table when the text has no translation in any of the protocol’s languages.',
  },
  onlyTranslation: {
    id: 'architect.localization.translationTable.onlyTranslation',
    defaultMessage:
      'This text exists only in {language}. Translate it into another language before clearing it.',
    description:
      'Shown in a cell of the translation table when its translation is emptied but is the only translation the text has, which cannot be removed. language is the language of the cell.',
  },
  onlyTranslationKept: {
    id: 'architect.localization.translationTable.onlyTranslationKept',
    defaultMessage:
      'The {language} translation was kept, because this text exists only in {language}.',
    description:
      'Screen-reader announcement after an emptied translation is restored, because it is the only translation the text has. language is the language of the translation.',
  },
  saveFailed: {
    id: 'architect.localization.translationTable.saveFailed',
    defaultMessage:
      'This translation could not be saved, because the text or its language has been removed from the protocol.',
    description:
      'Screen-reader announcement when a translation typed into the translation table cannot be saved.',
  },
  editorTitle: {
    id: 'architect.localization.translationTable.editorTitle',
    defaultMessage: '{language} translation',
    description:
      'Heading of the editor that opens over a cell of the translation table for rich text. language is the language being written.',
  },
});

/** What became of a translation written in a cell. */
export type CommitResult =
  | 'saved'
  | 'unchanged'
  | 'only-translation'
  | 'failed';

export type TranslationCellProps = {
  value: LocalizedString;
  format: LocalizedStringFormat;
  /** True where no translation has a line break, so Enter saves. */
  singleLine: boolean;
  locale: LocaleTag;
  localization: ProtocolLocalization;
  /** The row's name, as the editor's heading repeats it. */
  rowName: string;
  /** The row header and column header that name the cell. */
  labelledBy: string;
  rowIndex: number;
  colIndex: number;
  onCommit: (text: string) => CommitResult;
  /** Moves focus to the cell `delta` rows away; false where there is none. */
  onMove: (delta: number) => boolean;
};

const CELL_CLASSES =
  'border-outline relative border-e border-b p-0 align-top focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-primary';

// The text, the stand-in that shows through an empty cell, and the sizer that
// grows the cell share one padding and wrapping, so each lines up over the
// others.
const CELL_TEXT_CLASSES = 'px-3 py-2 wrap-break-word';
const PLAIN_TEXT_CLASSES = cx(CELL_TEXT_CLASSES, 'whitespace-pre-wrap');

/** Every declared language the text has a translation in. */
const translatedLocales = (
  value: LocalizedString,
  localization: ProtocolLocalization,
) => localization.locales.filter((locale) => Object.hasOwn(value, locale));

const isOnlyTranslation = (
  value: LocalizedString,
  locale: LocaleTag,
  localization: ProtocolLocalization,
) => {
  const translated = translatedLocales(value, localization);
  return translated.length === 1 && translated[0] === locale;
};

const headingAsParagraph = ({ children }: { children?: ReactNode }) => (
  <p className="mb-2 font-semibold last:mb-0">{children}</p>
);

// Headings would add to the page's outline from inside a table cell, and a
// link would add a stop to the Tab order between cells, so a cell draws
// headings as bold lines and links as their text.
const CELL_MARKDOWN_ELEMENTS = [
  'p',
  'br',
  'em',
  'strong',
  'ul',
  'ol',
  'li',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
];

const cellMarkdownComponents = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  h1: headingAsParagraph,
  h2: headingAsParagraph,
  h3: headingAsParagraph,
  h4: headingAsParagraph,
  h5: headingAsParagraph,
  h6: headingAsParagraph,
};

const CellMarkdown = ({ children }: { children: string }) => (
  <RenderMarkdown
    allowedElements={CELL_MARKDOWN_ELEMENTS}
    components={cellMarkdownComponents}
    unwrapDisallowed
  >
    {children}
  </RenderMarkdown>
);

/**
 * The translation participants reading in `locale` see where the text has none
 * of its own, or null where it has no translation at all. Only a related
 * language is certain: Architect cannot know which other languages a browser
 * lists, and that only matters when the text has more than one translation to
 * choose from.
 */
export const fallbackFor = (
  value: LocalizedString | undefined,
  locale: LocaleTag,
  localization: ProtocolLocalization,
) => {
  if (value === undefined) return null;
  const translated = translatedLocales(value, localization);
  if (translated.length === 0) return null;
  const shown = resolveTranslation(value, localization, locale);
  return shown.lang === undefined
    ? null
    : {
        text: shown.text,
        lang: shown.lang,
        dir: shown.dir,
        unlessBrowserLists:
          shown.matchedBy !== 'selected' && translated.length > 1,
      };
};

/**
 * What participants reading in `locale` see while the cell is empty: the text
 * the interview falls back to, muted, tagged with its language.
 */
const Fallback = ({
  id,
  value,
  format,
  locale,
  localization,
}: {
  id: string;
  value: LocalizedString | undefined;
  format: LocalizedStringFormat;
  locale: LocaleTag;
  localization: ProtocolLocalization;
}) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const shown = fallbackFor(value, locale, localization);

  if (shown === null) {
    return (
      <p
        id={id}
        lang={intl.locale}
        className={cx(
          CELL_TEXT_CLASSES,
          'pointer-events-none col-start-1 row-start-1 text-current/60 italic',
        )}
      >
        {intl.formatMessage(messages.noTranslation)}
      </p>
    );
  }

  const { unlessBrowserLists } = shown;
  const language = languageName(shown.lang);

  return (
    <div
      id={id}
      className={cx(
        format === 'markdown' ? CELL_TEXT_CLASSES : PLAIN_TEXT_CLASSES,
        'pointer-events-none col-start-1 row-start-1 flex flex-col items-start gap-1.5',
      )}
    >
      <div lang={shown.lang} dir={shown.dir} className="w-full text-current/65">
        {format === 'markdown' ? (
          <CellMarkdown>{shown.text}</CellMarkdown>
        ) : (
          shown.text
        )}
      </div>
      <span
        lang={intl.locale}
        dir="auto"
        aria-hidden
        className="border-outline rounded-full border px-2 text-xs leading-5 whitespace-nowrap text-current/75"
      >
        {intl.formatMessage(
          unlessBrowserLists
            ? messages.shownInUnlessBrowserLists
            : messages.shownIn,
          { language },
        )}
      </span>
      <span lang={intl.locale} className="sr-only">
        {intl.formatMessage(
          unlessBrowserLists
            ? messages.notTranslatedUnlessBrowserLists
            : messages.notTranslated,
          { language },
        )}
      </span>
    </div>
  );
};

const OnlyTranslationNote = ({
  id,
  locale,
}: {
  id: string;
  locale: LocaleTag;
}) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  return (
    <p
      id={id}
      role="status"
      lang={intl.locale}
      dir="auto"
      className="text-destructive-ink px-3 pb-2 text-sm"
    >
      {intl.formatMessage(messages.onlyTranslation, {
        language: languageName(locale),
      })}
    </p>
  );
};

const useCommitFeedback = (locale: LocaleTag) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const { announce } = useAccessibilityAnnouncements();
  return (result: CommitResult) => {
    if (result === 'only-translation') {
      const language = languageName(locale);
      announce(intl.formatMessage(messages.onlyTranslationKept, { language }));
    } else if (result === 'failed') {
      announce(intl.formatMessage(messages.saveFailed));
    }
  };
};

const isCaretAt = (element: HTMLTextAreaElement, edge: 'start' | 'end') => {
  const { selectionStart, selectionEnd, value } = element;
  if (selectionStart !== selectionEnd) return false;
  return edge === 'start'
    ? selectionStart === 0
    : selectionEnd === value.length;
};

/**
 * Plain text, edited where it is shown. A change is saved when the cell loses
 * focus, or on Enter when the text is a single line; Escape puts back what was
 * saved.
 */
const PlainTextCell = ({
  value,
  format,
  singleLine,
  locale,
  localization,
  labelledBy,
  rowIndex,
  colIndex,
  onCommit,
  onMove,
}: TranslationCellProps) => {
  const fallbackId = useId();
  const noteId = useId();
  const feedback = useCommitFeedback(locale);
  const [draft, setDraft] = useState<string | null>(null);
  const stored = translationText(value, locale);
  const text = draft ?? stored;
  const empty = text.trim() === '';
  const refusing = empty && isOnlyTranslation(value, locale, localization);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    feedback(onCommit(draft));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && draft !== null) {
      event.preventDefault();
      setDraft(null);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
      const modifier = event.metaKey || event.ctrlKey;
      if (!singleLine && !modifier) return;
      event.preventDefault();
      // Leaving the cell saves it; the last row has nowhere to go.
      if (!onMove(1)) commit();
      return;
    }
    if (
      (event.key === 'ArrowUp' && isCaretAt(event.currentTarget, 'start')) ||
      (event.key === 'ArrowDown' && isCaretAt(event.currentTarget, 'end'))
    ) {
      if (onMove(event.key === 'ArrowUp' ? -1 : 1)) event.preventDefault();
    }
  };

  // A trailing line break only takes up room once something follows it.
  const sizerText = text.concat(' ');
  const describedBy = [
    empty && !refusing ? fallbackId : undefined,
    refusing ? noteId : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <td lang={locale} dir={localeDirection(locale)} className={CELL_CLASSES}>
      <div className="grid">
        <div
          aria-hidden
          className={cx(
            PLAIN_TEXT_CLASSES,
            'invisible col-start-1 row-start-1',
          )}
        >
          {sizerText}
        </div>
        {empty && !refusing && (
          <Fallback
            id={fallbackId}
            value={
              draft === null ? value : withTranslation(value, locale, draft)
            }
            format={format}
            locale={locale}
            localization={localization}
          />
        )}
        <textarea
          rows={1}
          value={text}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy || undefined}
          data-row={rowIndex}
          data-col={colIndex}
          className={cx(
            PLAIN_TEXT_CLASSES,
            'col-start-1 row-start-1 block size-full resize-none overflow-hidden bg-transparent outline-none',
            'scroll-ms-(--translation-table-names) scroll-mt-(--translation-table-sticky-top)',
          )}
        />
      </div>
      {refusing && <OnlyTranslationNote id={noteId} locale={locale} />}
    </td>
  );
};

/**
 * Rich text, shown as participants see it and edited in a popover anchored to
 * the cell, with the same editor the stage editor uses. Leaving the popover
 * saves; Escape or Cancel puts back what was saved.
 */
const MarkdownCell = ({
  value,
  format,
  singleLine,
  locale,
  localization,
  rowName,
  labelledBy,
  rowIndex,
  colIndex,
  onCommit,
  onMove,
}: TranslationCellProps) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const contentId = useId();
  const editorId = useId();
  const titleId = useId();
  const noteId = useId();
  const feedback = useCommitFeedback(locale);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const stored = translationText(value, locale);
  const text = draft ?? stored;
  const refusing =
    text.trim() === '' && isOnlyTranslation(value, locale, localization);
  const dir = localeDirection(locale);

  const close = (save: boolean) => {
    setEditing(false);
    setDraft(null);
    if (save && draft !== null) feedback(onCommit(draft));
  };

  // Save leaves a refused edit open beside the note that explains it, which
  // was announced as it appeared; leaving any other way puts the text back.
  const save = () => {
    if (draft !== null && refusing) return;
    close(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (onMove(event.key === 'ArrowUp' ? -1 : 1)) event.preventDefault();
    }
  };

  return (
    <td ref={cellRef} lang={locale} dir={dir} className={CELL_CLASSES}>
      <div className="grid">
        {stored.trim() === '' ? (
          <Fallback
            id={contentId}
            value={value}
            format={format}
            locale={locale}
            localization={localization}
          />
        ) : (
          <div
            id={contentId}
            className={cx(CELL_TEXT_CLASSES, 'col-start-1 row-start-1')}
          >
            <CellMarkdown>{stored}</CellMarkdown>
          </div>
        )}
      </div>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={editing}
        aria-labelledby={labelledBy}
        aria-describedby={contentId}
        data-row={rowIndex}
        data-col={colIndex}
        onClick={() => setEditing(true)}
        onKeyDown={handleKeyDown}
        className="absolute inset-0 cursor-text scroll-ms-(--translation-table-names) scroll-mt-(--translation-table-sticky-top) outline-none"
      />
      <Popover
        open={editing}
        onOpenChange={(open, details) => {
          if (!open) close(details.reason !== 'escape-key');
        }}
      >
        <PopoverContent
          anchor={cellRef}
          side="bottom"
          align="start"
          sideOffset={4}
          showArrow={false}
          aria-labelledby={titleId}
          finalFocus={buttonRef}
          className="w-[min(40rem,calc(100vw-2rem))]"
        >
          <div className="flex flex-col gap-3">
            <p id={titleId} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">
                {intl.formatMessage(messages.editorTitle, {
                  language: languageName(locale),
                })}
              </span>
              <span
                dir="ltr"
                className="font-monospace text-sm break-all text-current/70"
              >
                {rowName}
              </span>
            </p>
            <div lang={locale} dir={dir}>
              <RichTextField
                id={editorId}
                name={editorId}
                aria-labelledby={titleId}
                aria-describedby={refusing ? noteId : ''}
                value={text}
                onChange={(markdown) => setDraft(markdown ?? '')}
                singleLine={singleLine}
                autoFocus
              />
            </div>
            {refusing && <OnlyTranslationNote id={noteId} locale={locale} />}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="text" onClick={() => close(false)}>
                {intl.formatMessage(commonMessages.cancel)}
              </Button>
              <Button size="sm" color="primary" onClick={save}>
                {intl.formatMessage(commonMessages.save)}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </td>
  );
};

/** One translation of one text: a cell of the translation table. */
const TranslationCell = (props: TranslationCellProps) =>
  props.format === 'markdown' ? (
    <MarkdownCell {...props} />
  ) : (
    <PlainTextCell {...props} />
  );

export default TranslationCell;
