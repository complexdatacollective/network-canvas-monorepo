import {
  type FocusEvent,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  hasVersionRowBeside,
  type RichTextAssetBlocks,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { useFormFieldScope } from '@codaco/fresco-ui/form/store/formStoreProvider';
import {
  markdownElementsFor,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import {
  AssetBlockLine,
  createAssetBlockImages,
} from '@codaco/protocol-builder/fields/assetBlocks/assetBlockImages';
import { createAssetBlockView } from '@codaco/protocol-builder/fields/assetBlocks/AssetBlockView';
import { DynamicMessageEditor } from '@codaco/protocol-builder/fields/dynamicText/DynamicMessageEditor';
import {
  type BlockMarkdown,
  DynamicMessageSummary,
} from '@codaco/protocol-builder/fields/dynamicText/DynamicMessageSummary';
import type { DynamicMessageSite } from '@codaco/protocol-builder/fields/dynamicText/messageSite';
import {
  LocalizedMessageVersions,
  LocalizedMessageVersionsSummary,
} from '@codaco/protocol-builder/fields/LocalizedMessageField';
import RichTextField from '@codaco/protocol-builder/fields/RichTextField';
import {
  localeDirection,
  type ProtocolLocalization,
  resolveTranslation,
} from '@codaco/protocol-builder/localization/localizedText';
import { ProtocolLocalizationProvider } from '@codaco/protocol-builder/localization/ProtocolLocalization';
import { textFieldPropsFor } from '@codaco/protocol-builder/localization/textShape';
import { FormDocumentEditor } from '@codaco/protocol-builder/sections/form-document/FormDocumentEditor';
import {
  type FormFieldDraft,
  formFieldDraftsOf,
} from '@codaco/protocol-builder/sections/form-document/formDocumentValue';
import {
  assetBlockFile,
  ownerOfTextPath,
  type DynamicValueSite,
  dynamicValueContextFor,
  nodeLabelValueContext,
  type LocaleTag,
  type LocalizedString,
  type LocalizedStringFormat,
  type MessageArguments,
} from '@codaco/protocol-validation';
import { isRecord, lineBreaksAsSpaces } from '@codaco/shared-consts';
import { LineInParagraph } from '~/components/LineInParagraph';
import { useAppSelector } from '~/ducks/hooks';
import type { TranslationRow } from '~/selectors/issues';
import { getDisplayAssetManifest, getProtocol } from '~/selectors/protocol';
import { cx } from '~/utils/cva';

import { useStablePath } from './cellNames';
import { formVariables } from './formTranslations';
import { isBlankTranslation, rowValueWithCell } from './rowText';
import {
  useDefinitionsInTable,
  useInTableAt,
  useTranslationDraft,
  useUsedInTable,
} from './translationDrafts';
import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  shownIn: {
    id: 'architect.localization.translationTable.shownIn',
    defaultMessage: 'Shown in {language}',
    description:
      'Tag in an empty cell of the translation table, under the wording participants see instead of the missing translation. language is the language of that wording.',
  },
  shownInUnlessBrowserLists: {
    id: 'architect.localization.translationTable.shownInUnlessBrowserLists',
    defaultMessage: 'Shown in {language}*',
    description:
      'Tag in an empty cell of the translation table, under the wording participants see instead of the missing translation, when they may see another language instead. The asterisk refers to a note below the table explaining that the participant’s browser can list a language that has a translation. language is the language of the wording shown.',
  },
  notTranslated: {
    id: 'architect.localization.translationTable.notTranslated',
    defaultMessage: 'Not translated yet. Participants see it in {language}.',
    description:
      'Screen-reader description of an empty cell of the translation table, when participants see a closely related language instead, such as Brazilian Portuguese for European Portuguese. language is that language.',
  },
  notTranslatedUnlessBrowserLists: {
    id: 'architect.localization.translationTable.notTranslatedUnlessBrowserLists',
    defaultMessage:
      'Not translated yet. Participants see it in {language}, unless their browser also lists a language that has a translation.',
    description:
      'Screen-reader description of an empty cell of the translation table. Participants see the wording in another language their web browser lists, when it has a translation in one, and otherwise in language: the protocol’s default language, or failing that another of its languages.',
  },
  formFieldTextsInRows: {
    id: 'architect.localization.translationTable.formFieldTextsInRows',
    defaultMessage:
      'The question and hint of each field are translated in their own rows.',
    description:
      'Shown below the text of a form in the translation table. The text of the form is translated in this cell, and the fields of the form are shown in it, but the question and hint of each field have their own rows in the table.',
  },
  notUsed: {
    id: 'architect.localization.translationTable.notUsed',
    defaultMessage: 'Not used in {language}',
    description:
      'Shown in a cell of the translation table in place of a translation, when the localized string is not used in that language: the question or hint of a field that the form in that language does not include, or the wording of a dynamic attribute that no text in that language shows. The cell cannot be edited. language is the name of the language.',
  },
  noTranslation: {
    id: 'architect.localization.translationTable.noTranslation',
    defaultMessage: 'Not translated into any language.',
    description:
      'Shown in an empty cell of the translation table when the localized string has no translation in any of the protocol’s languages.',
  },
});

