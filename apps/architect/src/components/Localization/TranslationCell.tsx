import {
  createContext,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import {
  LocalizedMessageVersions,
  useLocalizedMessageProblem,
  LocalizedMessageVersionsSummary,
} from '@codaco/protocol-builder/fields/LocalizedMessageField';
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
  MessageArguments,
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
  messageRefused: {
    id: 'architect.localization.translationTable.messageRefused',
    defaultMessage: 'Your change was not saved. {reason}',
    description:
      'Screen-reader announcement after leaving a translation table cell whose text, written in several versions, could not be saved. reason is the sentence saying what is wrong, such as that some versions are empty.',
  },
  saveFailed: {
    id: 'architect.localization.translationTable.saveFailed',
    defaultMessage:
      'This translation could not be saved, because the text or its language has been removed from the protocol.',
    description:
      'Screen-reader announcement when a translation typed into the translation table cannot be saved.',
  },
});

/** What became of a translation written in a cell. */
export type CommitResult =
  | 'saved'
  | 'unchanged'
  | 'only-translation'
  /** A message whose versions break its setting's rule; nothing saved. */
  | 'refused'
  | 'failed';

export type TranslationCellProps = {
  value: LocalizedString;
  format: LocalizedStringFormat;
  /** True where no translation has a line break, so Enter saves. */
  singleLine: boolean;
  locale: LocaleTag;
  localization: ProtocolLocalization;
  /** The row header and column header that name the cell. */
  labelledBy: string;
  rowIndex: number;
  colIndex: number;
  /** What the text may use, when it is a localized message. */
  messageArguments?: MessageArguments;
  onCommit: (text: string) => CommitResult;
  /** Saves a localized message's translation as written. */
  onCommitMessage: (message: string | undefined) => CommitResult;
  /** Moves focus to the cell `delta` rows away; false where there is none. */
  onMove: (delta: number) => boolean;
};

// A cell pointed at gets a thin frame and a cell being edited a thick one, so
// the two read apart without relying on colour.
const CELL_CLASSES = cx(
  'border-outline relative border-e border-b p-0 align-top',
  'hover:not-focus-within:bg-current/3 hover:not-focus-within:outline-1 hover:not-focus-within:-outline-offset-1 hover:not-focus-within:outline-current/30',
  'focus-within:bg-input focus-within:text-input-contrast focus-within:outline-primary focus-within:outline-2 focus-within:-outline-offset-2',
);

// A cell whose emptied text is refused is framed as an error, beside the
// note that says why.
const REFUSING_CELL_CLASSES = 'focus-within:outline-destructive';

/**
 * Marks a change not yet saved. Leaving the cell saves it, and the mark goes.
 */