export type TranslationCellProps = {
  /** The text, as the protocol has it. */
  row: TranslationRow;
  locale: LocaleTag;
  localization: ProtocolLocalization;
  /** The row header and column header that name the cell. */
  labelledBy: string;
  rowIndex: number;
  colIndex: number;
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

// A cell whose text cannot be saved is framed as an error, beside the note
// that says why.
const INVALID_CELL_CLASSES = 'focus-within:outline-destructive';

/**
 * Marks a change not yet saved into the protocol. Saving the table saves it,
 * and the mark goes.
 */
const UnsavedMark = () => (
  <span
    aria-hidden
    data-unsaved-mark=""
    className="bg-primary pointer-events-none absolute inset-e-1.5 bottom-1.5 size-1.5 rounded-full"
  />
);

// The text, the stand-in that shows through an empty cell, and the sizer that
// grows the cell share one padding and wrapping, so each lines up over the
// others. A word longer than the column breaks wherever it must: the cell is a
// grid item, which `break-word` would let widen past its column.
const CELL_TEXT_CLASSES = 'px-3 py-2 wrap-anywhere';
const PLAIN_TEXT_CLASSES = cx(CELL_TEXT_CLASSES, 'whitespace-pre-wrap');

/** Every declared language the text has a translation in. */
const translatedLocales = (
  value: LocalizedString,
  localization: ProtocolLocalization,
) => localization.locales.filter((locale) => Object.hasOwn(value, locale));

const headingAsParagraph = ({ children }: { children?: ReactNode }) => (
  <p className="mb-2 font-semibold last:mb-0">{children}</p>
);

// What a cell draws text with: what the interview draws it with, but for
// links. Headings would add to the page's outline from inside a table cell,
// and a link would add a stop to the Tab order between cells, so a cell
// draws headings as bold lines and links as their text.
const cellMarkdownElements = (singleLine: boolean) =>
  markdownElementsFor(singleLine).filter((element) => element !== 'a');

const CellParagraph = ({ children }: { children?: ReactNode }) => (
  <p className="mb-2 last:mb-0">{children}</p>
);

const cellMarkdownComponents = {
  p: CellParagraph,
  h1: headingAsParagraph,
  h2: headingAsParagraph,
  h3: headingAsParagraph,
  h4: headingAsParagraph,
  h5: headingAsParagraph,
  h6: headingAsParagraph,
};

/** The file a block names, as the protocol being translated holds it. */
const useProtocolAsset = (assetId: string) =>
  assetBlockFile(useAppSelector(getDisplayAssetManifest), assetId);

// A file a text holds as a block is one line in a cell that shows the text
// (see `createAssetBlockImages`), and the same line in a cell that edits it,
// with what changes how it shows below it while it is selected. The table
// has no way to add one: which files a page shows is the page's to decide,
// in its stage editor, and a translation says the same page in other words.
const CELL_BLOCK_IMAGES = createAssetBlockImages(useProtocolAsset);
const CELL_ASSET_BLOCKS: RichTextAssetBlocks = {
  View: createAssetBlockView({
    useAsset: useProtocolAsset,
    Preview: ({ kind, name }) => <AssetBlockLine kind={kind} name={name} />,
  }),
};

/** The same rules for text that shows values. */
const CELL_BLOCK_MARKDOWN: BlockMarkdown = {
  allowedElements: cellMarkdownElements(false),
  components: cellMarkdownComponents,
};
const CELL_ASSET_BLOCK_MARKDOWN: BlockMarkdown = {
  ...CELL_BLOCK_MARKDOWN,
  blockImages: CELL_BLOCK_IMAGES,
};

const CellMarkdown = ({
  children,
  assetBlocks,
  singleLine,
}: {
  children: string;
  /** Whether the text holds files as blocks, which a cell then names. */
  assetBlocks: boolean;
  /**
   * Whether the text is one line, which is drawn with only what the editor
   * offers for one line (bold and italics), as the interview draws it.
   */
  singleLine: boolean;
}) => (
  <LineInParagraph singleLine={singleLine} paragraph={CellParagraph}>
    <RenderMarkdown
      allowedElements={cellMarkdownElements(singleLine)}
      components={cellMarkdownComponents}
      blockImages={assetBlocks ? CELL_BLOCK_IMAGES : undefined}
      unwrapDisallowed
    >
      {children}
    </RenderMarkdown>
  </LineInParagraph>
);

/**
 * The translation participants reading in `locale` see where the text has none
 * of its own, or null where it has no translation at all. Only a related
 * language is certain: Architect cannot know which other languages a browser
 * lists, and that only matters when the text has more than one translation to
 * choose from. `own` when the text has a translation in `locale` itself,
 * which an empty cell's text has only where Network Canvas words it.
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
        own: Object.hasOwn(value, locale),
        unlessBrowserLists:
          shown.matchedBy !== 'selected' && translated.length > 1,
      };
};

/**
 * What participants reading in `locale` see while the cell is empty, muted:
 * Network Canvas's own wording in that language for a text it words, which
 * the cell goes back to when it is left empty, and otherwise the text the
 * interview falls back to, tagged with its language.
 */
type FallbackProps = {
  value: LocalizedString | undefined;
  format: LocalizedStringFormat;
  /** Whether the text holds files as blocks (see `CellMarkdown`). */
  assetBlocks?: boolean;
  /** Whether the text is one line (see `CellMarkdown`). */
  singleLine?: boolean;
  locale: LocaleTag;
  localization: ProtocolLocalization;
  messageArguments?: MessageArguments;
  /**
   * For text that shows values: where it sits, and whether its field holds
   * several lines (see `DynamicMessageSummary`).
   */
  dynamic?: Readonly<{
    site: DynamicMessageSite;
    singleLine: boolean;
    fieldSummary?: (fieldId: string) => ReactNode;
  }>;
};

const Fallback = ({
  id,
  value,
  format,
  locale,
  localization,
  messageArguments,
  dynamic,
  assetBlocks = false,
  singleLine = false,
}: FallbackProps & { id: string }) => {
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
        {dynamic !== undefined ? (
          <LineInParagraph
            singleLine={dynamic.singleLine}
            paragraph={CellParagraph}
          >
            <DynamicMessageSummary
              message={shown.text}
              markdown={format === 'markdown'}
              multiline={!dynamic.singleLine}
              locale={shown.lang}
              site={dynamic.site}
              blockMarkdown={
                assetBlocks ? CELL_ASSET_BLOCK_MARKDOWN : CELL_BLOCK_MARKDOWN
              }
              fieldSummary={dynamic.fieldSummary}
            />
          </LineInParagraph>
        ) : messageArguments !== undefined ? (
          <LocalizedMessageVersionsSummary
            message={shown.text}
            declaration={messageArguments}
            locale={shown.lang}
          />
        ) : format === 'markdown' ? (
          <CellMarkdown assetBlocks={assetBlocks} singleLine={singleLine}>
            {shown.text}
          </CellMarkdown>
        ) : (
          shown.text
        )}
      </div>
      {!shown.own && (
        <>
          <span
            lang={intl.locale}
            dir="auto"
            aria-hidden
            className="text-match-parent max-w-full rounded-sm bg-current/8 px-1.5 text-xs leading-5 text-current/80"
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
        </>
      )}
    </div>
  );
};

/** Why the cell's text cannot be saved, in Architect's language. */
const ProblemNote = ({ id, children }: { id: string; children: string }) => {
  const intl = useAppIntl();
  return (
    <output
      id={id}
      aria-live="polite"
      lang={intl.locale}
      dir="auto"
      className="text-destructive-ink text-match-parent block px-3 pb-2 text-sm"
    >
      {children}
    </output>
  );
};

const isCaretAt = (element: HTMLTextAreaElement, edge: 'start' | 'end') => {
  const { selectionStart, selectionEnd, value } = element;
  if (selectionStart !== selectionEnd) return false;
  return edge === 'start'
    ? selectionStart === 0
    : selectionEnd === value.length;
};

/**
 * Plain text, edited where it is shown. A change is kept in the table until
 * the table is saved, and checked once focus leaves the cell; Escape puts
 * back what the protocol has.
 */
const PlainTextCell = ({
  row,
  locale,
  localization,
  labelledBy,
  rowIndex,
  colIndex,
  onMove,
}: TranslationCellProps) => {
  const fallbackId = useId();
  const noteId = useId();
  const formScope = useFormFieldScope();
  // As the text's field declares it, so Enter in a one-line text moves on.
  const { singleLine } = textFieldPropsFor(row);
  const draft = useTranslationDraft({ row, locale });
  const { text, error } = draft;
  const empty = isBlankTranslation(row, text);
  const fallbackShown = empty && error === undefined;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && draft.changed) {
      event.preventDefault();
      event.stopPropagation();
      draft.revert();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
      const modifier = event.metaKey || event.ctrlKey;
      if (!singleLine && !modifier) return;
      event.preventDefault();
      // The last row has nowhere to go, so the cell is checked where it is.
      if (!onMove(1)) draft.leave();
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
    fallbackShown ? fallbackId : undefined,
    error === undefined ? undefined : noteId,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <td
      lang={locale}
      dir={localeDirection(locale)}
      // Typed in this column's language: nothing to guess.
      data-typed-language=""
      data-field-path={draft.name}
      data-field-form={formScope}
      className={cx(CELL_CLASSES, error !== undefined && INVALID_CELL_CLASSES)}
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
        {fallbackShown && (
          <Fallback
            id={fallbackId}
            value={rowValueWithCell(row, locale, text)}
            format={row.format}
            singleLine={singleLine}
            locale={locale}
            localization={localization}
          />
        )}
        <textarea
          rows={1}
          // The translation is in this column's language, whatever its first
          // letter: an Arabic sentence that opens with a product name is
          // still right to left.
          dir={localeDirection(locale)}
          value={text}
          // A one-line text holds no line break: one typed with Shift+Enter
          // or pasted becomes a space.
          onChange={(event) =>
            draft.change(
              singleLine
                ? lineBreaksAsSpaces(event.target.value)
                : event.target.value,
            )
          }
          onBlur={draft.leave}
          onKeyDown={handleKeyDown}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy || undefined}
          aria-invalid={error !== undefined}
          data-row={rowIndex}
          data-col={colIndex}
          className={cx(
            PLAIN_TEXT_CLASSES,
            'col-start-1 row-start-1 block size-full resize-none overflow-hidden bg-transparent outline-none',
            'scroll-ms-(--translation-table-names) scroll-mt-(--translation-table-sticky-top)',
          )}
        />
      </div>
      {error !== undefined && <ProblemNote id={noteId}>{error}</ProblemNote>}
      {draft.changed && <UnsavedMark />}
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
  '[&_.tiptap.ProseMirror]:min-h-0 [&>:first-child>.tiptap]:py-0',
  '[&_.tiptap_:is(h1,h2,h3,h4)]:mt-0 [&_.tiptap_:is(h1,h2,h3,h4)]:mb-2 [&_.tiptap_:is(h1,h2,h3,h4)]:font-[inherit] [&_.tiptap_:is(h1,h2,h3,h4)]:text-base [&_.tiptap_:is(h1,h2,h3,h4)]:font-semibold',
  '[&_[role=toolbar]]:sticky [&_[role=toolbar]]:top-(--translation-table-sticky-top) [&_[role=toolbar]]:z-1 [&_[role=toolbar]]:mx-0.5 [&_[role=toolbar]]:mt-0.5 [&_[role=toolbar]]:w-auto [&_[role=toolbar]]:min-w-0 [&_[role=toolbar]]:px-1 [&_[role=toolbar]]:py-1',
);