const UnsavedMark = () => (
  <span
    aria-hidden
    className="bg-primary pointer-events-none absolute inset-e-1.5 bottom-1.5 size-1.5 rounded-full"
  />
);

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
  messageArguments,
}: {
  id: string;
  value: LocalizedString | undefined;
  format: LocalizedStringFormat;
  locale: LocaleTag;
  localization: ProtocolLocalization;
  messageArguments?: MessageArguments;
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

  // The tag lines up with the text it names the language of, not with the
  // column's language when the two are written in different directions.
  return (
    <div
      id={id}
      dir={shown.dir}
      className={cx(
        format === 'markdown' ? CELL_TEXT_CLASSES : PLAIN_TEXT_CLASSES,
        'pointer-events-none col-start-1 row-start-1 flex flex-col items-start gap-1',
      )}
    >
      <div lang={shown.lang} className="w-full text-current/60">
        {messageArguments !== undefined ? (
          <LocalizedMessageVersionsSummary
            message={shown.text}
            declaration={messageArguments}
            locale={shown.lang}
          />
        ) : format === 'markdown' ? (
          <CellMarkdown>{shown.text}</CellMarkdown>
        ) : (
          shown.text
        )}
      </div>
      <span
        lang={intl.locale}
        dir="auto"
        aria-hidden
        className="max-w-full rounded-sm bg-current/8 px-1.5 text-xs leading-5 text-current/80"
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

/** Why the cell will not save what it holds, in Architect's language. */
const RefusalNote = ({ id, children }: { id: string; children: string }) => {
  const intl = useAppIntl();
  return (
    <p
      id={id}
      role="status"
      lang={intl.locale}
      dir="auto"
      className="text-destructive-ink px-3 pb-2 text-sm"
    >
      {children}
    </p>
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
    <RefusalNote id={id}>
      {intl.formatMessage(messages.onlyTranslation, {
        language: languageName(locale),
      })}
    </RefusalNote>
  );
};

const AnnounceContext = createContext<((message: string) => void) | null>(null);

/**
 * The table's one live region, which says what became of a change. It outlives
 * each cell, so a cell taken away mid-edit (its row filtered out, its column
 * hidden) can still say that its change was not saved.
 */
export const CommitAnnouncer = ({ children }: { children: ReactNode }) => {
  const { announce } = useAccessibilityAnnouncements();
  return (
    <AnnounceContext.Provider value={announce}>
      {children}
    </AnnounceContext.Provider>
  );
};

const useCommitFeedback = (locale: LocaleTag) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const announce = useContext(AnnounceContext);
  if (announce === null) {
    throw new Error('A translation cell needs a CommitAnnouncer above it.');
  }
  return (result: CommitResult, reason?: string) => {
    if (result === 'refused') {
      announce(intl.formatMessage(messages.messageRefused, { reason }));
    } else if (result === 'only-translation') {
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
  // Read as the cell unmounts, after the render that last changed it.
  const draftRef = useRef<string | null>(null);
  const onCommitRef = useRef(onCommit);
  const feedbackRef = useRef(feedback);
  const [draft, setDraft] = useState<string | null>(null);
  const stored = translationText(value, locale);
  const text = draft ?? stored;
  const empty = text.trim() === '';
  const refusing = empty && isOnlyTranslation(value, locale, localization);

  const changeDraft = (next: string | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const commit = () => {
    if (draft === null) return;
    changeDraft(null);
    feedback(onCommit(draft));
  };

  useEffect(() => {
    onCommitRef.current = onCommit;
    feedbackRef.current = feedback;
  });

  // A cell taken away mid-edit, as when the table is closed by going back,
  // still saves what was typed in it, and says so if it cannot.
  useEffect(
    () => () => {
      const pending = draftRef.current;
      if (pending !== null) feedbackRef.current(onCommitRef.current(pending));
    },
    [],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Escape undoes the change first; only a cell with nothing to undo lets
    // it go on to close what holds the table.
    if (event.key === 'Escape' && draft !== null) {
      event.preventDefault();
      event.stopPropagation();
      changeDraft(null);
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
    <td
      lang={locale}
      dir={localeDirection(locale)}
      className={cx(CELL_CLASSES, refusing && REFUSING_CELL_CLASSES)}
    >
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
          onChange={(event) => changeDraft(event.target.value)}
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
      {draft !== null && <UnsavedMark />}
    </td>
  );
};

/**
 * Whether the caret in a contenteditable is at the very start or end of its
 * text, where the up and down arrow keys have no line left to move to.
 */
const isEditableCaretAt = (editable: HTMLElement, edge: 'start' | 'end') => {
  const selection = editable.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return false;
  }
  const caret = selection.getRangeAt(0);
  const before = editable.ownerDocument.createRange();
  before.selectNodeContents(editable);
  if (edge === 'start') before.setEnd(caret.startContainer, caret.startOffset);
  else before.setStart(caret.endContainer, caret.endOffset);
  return before.toString() === '';
};

// The stage editor's rich-text field, fitted to a cell: no frame of its own,
// its text where the cell shows text, with headings drawn as the cell draws
// them when it is not being edited. Its toolbar wraps inside the cell's frame,
// and stays in view below the sticky headings while a long text scrolls under
// it, which it can only do while the editor's frame does not clip it.
const CELL_EDITOR_CLASSES = cx(
  'min-w-0 overflow-visible rounded-none border-0 bg-transparent text-current',
  '[&>:first-child]:min-h-0 [&>:first-child]:px-3 [&>:first-child]:py-2',
  '[&_.tiptap.ProseMirror]:min-h-0',
  '[&_.tiptap_:is(h1,h2,h3,h4)]:mt-0 [&_.tiptap_:is(h1,h2,h3,h4)]:mb-2 [&_.tiptap_:is(h1,h2,h3,h4)]:font-[inherit] [&_.tiptap_:is(h1,h2,h3,h4)]:text-base [&_.tiptap_:is(h1,h2,h3,h4)]:font-semibold',
  '[&_[role=toolbar]]:sticky [&_[role=toolbar]]:top-(--translation-table-sticky-top) [&_[role=toolbar]]:z-1 [&_[role=toolbar]]:mx-0.5 [&_[role=toolbar]]:mt-0.5 [&_[role=toolbar]]:w-auto [&_[role=toolbar]]:min-w-0 [&_[role=toolbar]]:flex-wrap [&_[role=toolbar]]:gap-0.5 [&_[role=toolbar]]:px-1 [&_[role=toolbar]]:py-1',
  '[&_[role=toolbar]_[role=separator]]:mx-1',
);

const EDITABLE_SELECTOR = '[contenteditable="true"]';

const focusEditorIn = (cell: HTMLElement | null) =>
  cell
    ?.querySelector<HTMLElement>(EDITABLE_SELECTOR)
    ?.focus({ preventScroll: true });

/**
 * Rich text, shown as participants see it until the cell has focus, then
 * edited in the cell with the same editor the stage editor uses. Leaving the
 * cell saves; Escape puts back what was saved.
 */
const RichTextCell = ({
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
  const contentId = useId();
  const editorId = useId();
  const noteId = useId();
  const feedback = useCommitFeedback(locale);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const leaveTimer = useRef<number | null>(null);
  // Read when focus has left, a moment after the render that scheduled it.
  const draftRef = useRef<string | null>(null);
  const onCommitRef = useRef(onCommit);
  const feedbackRef = useRef(feedback);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  // The editor takes no new value while it has focus, so putting back what
  // was saved replaces it with a fresh one.
  const [revision, setRevision] = useState(0);
  const stored = translationText(value, locale);
  const text = draft ?? stored;
  const empty = text.trim() === '';
  const refusing = empty && isOnlyTranslation(value, locale, localization);

  const changeDraft = (next: string | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const commit = () => {
    const pending = draftRef.current;
    if (pending === null) return;
    changeDraft(null);
    feedback(onCommit(pending));
  };

  const leave = () => {
    setEditing(false);
    commit();
  };

  // The cell holds focus while the editor replaces what had it, so focus is
  // never left nowhere in between.
  const holdFocus = () => cellRef.current?.focus({ preventScroll: true });

  const revert = () => {
    holdFocus();
    changeDraft(null);
    setRevision((current) => current + 1);
  };

  useEffect(() => {
    onCommitRef.current = onCommit;
    feedbackRef.current = feedback;
  });

  // A cell taken away mid-edit, by leaving the page, still saves what was
  // typed in it, and says so if it cannot.
  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
      const pending = draftRef.current;
      if (pending !== null) feedbackRef.current(onCommitRef.current(pending));
    },
    [],
  );

  const handleFocus = (event: FocusEvent<HTMLTableCellElement>) => {
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    if (!editing) {
      holdFocus();
      setEditing(true);
    } else if (event.target === cellRef.current) {
      focusEditorIn(cellRef.current);
    }
  };

  // Focus that moves into the editor's link form has left the cell's
  // elements but not the cell: the form is in a portal, and its focus event
  // reaches the cell through React before this check runs.
  const handleBlur = (event: FocusEvent<HTMLTableCellElement>) => {
    if (!editing) return;
    const next = event.relatedTarget;
    if (next instanceof Node && cellRef.current?.contains(next)) return;
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      // The window itself lost focus, as when switching to another app; focus
      // comes back here with it.
      if (!document.hasFocus()) return;
      if (cellRef.current?.contains(document.activeElement)) return;
      leave();
    }, 0);
  };

  // Caught before the editor sees them, and only from its text: the toolbar
  // and the link form keep their own keys.
  const handleKeyDownCapture = (event: KeyboardEvent<HTMLTableCellElement>) => {
    const editable = event.target;
    if (
      !(editable instanceof HTMLElement) ||
      !editable.matches(EDITABLE_SELECTOR)
    ) {
      return;
    }
    if (event.key === 'Escape') {
      if (draftRef.current === null) return;
      event.preventDefault();
      event.stopPropagation();
      revert();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
      const modifier = event.metaKey || event.ctrlKey;
      if (!singleLine && !modifier) return;
      event.preventDefault();
      event.stopPropagation();
      // Leaving the cell saves it; the last row has nowhere to go.
      if (!onMove(1)) {
        holdFocus();
        commit();
        setRevision((current) => current + 1);
      }
      return;
    }
    if (
      (event.key === 'ArrowUp' && isEditableCaretAt(editable, 'start')) ||
      (event.key === 'ArrowDown' && isEditableCaretAt(editable, 'end'))
    ) {
      if (onMove(event.key === 'ArrowUp' ? -1 : 1)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  const fallbackDescribed = empty && !refusing;

  return (
    <td
      ref={cellRef}
      tabIndex={-1}
      lang={locale}
      dir={localeDirection(locale)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDownCapture={editing ? handleKeyDownCapture : undefined}
      className={cx(CELL_CLASSES, refusing && REFUSING_CELL_CLASSES)}
    >
      {editing ? (
        <>
          {fallbackDescribed && (
            <div className="sr-only">
              <Fallback
                id={contentId}
                value={value}
                format={format}
                locale={locale}
                localization={localization}
              />
            </div>
          )}
          <RichTextField
            key={revision}
            id={editorId}
            name={editorId}
            aria-labelledby={labelledBy}
            aria-describedby={
              refusing ? noteId : fallbackDescribed ? contentId : ''
            }
            value={text}
            onChange={(markdown) => changeDraft(markdown ?? '')}
            singleLine={singleLine}
            className={CELL_EDITOR_CLASSES}
            autoFocus
          />
          {refusing && <OnlyTranslationNote id={noteId} locale={locale} />}
          {draft !== null && <UnsavedMark />}
        </>
      ) : (
        <>
          <div className="grid">
            {empty ? (
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
          {/* Focus, by any means, turns the cell into its editor. */}
          <button
            type="button"
            aria-labelledby={labelledBy}
            aria-describedby={contentId}
            data-row={rowIndex}
            data-col={colIndex}
            className="absolute inset-0 cursor-text scroll-ms-(--translation-table-names) scroll-mt-(--translation-table-sticky-top) outline-none"
          />
        </>
      )}
    </td>
  );
};

/**
 * A localized message: its versions, read-only until the cell has focus,
 * then edited in the cell as the stage editor edits them, one line per
 * version. Leaving the cell saves; Escape puts back what was saved; Enter
 * moves to the cell below.
 */
const MessageCell = ({
  value,
  locale,
  localization,
  labelledBy,
  rowIndex,
  colIndex,
  messageArguments,
  onCommitMessage,
  onMove,
}: TranslationCellProps & { messageArguments: MessageArguments }) => {
  const contentId = useId();
  const editorId = useId();
  const noteId = useId();
  const feedback = useCommitFeedback(locale);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const leaveTimer = useRef<number | null>(null);
  // Boxed, because a draft of `undefined` (every version emptied) is a
  // change too.
  const draftRef = useRef<{ message: string | undefined } | null>(null);
  const onCommitRef = useRef(onCommitMessage);
  const feedbackRef = useRef(feedback);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ message: string | undefined } | null>(
    null,
  );
  const [revision, setRevision] = useState(0);
  const stored = value[locale] ?? '';
  const message = draft === null ? stored : (draft.message ?? '');
  const empty = message === '';
  const onlyTranslation =
    empty && isOnlyTranslation(value, locale, localization);
  // Some versions written and others empty: the table refuses to save it
  // (see `localizedMessageProblem`), and says so while the cell is open.
  const problem = useLocalizedMessageProblem(
    draft === null || empty ? undefined : message,
    messageArguments,
    locale,
  );
  const problemRef = useRef(problem);
  const refusing = onlyTranslation || problem !== undefined;

  const changeDraft = (next: { message: string | undefined } | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const commit = () => {
    const pending = draftRef.current;
    if (pending === null) return;
    changeDraft(null);
    feedback(onCommitMessage(pending.message), problemRef.current);
  };

  const holdFocus = () => cellRef.current?.focus({ preventScroll: true });

  useEffect(() => {
    onCommitRef.current = onCommitMessage;
    feedbackRef.current = feedback;
    problemRef.current = problem;
  });

  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
      const pending = draftRef.current;
      if (pending === null) return;
      feedbackRef.current(
        onCommitRef.current(pending.message),
        problemRef.current,
      );
    },
    [],
  );

  const handleFocus = (event: FocusEvent<HTMLTableCellElement>) => {
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    if (!editing) {
      holdFocus();
      setEditing(true);
    } else if (event.target === cellRef.current) {
      focusEditorIn(cellRef.current);
    }
  };

  const handleBlur = (event: FocusEvent<HTMLTableCellElement>) => {
    if (!editing) return;
    const next = event.relatedTarget;
    if (next instanceof Node && cellRef.current?.contains(next)) return;
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      if (!document.hasFocus()) return;
      if (cellRef.current?.contains(document.activeElement)) return;
      setEditing(false);
      commit();
    }, 0);
  };

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLTableCellElement>) => {
    const editable = event.target;
    if (
      !(editable instanceof HTMLElement) ||
      !editable.matches(EDITABLE_SELECTOR)
    ) {
      return;
    }
    if (event.key === 'Escape') {
      if (draftRef.current === null) return;
      event.preventDefault();
      event.stopPropagation();
      holdFocus();
      changeDraft(null);
      setRevision((current) => current + 1);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!onMove(1)) {
        holdFocus();
        commit();
        setRevision((current) => current + 1);
      }
    }
  };

  const fallbackDescribed = empty && !refusing;

  return (
    <td
      ref={cellRef}
      tabIndex={-1}
      lang={locale}
      dir={localeDirection(locale)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDownCapture={editing ? handleKeyDownCapture : undefined}
      className={cx(CELL_CLASSES, refusing && REFUSING_CELL_CLASSES)}
    >
      {editing ? (
        <div className={cx(CELL_TEXT_CLASSES, 'min-w-64')}>
          {fallbackDescribed && (
            <div className="sr-only">
              <Fallback
                id={contentId}
                value={value}
                format="plain"
                locale={locale}
                localization={localization}
                messageArguments={messageArguments}
              />
            </div>
          )}
          <LocalizedMessageVersions
            key={revision}
            id={editorId}
            name={editorId}
            message={message}
            onMessageChange={(next) => changeDraft({ message: next })}
            declaration={messageArguments}
            locale={locale}
            ariaLabelledBy={labelledBy}
            ariaDescribedBy={
              refusing ? noteId : fallbackDescribed ? contentId : ''
            }
            autoFocus
          />
          {onlyTranslation && (
            <OnlyTranslationNote id={noteId} locale={locale} />
          )}
          {problem !== undefined && (
            <RefusalNote id={noteId}>{problem}</RefusalNote>
          )}
          {draft !== null && <UnsavedMark />}
        </div>
      ) : (
        <>
          <div className="grid">
            {empty ? (
              <Fallback
                id={contentId}
                value={value}
                format="plain"
                locale={locale}
                localization={localization}
                messageArguments={messageArguments}
              />
            ) : (
              <div
                id={contentId}
                className={cx(CELL_TEXT_CLASSES, 'col-start-1 row-start-1')}
              >
                <LocalizedMessageVersionsSummary
                  message={stored}
                  declaration={messageArguments}
                  locale={locale}
                />
              </div>
            )}
          </div>
          {/* Focus, by any means, turns the cell into its editor. */}
          <button
            type="button"
            aria-labelledby={labelledBy}
            aria-describedby={contentId}
            data-row={rowIndex}
            data-col={colIndex}
            className="absolute inset-0 cursor-text scroll-ms-(--translation-table-names) scroll-mt-(--translation-table-sticky-top) outline-none"
          />
        </>
      )}
    </td>
  );
};

/** One translation of one text: a cell of the translation table. */
const TranslationCell = (props: TranslationCellProps) => {
  if (props.messageArguments !== undefined) {
    return <MessageCell {...props} messageArguments={props.messageArguments} />;
  }
  return props.format === 'markdown' ? (
    <RichTextCell {...props} />
  ) : (
    <PlainTextCell {...props} />
  );
};

export default TranslationCell;