const EDITABLE_SELECTOR = '[contenteditable="true"]';

const focusEditorIn = (cell: HTMLElement | null) =>
  cell
    ?.querySelector<HTMLElement>(EDITABLE_SELECTOR)
    ?.focus({ preventScroll: true });

/**
 * A cell shown as participants see it until it has focus, then edited in
 * place: whether it is being edited, and what to do as focus comes and goes.
 * Leaving the cell checks its text; Escape puts back what the protocol has,
 * and Enter, where it moves on, moves to the cell below.
 */
const useEditedCell = ({
  draft,
  singleLine,
  onMove,
  isAtEdge,
}: {
  draft: ReturnType<typeof useTranslationDraft>;
  singleLine: boolean;
  onMove: (delta: number) => boolean;
  isAtEdge: (editable: HTMLElement, edge: 'start' | 'end') => boolean;
}) => {
  const cellRef = useRef<HTMLTableCellElement>(null);
  const leaveTimer = useRef<number | null>(null);
  const [editing, setEditing] = useState(false);
  // The editor takes no new value while it has focus, so putting back what
  // the protocol has replaces it with a fresh one.
  const [revision, setRevision] = useState(0);

  // The cell holds focus while the editor replaces what had it, so focus is
  // never left nowhere in between.
  const holdFocus = () => cellRef.current?.focus({ preventScroll: true });

  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  const onFocus = (event: FocusEvent<HTMLTableCellElement>) => {
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
  const onBlur = (event: FocusEvent<HTMLTableCellElement>) => {
    if (!editing) return;
    const next = event.relatedTarget;
    if (next instanceof Node && cellRef.current?.contains(next)) return;
    // Focus can leave twice before it comes back, as when it passes through
    // a popup's trigger on its way into the popup: only the last leaving
    // counts, so a focus that comes back cancels it.
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      // The window itself lost focus, as when switching to another app; focus
      // comes back here with it.
      if (!document.hasFocus()) return;
      if (cellRef.current?.contains(document.activeElement)) return;
      setEditing(false);
      draft.leave();
    }, 0);
  };

  // Caught before the editor sees them, and only from its text: the toolbar
  // and the link form keep their own keys.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLTableCellElement>) => {
    const editable = event.target;
    if (
      !(editable instanceof HTMLElement) ||
      !editable.matches(EDITABLE_SELECTOR)
    ) {
      return;
    }
    if (event.key === 'Escape') {
      // In one version's line, Escape first folds the versions back into
      // their pill; only Escape in the text around them puts the cell back.
      if (!draft.changed || editable.matches('[data-version]')) return;
      event.preventDefault();
      event.stopPropagation();
      holdFocus();
      draft.revert();
      setRevision((current) => current + 1);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
      const modifier = event.metaKey || event.ctrlKey;
      if (!singleLine && !modifier) return;
      event.preventDefault();
      event.stopPropagation();
      // The last row has nowhere to go, so the cell is checked where it is.
      if (!onMove(1)) draft.leave();
      return;
    }
    if (
      (event.key === 'ArrowUp' && isAtEdge(editable, 'start')) ||
      (event.key === 'ArrowDown' && isAtEdge(editable, 'end'))
    ) {
      // Versions listed open step between their own rows first.
      if (
        editable.matches('[data-version]') &&
        hasVersionRowBeside(editable, event.key === 'ArrowUp' ? -1 : 1)
      ) {
        return;
      }
      if (onMove(event.key === 'ArrowUp' ? -1 : 1)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  return {
    editing,
    revision,
    cellProps: {
      ref: cellRef,
      tabIndex: -1,
      onFocus,
      onBlur,
      onKeyDownCapture: editing ? onKeyDownCapture : undefined,
    },
  };
};

/** Focus, by any means, turns the cell into its editor. */
const CellOpener = ({
  labelledBy,
  describedBy,
  invalid,
  rowIndex,
  colIndex,
}: {
  labelledBy: string;
  describedBy: string;
  invalid: boolean;
  rowIndex: number;
  colIndex: number;
}) => (
  <button
    type="button"
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    // oxlint-disable-next-line jsx-a11y/role-supports-aria-props -- the closed cell's opener stands in for the editor it opens; screen readers still say "invalid entry" for it, which the description alone does not.
    aria-invalid={invalid}
    data-row={rowIndex}
    data-col={colIndex}
    className="absolute inset-0 cursor-text scroll-ms-(--translation-table-names) scroll-mt-(--translation-table-sticky-top) outline-none"
  />
);

/** What a cell's editor is given by the frame it is drawn in. */
type CellEditorProps = Readonly<{
  id: string;
  describedBy: string;
  invalid: boolean;
}>;

/**
 * The frame of a cell that is shown as participants see it until it has
 * focus, then edited in place (see `useEditedCell`): what participants see
 * while it is empty, its text, its editor, why it cannot be saved, and
 * whether it is unsaved.
 */
const EditedCellFrame = ({
  row,
  locale,
  localization,
  labelledBy,
  rowIndex,
  colIndex,
  onMove,
  draft,
  singleLine,
  fallback,
  summary,
  summaryClassName,
  renderEditor,
  note,
  formText = false,
  providesLocalization = false,
}: TranslationCellProps & {
  draft: ReturnType<typeof useTranslationDraft>;
  /** Whether the text is one line, so that Enter always moves on. */
  singleLine: boolean;
  /** What participants see while the cell is empty (see `Fallback`). */
  fallback: FallbackProps;
  /** The cell's text as participants see it. */
  summary: ReactNode;
  summaryClassName: string;
  renderEditor: (props: CellEditorProps) => ReactNode;
  /** Shown below the text, edited or not. */
  note?: ReactNode;
  /** Whether the cell holds the text of a form. */
  formText?: boolean;
  /**
   * Whether the cell's text and editor read the protocol's languages, as
   * text that shows values does.
   */
  providesLocalization?: boolean;
}) => {
  const contentId = useId();
  const editorId = useId();
  const noteId = useId();
  const formScope = useFormFieldScope();
  const { text, error } = draft;
  const { editing, revision, cellProps } = useEditedCell({
    draft,
    singleLine,
    onMove,
    isAtEdge: isEditableCaretAt,
  });
  const empty = isBlankTranslation(row, text);
  const fallbackShown = empty && error === undefined;
  const describedBy = [
    fallbackShown || !editing ? contentId : undefined,
    error === undefined ? undefined : noteId,
  ]
    .filter(Boolean)
    .join(' ');

  const content = editing ? (
    <>
      {fallbackShown && (
        <div className="sr-only">
          <Fallback id={contentId} {...fallback} />
        </div>
      )}
      {/* The editor takes no new value while it has focus, so putting back
          what the protocol has gives it a fresh one. */}
      <Fragment key={revision}>
        {renderEditor({
          id: editorId,
          describedBy,
          invalid: error !== undefined,
        })}
      </Fragment>
    </>
  ) : (
    <>
      <div className="grid">
        {empty ? (
          <Fallback id={contentId} {...fallback} />
        ) : (
          <div
            id={contentId}
            className={cx(summaryClassName, 'col-start-1 row-start-1')}
          >
            {summary}
          </div>
        )}
      </div>
      <CellOpener
        labelledBy={labelledBy}
        describedBy={describedBy}
        invalid={error !== undefined}
        rowIndex={rowIndex}
        colIndex={colIndex}
      />
    </>
  );

  return (
    <td
      {...cellProps}
      lang={locale}
      dir={localeDirection(locale)}
      // Typed in this column's language: nothing to guess.
      data-typed-language=""
      data-field-path={draft.name}
      data-field-form={formScope}
      data-form-text={formText ? '' : undefined}
      className={cx(CELL_CLASSES, error !== undefined && INVALID_CELL_CLASSES)}
    >
      {providesLocalization ? (
        <ProtocolLocalizationProvider
          localization={localization}
          initialLocale={locale}
        >
          {content}
        </ProtocolLocalizationProvider>
      ) : (
        content
      )}
      {note}
      {error !== undefined && <ProblemNote id={noteId}>{error}</ProblemNote>}
      {draft.changed && <UnsavedMark />}
    </td>
  );
};

/**
 * Rich text, shown as participants see it until the cell has focus, then
 * edited in the cell with the same editor the stage editor uses.
 */
const RichTextCell = (props: TranslationCellProps) => {
  const { row, locale, localization, labelledBy } = props;
  // The editor the text's field declares, as the stage editor offers it: a
  // one-line text gets bold and italics, a text of several lines the whole
  // toolbar, whatever its translations hold now.
  const { singleLine, assetBlocks } = textFieldPropsFor(row);
  const draft = useTranslationDraft({ row, locale });
  const value = rowValueWithCell(row, locale, draft.text);
  return (
    <EditedCellFrame
      {...props}
      draft={draft}
      singleLine={singleLine}
      fallback={{
        value,
        format: row.format,
        assetBlocks,
        singleLine,
        locale,
        localization,
      }}
      summaryClassName={CELL_TEXT_CLASSES}
      summary={
        <CellMarkdown assetBlocks={assetBlocks} singleLine={singleLine}>
          {draft.text}
        </CellMarkdown>
      }
      renderEditor={({ id, describedBy, invalid }) => (
        <RichTextField
          id={id}
          name={id}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          value={draft.text}
          onChange={(markdown) => draft.change(markdown ?? '')}
          singleLine={singleLine}
          assetBlocks={assetBlocks ? CELL_ASSET_BLOCKS : undefined}
          // In this column's language, as the plain-text cell's box is.
          dir={localeDirection(locale)}
          className={CELL_EDITOR_CLASSES}
          autoFocus
        />
      )}
    />
  );
};

/**
 * A localized message: shown with its placeholders and versions as pills
 * until the cell has focus, then edited in the cell with the same editor as
 * in the stage editor.
 */
const MessageCell = ({
  messageArguments,
  ...props
}: TranslationCellProps & { messageArguments: MessageArguments }) => {
  const { row, locale, localization, labelledBy } = props;
  const draft = useTranslationDraft({ row, locale });
  const value = rowValueWithCell(row, locale, draft.text);
  return (
    <EditedCellFrame
      {...props}
      draft={draft}
      // The text is one line, so Enter always moves on.
      singleLine
      fallback={{
        value,
        format: 'plain',
        locale,
        localization,
        messageArguments,
      }}
      summaryClassName={PLAIN_TEXT_CLASSES}
      summary={
        <LocalizedMessageVersionsSummary
          message={draft.text}
          declaration={messageArguments}
          locale={locale}
        />
      }
      renderEditor={({ id, describedBy, invalid }) => (
        <LocalizedMessageVersions
          id={id}
          name={id}
          message={draft.text}
          onMessageChange={(next) => draft.change(next ?? '')}
          declaration={messageArguments}
          locale={locale}
          ariaLabelledBy={labelledBy}
          ariaDescribedBy={describedBy}
          ariaInvalid={invalid}
          autoFocus
          className={CELL_EDITOR_CLASSES}
          // A version of a dynamic attribute shows no value, and the only
          // one that is a message is a number's wording: it opens with a
          // version for each plural form of the language.
          numberWording={row.place.kind === 'dynamicAttributeWording'}
        />
      )}
    />
  );
};

/**
 * What text at `path` can show: the roles on screen where it sits and their
 * attributes, and the conditions and dynamic attributes its stage (or node
 * label) declares, as the table holds them. A cell writes them as the stage
 * editor does: its logic blocks can test new rules, and its text can show a
 * new dynamic attribute (see `useDefinitionsInTable`). `locale` is the
 * language of the cell whose editor writes them, which keeps the change, so
 * that Escape there puts it back; without it they are only read.
 */
const useDynamicSite = (
  path: TranslationRow['path'],
  site: DynamicValueSite,
  locale?: LocaleTag,
): DynamicMessageSite => {
  const protocol = useAppSelector(getProtocol);
  const stablePath = useStablePath(path);
  const definitions = useDefinitionsInTable(
    ownerOfTextPath(path),
    locale === undefined ? undefined : { path, locale },
  );
  const conditions = definitions?.conditions;
  const dynamicAttributes = definitions?.dynamicAttributes;
  return useMemo(() => {
    const [root, stageIndex, ...sitePath] = stablePath;
    const stage =
      root === 'stages' && typeof stageIndex === 'number'
        ? protocol?.stages[stageIndex]
        : undefined;
    const codebook = protocol?.codebook;
    const conditionValues = conditions?.values ?? {};
    const shared = {
      dynamicAttributes: {
        values: dynamicAttributes?.values ?? {},
        ...(dynamicAttributes?.set !== undefined && {
          set: dynamicAttributes.set,
        }),
      },
    };
    const setConditions =
      conditions?.set === undefined ? {} : { set: conditions.set };
    // A node type's own label sits in the codebook, and shows what is known
    // of the node it is on rather than what a stage shows.
    const labelledNodeType =
      site === 'nodeLabel' && root === 'codebook' && stablePath[1] === 'node'
        ? stablePath[2]
        : undefined;
    if (typeof labelledNodeType === 'string') {
      return {
        ...shared,
        context: nodeLabelValueContext({
          codebook,
          nodeType: labelledNodeType,
          conditions: conditions?.values,
        }),
        conditions: {
          values: conditionValues,
          ...setConditions,
          codebook,
          subject: { entity: 'node', type: labelledNodeType },
          allowEgoRules: false,
        },
        owner: 'nodeLabel',
      };
    }
    const subject: unknown =
      isRecord(stage) && 'subject' in stage ? stage.subject : undefined;
    const drafted = isRecord(stage)
      ? {
          ...stage,
          conditions: conditions?.values,
          dynamicAttributes: dynamicAttributes?.values,
        }
      : stage;
    return {
      ...shared,
      context: dynamicValueContextFor({
        codebook,
        stage: drafted,
        sitePath,
        site,
      }),
      conditions: {
        values: conditionValues,
        ...setConditions,
        codebook,
        subject:
          isRecord(subject) &&
          (subject.entity === 'node' || subject.entity === 'edge') &&
          typeof subject.type === 'string'
            ? { entity: subject.entity, type: subject.type }
            : undefined,
        allowEgoRules: true,
      },
    };
  }, [protocol, stablePath, site, conditions, dynamicAttributes]);
};

/**
 * A field where the text of a form places it, in a cell of the translation
 * table: the field's question in the cell's language, or the one that the
 * interview falls back to.
 */
const CellFieldSummary = ({
  field,
  path,
  locale,
  localization,
}: Readonly<{
  field: FormFieldDraft;
  path: TranslationRow['path'];
  locale: LocaleTag;
  localization: ProtocolLocalization;
}>) => {
  const site = useDynamicSite(path, 'formField');
  const shown = fallbackFor(field.prompt, locale, localization);
  return (
    <div className="border-outline my-1 min-h-8 rounded-sm border px-2 py-1">
      {shown !== null && (
        <div lang={shown.lang} dir={shown.dir}>
          <DynamicMessageSummary
            message={shown.text}
            markdown
            multiline={false}
            locale={shown.lang}
            site={site}
          />
        </div>
      )}
    </div>
  );
};

/** Below the text of a form: where its fields' questions are translated. */
const FormTextNote = () => {
  const intl = useAppIntl();
  return (
    <p
      lang={intl.locale}
      dir="auto"
      className="text-match-parent px-3 pb-2 text-sm text-current/70"
    >
      {intl.formatMessage(messages.formFieldTextsInRows)}
    </p>
  );
};

/**
 * The fields of the form at `formPath`, with their questions and hints, as
 * the table holds the protocol (`protocolInTable`).
 */
const useFieldsInTable = (
  formPath: TranslationRow['path'],
): readonly FormFieldDraft[] => {
  const fields = useInTableAt([...formPath, 'fields']);
  return useMemo(() => formFieldDraftsOf(fields), [fields]);
};

/**
 * The text of a form: shown with its fields, each with its question, until
 * the cell has focus, then edited in the cell with the stage editor's form
 * editor. The text is translated here, with its logic blocks and dynamic
 * attributes, which can be created and changed here as in the stage editor;
 * each field's question and hint are shown and translated in rows of their
 * own, and only the form's own fields can be put in. New fields and
 * attributes are made in the stage editor.
 */
const FormContentCell = ({
  formPath,
  ...props
}: TranslationCellProps & { formPath: TranslationRow['path'] }) => {
  const { row, locale, localization, labelledBy } = props;
  const protocol = useAppSelector(getProtocol);
  const site = useDynamicSite(row.path, 'formField', locale);
  const fields = useFieldsInTable(formPath);
  const variables = useMemo(
    () => formVariables(protocol, fields),
    [fields, protocol],
  );
  const draft = useTranslationDraft({ row, locale });
  const value = rowValueWithCell(row, locale, draft.text);
  const fieldSummary = (fieldId: string) => {
    const index = fields.findIndex(({ id }) => id === fieldId);
    const field = fields[index];
    return field === undefined ? null : (
      <CellFieldSummary
        field={field}
        path={[...formPath, 'fields', index, 'prompt']}
        locale={locale}
        localization={localization}
      />
    );
  };

  return (
    <EditedCellFrame
      {...props}
      draft={draft}
      singleLine={false}
      formText
      providesLocalization
      note={<FormTextNote />}
      fallback={{
        value,
        format: row.format,
        assetBlocks: true,
        locale,
        localization,
        dynamic: { site, singleLine: false, fieldSummary },
      }}
      summaryClassName={CELL_TEXT_CLASSES}
      summary={
        <DynamicMessageSummary
          message={draft.text}
          markdown
          multiline
          locale={locale}
          site={site}
          blockMarkdown={CELL_ASSET_BLOCK_MARKDOWN}
          fieldSummary={fieldSummary}
        />
      }
      renderEditor={({ id, describedBy, invalid }) => (
        <FormDocumentEditor
          id={id}
          name={id}
          ariaLabelledBy={labelledBy}
          ariaDescribedBy={describedBy}
          ariaInvalid={invalid}
          ariaRequired={false}
          autoFocus
          editable
          className={CELL_EDITOR_CLASSES}
          message={draft.text}
          onMessageChange={(next) => draft.change(next ?? '')}
          content={value}
          fields={fields}
          locale={locale}
          localization={localization}
          interfaceText={undefined}
          site={site}
          showsProblems={false}
          assetBlocks={CELL_ASSET_BLOCKS}
          variables={variables}
          editing={{ kind: 'translation' }}
        />
      )}
    />
  );
};

/**
 * Text that can show values the interview fills in: shown with its values
 * as pills until the cell has focus, then edited in the cell with the stage
 * editor's own editor, offering the values text there can show.
 */
const DynamicCell = ({
  dynamicValues,
  ...props
}: TranslationCellProps & { dynamicValues: DynamicValueSite }) => {
  const { row, locale, localization, labelledBy } = props;
  const site = useDynamicSite(row.path, dynamicValues, locale);
  const draft = useTranslationDraft({ row, locale });
  // As the text's field declares it (see `RichTextCell`).
  const { markdown, singleLine, assetBlocks } = textFieldPropsFor(row);
  const value = rowValueWithCell(row, locale, draft.text);
  return (
    <EditedCellFrame
      {...props}
      draft={draft}
      singleLine={singleLine}
      providesLocalization
      fallback={{
        value,
        format: row.format,
        assetBlocks,
        locale,
        localization,
        dynamic: { site, singleLine },
      }}
      summaryClassName={markdown ? CELL_TEXT_CLASSES : PLAIN_TEXT_CLASSES}
      summary={
        <LineInParagraph singleLine={singleLine} paragraph={CellParagraph}>
          <DynamicMessageSummary
            message={draft.text}
            markdown={markdown}
            multiline={!singleLine}
            locale={locale}
            site={site}
            blockMarkdown={
              assetBlocks ? CELL_ASSET_BLOCK_MARKDOWN : CELL_BLOCK_MARKDOWN
            }
          />
        </LineInParagraph>
      }
      renderEditor={({ id, describedBy, invalid }) => (
        <DynamicMessageEditor
          id={id}
          name={id}
          ariaLabelledBy={labelledBy}
          ariaDescribedBy={describedBy}
          ariaInvalid={invalid}
          autoFocus
          readOnly={false}
          markdown={markdown}
          singleLine={singleLine}
          assetBlocks={assetBlocks ? CELL_ASSET_BLOCKS : undefined}
          message={draft.text}
          onMessageChange={(next) => draft.change(next ?? '')}
          locale={locale}
          site={site}
          showsProblems={false}
          className={CELL_EDITOR_CLASSES}
        />
      )}
    />
  );
};

/**
 * The cell of a localized string in a language that it is not used in, such
 * as the question of a field that the form in that language does not
 * include. It has no translation to write, so it cannot be edited. It still
 * marks its row, without a column, so that moving from cell to cell passes
 * over it even when every cell of its row that is shown is one of these.
 */
const NotUsedCell = ({
  locale,
  rowIndex,
}: Pick<TranslationCellProps, 'locale' | 'rowIndex'>) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  return (
    <td
      data-row={rowIndex}
      className="border-outline border-e border-b p-0 align-top"
    >
      <div className={cx(CELL_TEXT_CLASSES, 'text-sm text-current/60 italic')}>
        {intl.formatMessage(messages.notUsed, {
          language: languageName(locale),
        })}
      </div>
    </td>
  );
};

/** One translation of one text: a cell of the translation table. */
const TranslationCell = (props: TranslationCellProps) => {
  const { arguments: messageArguments, dynamicValues, format } = props.row;
  const used = useUsedInTable(props.row, props.locale);
  // A translation that is there is still shown, so that it can be cleared.
  if (!used && !Object.hasOwn(props.row.value, props.locale)) {
    return <NotUsedCell locale={props.locale} rowIndex={props.rowIndex} />;
  }
  const { place } = props.row;
  if (place.kind === 'formContent' && dynamicValues !== undefined) {
    return <FormContentCell {...props} formPath={place.form} />;
  }
  if (dynamicValues !== undefined) {
    return <DynamicCell {...props} dynamicValues={dynamicValues} />;
  }
  if (messageArguments !== undefined) {
    return <MessageCell {...props} messageArguments={messageArguments} />;
  }
  return format === 'markdown' ? (
    <RichTextCell {...props} />
  ) : (
    <PlainTextCell {...props} />
  );
};

export default TranslationCell;
