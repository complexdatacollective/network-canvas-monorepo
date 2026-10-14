'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toolbar } from '@base-ui/react/toolbar';
import {
  type AnyExtension,
  createNodeFromContent,
  type Editor,
  Extension,
  getSchema,
  isProseMirrorFragment,
  mergeAttributes,
  Node as TiptapNode,
} from '@tiptap/core';
import { BulletList } from '@tiptap/extension-bullet-list';
import { Heading } from '@tiptap/extension-heading';
import { OrderedList } from '@tiptap/extension-ordered-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Placeholder } from '@tiptap/extension-placeholder';
import {
  type DOMOutputSpec,
  Fragment,
  type Node as ProseMirrorNode,
  type Schema,
  Slice,
} from '@tiptap/pm/model';
import { Plugin, PluginKey, Selection } from '@tiptap/pm/state';
import {
  EditorContent,
  type JSONContent,
  useEditor,
  useEditorState,
} from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { isEqual } from 'es-toolkit';
import {
  Bold,
  Check,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Plus,
  Redo,
  Syringe,
  Trash2,
  Undo,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import Button, { buttonVariants, iconButtonVariants } from '../../Button';
import { Popover, PopoverContent, PopoverTrigger } from '../../Popover';
import {
  controlVariants,
  inputControlVariants,
  interactiveStateVariants,
  multilineContentVariants,
  stateVariants,
} from '../../styles/controlVariants';
import { tokenPillClasses, tokenPillContentSpec } from '../../TokenPill';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../Tooltip';
import { useEnclosingHeadingLevel } from '../../typography/EnclosingHeadingLevel';
import { headingVariants } from '../../typography/Heading';
import { paragraphVariants } from '../../typography/Paragraph';
import { cva, cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { getInputState } from '../utils/getInputState';
import InputField from './InputField';
import { documentInSchema, marksInSchema } from './richText/fitToSchema';
import {
  InsertMenuList,
  type RichTextInsertMenu,
  type RichTextInsertMenuItem,
} from './richText/InsertMenu';
import {
  NestedEditingContext,
  VERSIONS_NODE,
  VersionsNode,
  versionsIn,
} from './richText/versionsNode';

const messages = defineMessages({
  bold: {
    id: 'frescoUi.richTextEditor.bold',
    defaultMessage: 'Bold',
    description: 'Accessible name of the bold toggle in the editor toolbar.',
  },
  italic: {
    id: 'frescoUi.richTextEditor.italic',
    defaultMessage: 'Italic',
    description: 'Accessible name of the italic toggle in the editor toolbar.',
  },
  linkButton: {
    id: 'frescoUi.richTextEditor.linkButton',
    defaultMessage: '{hasLink, select, true {Edit link} other {Add link}}',
    description:
      'Accessible name of the toolbar link button; says whether it will edit the existing link or add one.',
  },
  heading1: {
    id: 'frescoUi.richTextEditor.heading1',
    defaultMessage: 'Heading 1',
    description:
      'Accessible name of the level-1 heading toggle in the editor toolbar.',
  },
  heading2: {
    id: 'frescoUi.richTextEditor.heading2',
    defaultMessage: 'Heading 2',
    description:
      'Accessible name of the level-2 heading toggle in the editor toolbar.',
  },
  heading3: {
    id: 'frescoUi.richTextEditor.heading3',
    defaultMessage: 'Heading 3',
    description:
      'Accessible name of the level-3 heading toggle in the editor toolbar.',
  },
  heading4: {
    id: 'frescoUi.richTextEditor.heading4',
    defaultMessage: 'Heading 4',
    description:
      'Accessible name of the level-4 heading toggle in the editor toolbar.',
  },
  numberedList: {
    id: 'frescoUi.richTextEditor.numberedList',
    defaultMessage: 'Numbered list',
    description:
      'Accessible name of the ordered-list toggle in the editor toolbar.',
  },
  bulletList: {
    id: 'frescoUi.richTextEditor.bulletList',
    defaultMessage: 'Bullet list',
    description:
      'Accessible name of the bullet-list toggle in the editor toolbar.',
  },
  thematicBreak: {
    id: 'frescoUi.richTextEditor.thematicBreak',
    defaultMessage: 'Thematic break',
    description:
      'Accessible name of the toolbar button inserting a horizontal rule.',
  },
  undo: {
    id: 'frescoUi.richTextEditor.undo',
    defaultMessage: 'Undo',
    description: 'Accessible name of the undo button in the editor toolbar.',
  },
  redo: {
    id: 'frescoUi.richTextEditor.redo',
    defaultMessage: 'Redo',
    description: 'Accessible name of the redo button in the editor toolbar.',
  },
  emptyVersion: {
    id: 'frescoUi.richTextEditor.emptyVersion',
    defaultMessage: 'Shows nothing',
    description:
      'Muted hint shown inside an empty version of a piece of text, such as the version shown when a participant’s name is not known. An empty version is allowed: in that case nothing is shown in its place. The hint is not part of the text.',
  },
  insertToken: {
    id: 'frescoUi.richTextEditor.insertToken',
    defaultMessage: 'Insert “{token}”',
    description:
      'Accessible name of a toolbar button that inserts a placeholder, such as a person’s name, at the caret. {token} is the placeholder’s label, which the button also shows.',
  },
  insertRequiredToken: {
    id: 'frescoUi.richTextEditor.insertRequiredToken',
    defaultMessage: 'Insert “{token}” (required in this text)',
    description:
      'Accessible name of a toolbar button that inserts a placeholder, such as a person’s name, that the text must include but does not yet. {token} is the placeholder’s label, which the button also shows.',
  },
  tokens: {
    id: 'frescoUi.richTextEditor.tokens',
    defaultMessage: 'Insert a placeholder',
    description:
      'Accessible name of the toolbar group of buttons that each insert a placeholder, such as a person’s name, into the text.',
  },
  linkUrlLabel: {
    id: 'frescoUi.richTextEditor.linkUrlLabel',
    defaultMessage: 'Link URL',
    description: 'Label of the URL input in the link popover.',
  },
  linkUrlPlaceholder: {
    id: 'frescoUi.richTextEditor.linkUrlPlaceholder',
    defaultMessage: 'https://example.com',
    description:
      'Example URL shown as the placeholder of the link popover input.',
  },
  removeLink: {
    id: 'frescoUi.richTextEditor.removeLink',
    defaultMessage: 'Remove link',
    description:
      'Accessible name of the link popover button that removes the link.',
  },
  removeLinkShort: {
    id: 'frescoUi.richTextEditor.removeLinkShort',
    defaultMessage: 'Remove',
    description: 'Visible label of the link popover button removing the link.',
  },
  applyLink: {
    id: 'frescoUi.richTextEditor.applyLink',
    defaultMessage: 'Apply link',
    description:
      'Accessible name of the link popover button that applies the link.',
  },
  applyLinkShort: {
    id: 'frescoUi.richTextEditor.applyLinkShort',
    defaultMessage: 'Apply',
    description: 'Visible label of the link popover button applying the link.',
  },
});

/**
 * Whether the toolbar is unavailable because the FIELD is — read-only, or
 * disabled while its form submits — rather than because of where the caret
 * happens to be.
 *
 * The two are different states, and a button says them differently. A live
 * toolbar keeps an unavailable button focusable and marked `aria-disabled`,
 * which is what the ARIA toolbar pattern asks for: a keyboard user can arrow
 * onto Undo and be told there is nothing to undo. A toolbar belonging to a
 * field nobody can edit has nothing to go and read, so its buttons are
 * unavailable the way every other control on the form is — disabled outright,
 * and out of the tab order.
 */
const FieldUnavailableContext = createContext(false);

function useUnavailableProps() {
  const unavailable = useContext(FieldUnavailableContext);
  return unavailable
    ? ({ 'focusableWhenDisabled': false, 'aria-disabled': true } as const)
    : {};
}

const ToolbarToggleButton = (props: Toolbar.Button.Props) => {
  const unavailable = useUnavailableProps();
  return <Toolbar.Button {...props} {...unavailable} render={<Toggle />} />;
};

const ToolbarButton = (props: Toolbar.Button.Props) => {
  const unavailable = useUnavailableProps();
  return <Toolbar.Button {...props} {...unavailable} />;
};

// Get the classes from the typography components
const paragraphClasses = paragraphVariants();
const h1Classes = headingVariants({ level: 'h1' });
const h2Classes = headingVariants({ level: 'h2' });
const h3Classes = headingVariants({ level: 'h3' });
const h4Classes = headingVariants({ level: 'h4' });

/**
 * A document that is one paragraph and cannot become two.
 *
 * `singleLine` is a promise about the VALUE — one line of text — and the
 * schema is the only place that promise can be kept. Enforcing it on the way
 * out instead leaves the editor free to hold a document the single-line form
 * cannot express, and whatever serialises it then has to invent a join for the
 * paragraphs it was never meant to see. Architect's markdown adapter joined
 * them with a space, so a field whose emptied first paragraph the caret had
 * just left saved "Never met" as " Never met".
 */
const SingleLineDocument = TiptapNode.create({
  name: 'doc',
  topNode: true,
  content: 'paragraph',
});

/**
 * A placeholder the field can hold among its text, such as a person's name
 * filled in later. `id` is what the value records; `label` is what the field
 * shows, on the pill in the text and on the button that inserts it. A
 * `required` placeholder is one the text must include: while it does not,
 * the button that inserts it says so.
 */
export type RichTextEditorToken = Readonly<{
  id: string;
  label: string;
  required?: boolean;
  /**
   * How the placeholder is written as text, such as `{name}`. Pasted text
   * that holds it arrives as the placeholder rather than as those characters.
   */
  text?: string;
  /**
   * Whether the toolbar offers a button for it. A placeholder offered only
   * through the insert menu, or only inside a piece of text the field
   * builds, is held and shown without one. Defaults to true.
   */
  inToolbar?: boolean;
}>;

/** The node type a token is held as: `{ type: 'token', attrs: { id } }`. */
const TOKEN_NODE = 'token';

/** The ids of the tokens `doc` holds, one per line, for the toolbar to compare. */
const placedTokenIds = (doc: ProseMirrorNode): string => {
  const ids = new Set<string>();
  // A version's text is held in its element's attributes, as JSON.
  const collect = (content: unknown) => {
    if (!Array.isArray(content)) return;
    for (const node of content as JSONContent[]) {
      if (node.type === TOKEN_NODE && typeof node.attrs?.id === 'string') {
        ids.add(node.attrs.id);
      }
      collect(node.content);
      collectVersions(node.attrs?.versions);
    }
  };
  const collectVersions = (versions: unknown) => {
    for (const version of versionsIn(versions)) collect(version.content);
  };
  doc.descendants((node) => {
    const tokenId: unknown = node.attrs.id;
    if (node.type.name === TOKEN_NODE && typeof tokenId === 'string') {
      ids.add(tokenId);
    }
    if (node.type.name === VERSIONS_NODE) collectVersions(node.attrs.versions);
  });
  return [...ids].toSorted().join('\n');
};

/**
 * A token, held as one character of the line: the caret steps over it,
 * Backspace removes it whole, and it is copied and pasted between fields that
 * offer it. A pasted token a field does not offer arrives as its label, as
 * text: the field cannot hold it, and the words are what was meant.
 */
const createTokenNode = (tokens: readonly RichTextEditorToken[]) => {
  const labels = new Map(tokens.map(({ id, label }) => [id, label]));
  const labelOf = (id: unknown) =>
    typeof id === 'string' ? (labels.get(id) ?? id) : '';

  return TiptapNode.create({
    name: TOKEN_NODE,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      return {
        id: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-token'),
          renderHTML: (attributes) => ({ 'data-token': attributes.id }),
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: 'span[data-token]',
          getAttrs: (element) =>
            labels.has(element.getAttribute('data-token') ?? '') ? null : false,
        },
      ];
    },

    // Drawn with the classes `TokenPill` draws a placeholder with in text
    // that is only read, so the two look alike. Plain DOM, not a React node
    // view, which draws a render late.
    renderHTML({ node, HTMLAttributes }): DOMOutputSpec {
      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          // A pointer, not the text cursor: the pill is one object.
          class: tokenPillClasses('cursor-pointer'),
          contenteditable: 'false',
        }),
        ...tokenPillContentSpec(labelOf(node.attrs.id)),
      ];
    },

    renderText({ node }) {
      return labelOf(node.attrs.id);
    },

    addProseMirrorPlugins() {
      const written = tokens.flatMap(({ id, text }) =>
        text === undefined || text === '' ? [] : [{ id, text }],
      );
      if (written.length === 0) return [];
      const { schema } = this.editor;
      return [
        new Plugin({
          key: new PluginKey('tokenPaste'),
          props: {
            transformPasted: (slice: Slice) =>
              new Slice(
                withWrittenTokens(slice.content, written, schema),
                slice.openStart,
                slice.openEnd,
              ),
          },
        }),
      ];
    },
  });
};

/**
 * Pasted text with each placeholder written in it, such as `{name}`, turned
 * into the placeholder. Text keeps its marks on both sides of one.
 */
const withWrittenTokens = (
  fragment: Fragment,
  written: readonly Readonly<{ id: string; text: string }>[],
  schema: Schema,
): Fragment => {
  const tokenType = schema.nodes[TOKEN_NODE];
  if (tokenType === undefined) return fragment;
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    if (!node.isText) {
      nodes.push(
        node.isLeaf
          ? node
          : node.copy(withWrittenTokens(node.content, written, schema)),
      );
      return;
    }
    let rest = node.text ?? '';
    while (rest !== '') {
      let first: { at: number; id: string; text: string } | undefined;
      for (const token of written) {
        const at = rest.indexOf(token.text);
        if (at !== -1 && (first === undefined || at < first.at)) {
          first = { at, ...token };
        }
      }
      if (first === undefined) {
        nodes.push(schema.text(rest, node.marks));
        break;
      }
      if (first.at > 0) {
        nodes.push(schema.text(rest.slice(0, first.at), node.marks));
      }
      nodes.push(tokenType.create({ id: first.id }, null, node.marks));
      rest = rest.slice(first.at + first.text.length);
    }
  });
  return Fragment.fromArray(nodes);
};

/** The line being collected, and whether a break is owed before its next text. */
type OneLineRun = {
  collected: JSONContent[];
  breakPending: boolean;
};

const SPACE = ' ';

/**
 * Adds text to the line, joining it to the run before it when they carry the
 * same marks. That is what ProseMirror itself holds, so a flattened value
 * compares equal to the document the editor makes of it.
 */
const pushRun = (
  run: OneLineRun,
  text: string,
  marks: JSONContent['marks'],
) => {
  const carried = marks && marks.length > 0 ? marks : undefined;
  const previous = run.collected.at(-1);

  if (previous?.type === 'text' && isEqual(previous.marks, carried)) {
    previous.text = `${previous.text ?? ''}${text}`;
    return;
  }

  run.collected.push(
    carried === undefined
      ? { type: 'text', text }
      : { type: 'text', marks: carried, text },
  );
};

/**
 * Adds a text node to the line, spelling any break owed before it as one
 * space. The space carries no marks of its own: a bold space would serialise
 * as part of the bold run, and markdown will not open emphasis on a space.
 */
const addText = (
  run: OneLineRun,
  text: string,
  marks: JSONContent['marks'],
) => {
  if (run.breakPending && run.collected.length > 0) {
    pushRun(run, SPACE, undefined);
  }

  run.breakPending = false;
  pushRun(run, text, marks);
};

/**
 * Adds a token to the line, after the space any break before it is owed. A
 * token says something, as text does, so it is never a break itself.
 */
/** Adds an inline atom: a token, or a set of versions, kept whole. */
const addAtom = (run: OneLineRun, atom: JSONContent) => {
  if (run.breakPending && run.collected.length > 0) {
    pushRun(run, SPACE, undefined);
  }

  run.breakPending = false;
  run.collected.push(atom);
};

/** A run of newlines, however the platform that wrote them spells one. */
const LINE_BREAKS = /(?:\r\n|[\n\r])+/;

/**
 * Adds a text node, treating the newlines INSIDE it as breaks like any other.
 *
 * A line break can live inside the text itself, where no schema was ever going
 * to refuse it: markdown's own soft break parses to one text node with the
 * newline still in it, and the editor renders with `white-space: pre-wrap`, so
 * the field showed two lines while reporting `aria-multiline="false"` — and
 * saved the break back into the label a participant reads.
 */
const addTextLines = (
  run: OneLineRun,
  text: string,
  marks: JSONContent['marks'],
) => {
  for (const [index, line] of text.split(LINE_BREAKS).entries()) {
    if (index > 0) {
      run.breakPending = true;
    }

    if (line !== '') {
      addText(run, line, marks);
    }
  }
};

/**
 * Every line of a document, run together as the inline content of one.
 *
 * This works on the JSON rather than on a parsed document, because on the way
 * IN there is nothing parsed yet — and for a single-line field there cannot
 * be. Its schema has no heading, list or rule in it, `Node.fromJSON` throws on
 * a node type it does not know, and TipTap answers that by handing back an
 * EMPTY document. So a stored heading did not arrive flattened; it arrived as
 * nothing at all, and the next edit saved that emptiness over the researcher's
 * words. Reading the value first is the very thing that fails, so the shape is
 * changed before anything reads it.
 *
 * Text keeps its marks, so a formatted phrase keeps its bold and italic runs:
 * the line loses its line breaks, not its formatting.
 *
 * Every other node is a BREAK in the line — a block boundary, a hard break, an
 * atom this field has no room for, a newline inside the text itself — and
 * however many of them fall together
 * they spell ONE space, and only between text that says something on both
 * sides. Spelling each break separately put one in twice wherever blocks nest
 * (a pasted list arrived as "One  Two"), put one beside an empty paragraph
 * that has nothing on the other side of it, and left the saved line ending in
 * one. Architect's markdown adapter reduces its own blocks by this same rule.
 */
const collectOneLine = (
  content: JSONContent[] | null | undefined,
  run: OneLineRun,
  schema: Schema,
) => {
  for (const node of content ?? []) {
    if (node.type === 'text') {
      if (node.text) {
        addTextLines(run, node.text, marksInSchema(node.marks, schema));
      }
      continue;
    }

    if (node.type === TOKEN_NODE && Object.hasOwn(schema.nodes, TOKEN_NODE)) {
      const marks = marksInSchema(node.marks, schema);
      addAtom(run, {
        type: TOKEN_NODE,
        attrs: { id: node.attrs?.id },
        ...(marks !== undefined && marks.length > 0 && { marks }),
      });
      continue;
    }

    // Its versions live in its attributes, not its content, so it is kept
    // whole rather than read through.
    if (
      node.type === VERSIONS_NODE &&
      Object.hasOwn(schema.nodes, VERSIONS_NODE)
    ) {
      addAtom(run, documentInSchema(node, schema));
      continue;
    }

    // Owed on both sides of whatever this node holds: the text after a block
    // is on a new line, and so is the text after the block ends.
    run.breakPending = true;
    collectOneLine(node.content, run, schema);
    run.breakPending = true;
  }
};

/** The inline content a document's lines make when run together as one. */
const oneLineContentOf = (
  content: JSONContent[] | null | undefined,
  schema: Schema,
): JSONContent[] => {
  const run: OneLineRun = { collected: [], breakPending: false };
  collectOneLine(content, run, schema);
  return run.collected;
};

/**
 * The one-paragraph document a value makes.
 *
 * An empty paragraph carries no `content` at all, which is how ProseMirror
 * writes one: the flattened value has to be comparable to the document the
 * editor holds, key for key.
 */
const oneLineDocumentOf = (value: JSONContent, schema: Schema): JSONContent => {
  const content = oneLineContentOf(value.content, schema);

  return {
    type: 'doc',
    content: [
      content.length > 0
        ? { type: 'paragraph', content }
        : { type: 'paragraph' },
    ],
  };
};

/**
 * The flattened value as the editor will hold it.
 *
 * Only the comparison in the sync effect needs this: reading the flattened
 * document through the schema fills in the mark attributes a stored value can
 * leave out, so a host echoing its own value back settles instead of having
 * the document replaced on every pass. The document is a paragraph of text by
 * then, and the marks are the ones this schema has, so the read cannot fail
 * on a type it does not know. `createNodeFromContent` is the reader TipTap's
 * own `content` option uses, so both ways in agree.
 */
const asOneLine = (value: JSONContent, schema: Schema): JSONContent => {
  const flattened = oneLineDocumentOf(value, schema);
  const parsed = createNodeFromContent(flattened, schema, { slice: false });

  // A fragment only comes back from that reader's own empty-content fallback.
  return isProseMirrorFragment(parsed)
    ? flattened
    : (parsed.toJSON() as JSONContent);
};

export type { RichTextInsertMenu, RichTextInsertMenuItem };
export type {
  RichTextVersion,
  RichTextVersionsAttributes,
} from './richText/versionsNode';
export { VERSIONS_NODE };

const swallowKeystroke = () => true;

/**
 * The two ways a second line reaches a document the schema alone cannot
 * refuse.
 *
 * Enter is swallowed rather than left to fail: `splitBlock` cannot make a
 * second paragraph in `SingleLineDocument`, but ProseMirror then falls through
 * to inserting a hard break instead, which puts the line break back inside the
 * one paragraph. A keystroke that does nothing at all is what "one line"
 * means.
 *
 * Pasted content is flattened rather than clipped. ProseMirror fits what it
 * can of a slice the schema will not hold, which silently drops everything
 * after the first block; a researcher pasting two lines of a question meant
 * both, so the lines are joined with spaces.
 */
const SingleLineInput = Extension.create({
  name: 'singleLineInput',

  addKeyboardShortcuts() {
    return {
      'Enter': swallowKeystroke,
      'Shift-Enter': swallowKeystroke,
      'Mod-Enter': swallowKeystroke,
    };
  },

  addProseMirrorPlugins() {
    const { schema } = this.editor;

    return [
      new Plugin({
        key: new PluginKey('singleLineInput'),
        props: {
          // The last step of every paste, whichever flavour the clipboard
          // offered: plain text is parsed into paragraphs first, so
          // transforming the text as well would only do this twice.
          //
          // Through the same flattening a value goes through, so however a
          // line reaches this field a break is spelled the same way. The
          // round trip is safe in this direction: a pasted slice was parsed
          // with this schema, so everything in it can be read back.
          transformPasted: (slice: Slice) => {
            const pasted = slice.content.toJSON() as JSONContent[] | null;
            const nodes = oneLineContentOf(pasted, schema).map((node) =>
              schema.nodeFromJSON(node),
            );

            return nodes.length === 0
              ? Slice.empty
              : new Slice(Fragment.fromArray(nodes), 0, 0);
          },
        },
      }),
    ];
  },
});

type ExtensionOptions = {
  headingLevels: (1 | 2 | 3 | 4)[];
  /**
   * The level of the heading the field sits under, or 0 at the top of a page.
   * The text's own headings are its reader's outline, not the page's: an `h1`
   * in a field under a section's `h3` is a level-4 heading of the page, and
   * read as level 1 it would jump the outline back to the top and then skip
   * two levels at the next section. So each keeps its tag, which is how it
   * looks, and states its place below the enclosing heading as `aria-level`.
   */
  enclosingHeadingDepth: number;
  enableBulletList: boolean;
  enableOrderedList: boolean;
  enableLinks: boolean;
  enableThematicBreak: boolean;
  singleLine: boolean;
  placeholder?: string;
  tokens: readonly RichTextEditorToken[];
  versions: boolean;
  /** Typing this character opens the insert menu. */
  trigger?: string;
  /** Told when the trigger is typed, and where it now sits. */
  onTrigger: (editor: Editor, position: number) => void;
  /**
   * For a version's own editor: the history its edits belong to, the field's.
   * The version keeps none of its own, and its undo and redo keys act on the
   * field's, so an edit in a version is undone like any other.
   */
  history?: SharedHistory;
  /** Shows the placeholder while the editor cannot be edited, too. */
  placeholderWhenReadOnly?: boolean;
};

/** Undo and redo in an editor that keeps the history for another. */
type SharedHistory = Readonly<{
  undo: () => boolean;
  redo: () => boolean;
}>;

/** Hands the undo and redo keys to the editor that keeps the history. */
const createSharedHistoryKeys = (history: SharedHistory) =>
  Extension.create({
    name: 'sharedHistoryKeys',
    addKeyboardShortcuts() {
      return {
        'Mod-z': () => history.undo(),
        'Shift-Mod-z': () => history.redo(),
        'Mod-y': () => history.redo(),
      };
    },
  });

/**
 * Opens the insert menu when its trigger character is typed. The character
 * is typed as usual, so dismissing the menu keeps it; choosing an item
 * replaces it.
 */
const createInsertTrigger = (
  trigger: string,
  onTrigger: (editor: Editor, position: number) => void,
) =>
  Extension.create({
    name: 'insertMenuTrigger',
    addProseMirrorPlugins() {
      const { editor } = this;
      return [
        new Plugin({
          key: new PluginKey('insertMenuTrigger'),
          props: {
            handleTextInput: (_view, from, _to, text) => {
              if (text !== trigger) return false;
              // After the character is in: the menu replaces it if an item
              // is chosen.
              queueMicrotask(() => onTrigger(editor, from));
              return false;
            },
          },
        }),
      ];
    },
  });

// Factory function to create custom extensions with typography classes
function createCustomExtensions({
  headingLevels,
  enclosingHeadingDepth,
  enableBulletList,
  enableOrderedList,
  enableLinks,
  enableThematicBreak,
  singleLine,
  placeholder,
  tokens,
  versions,
  trigger,
  onTrigger,
  history,
  placeholderWhenReadOnly = false,
}: ExtensionOptions): AnyExtension[] {
  const CustomParagraph = Paragraph.extend({
    renderHTML({ HTMLAttributes }): DOMOutputSpec {
      return ['p', { ...HTMLAttributes, class: paragraphClasses }, 0];
    },
  });

  const CustomHeading = Heading.extend({
    renderHTML({ node, HTMLAttributes }): DOMOutputSpec {
      const level = typeof node.attrs.level === 'number' ? node.attrs.level : 1;
      const classMap: Record<number, string> = {
        1: h1Classes,
        2: h2Classes,
        3: h3Classes,
        4: h4Classes,
      };
      return [
        `h${level}`,
        {
          ...HTMLAttributes,
          class: classMap[level] ?? h1Classes,
          ...(enclosingHeadingDepth > 0
            ? { 'aria-level': String(enclosingHeadingDepth + level) }
            : {}),
        },
        0,
      ];
    },
  });

  const CustomBulletList = BulletList.extend({
    renderHTML({ HTMLAttributes }): DOMOutputSpec {
      return [
        'ul',
        { ...HTMLAttributes, class: 'ms-8 list-disc [&>li]:not-last:mb-2' },
        0,
      ];
    },
  });

  const CustomOrderedList = OrderedList.extend({
    renderHTML({ HTMLAttributes }): DOMOutputSpec {
      return [
        'ol',
        { ...HTMLAttributes, class: 'ms-8 list-decimal [&>li]:not-last:mb-2' },
        0,
      ];
    },
  });

  const extensions: AnyExtension[] = [
    StarterKit.configure({
      blockquote: false,
      // Replaced below, so the schema's top node holds one paragraph rather
      // than any run of blocks.
      ...(singleLine ? { document: false as const } : {}),
      paragraph: false,
      heading: false,
      bulletList: false,
      orderedList: false,
      code: false,
      codeBlock: false,
      horizontalRule: enableThematicBreak
        ? { HTMLAttributes: { class: 'my-4 border-current/30' } }
        : false,
      link: enableLinks
        ? {
            openOnClick: false,
            protocols: ['mailto'],
            HTMLAttributes: {
              class: 'text-link underline underline-offset-4',
              rel: 'noopener noreferrer',
              target: '_blank',
            },
          }
        : false,
      strike: false,
      underline: false,
      ...(history !== undefined && { undoRedo: false as const }),
    }),
    CustomParagraph,
  ];

  if (history !== undefined) {
    extensions.push(createSharedHistoryKeys(history));
  }

  if (singleLine) {
    extensions.push(SingleLineDocument, SingleLineInput);
  }

  if (tokens.length > 0) {
    extensions.push(createTokenNode(tokens));
  }

  if (versions) {
    extensions.push(VersionsNode);
  }

  if (trigger !== undefined && trigger !== '') {
    extensions.push(createInsertTrigger(trigger, onTrigger));
  }

  if (headingLevels.length > 0) {
    extensions.push(
      CustomHeading.configure({
        levels: headingLevels,
      }),
    );
  }

  if (enableBulletList) {
    extensions.push(CustomBulletList);
  }

  if (enableOrderedList) {
    extensions.push(CustomOrderedList);
  }

  if (placeholder) {
    extensions.push(
      Placeholder.configure({
        placeholder,
        showOnlyWhenEditable: !placeholderWhenReadOnly,
      }),
    );
  }

  return extensions;
}

const editorContainerOwnVariants = cva({
  base: 'flex h-auto w-full min-w-0 flex-col',
});

const editorContainerVariants = cva({
  composes: [
    controlVariants,
    inputControlVariants,
    stateVariants,
    interactiveStateVariants,
    editorContainerOwnVariants,
  ],
});

const toolbarStyles = cx(
  'bg-surface-1 text-surface-1-contrast publish-colors order-1 flex w-max min-w-full items-center gap-1 self-stretch border-b border-current/10 px-6 py-2',
);

const toolbarGroupStyles = cx('flex items-center');

const toolbarButtonStyles = iconButtonVariants({
  size: 'sm',
  color: 'dynamic',
  variant: 'text',
  className:
    'text-base data-pressed:bg-primary data-pressed:text-primary-contrast [&>.lucide]:h-[1.2em] [&>.lucide]:w-[1.2em] [&>.lucide]:[stroke-width:2.4]',
});

const toolbarSeparatorStyles = cx('mx-2 h-5 w-px shrink-0 bg-current/20');

const toolbarTokenButtonStyles = buttonVariants({
  size: 'sm',
  color: 'dynamic',
  variant: 'text',
  textStyle: 'default',
  className: 'h-10 gap-1 px-3 text-sm [&>.lucide]:size-4',
});

/**
 * Selects the versions element an insertion just placed, if it placed one, so
 * it opens at once for its versions to be written. `from` is where the
 * insertion began, and `replaced` how much of the line it replaced.
 */
const selectInsertedVersions = (
  editor: Editor,
  from: number,
  sizeBefore: number,
  replaced: number,
) => {
  if (editor.isDestroyed) return;
  const { doc } = editor.state;
  const to = Math.min(
    from + doc.content.size - sizeBefore + replaced,
    doc.content.size,
  );
  let found: number | undefined;
  doc.nodesBetween(from, to, (node, position) => {
    if (found !== undefined) return false;
    if (node.type.name !== VERSIONS_NODE) return true;
    found = position;
    return false;
  });
  if (found !== undefined) editor.chain().focus().setNodeSelection(found).run();
};

const editorContentVariants = cva({
  base: cx(
    'order-2 flex-1',
    'outline-none',
    '[&_.tiptap]:outline-none',
    // Placeholder styles
    '[&_.tiptap_p.is-editor-empty:first-child::before]:text-input-contrast/50',
    '[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none',
    '[&_.tiptap_p.is-editor-empty:first-child::before]:float-left',
    '[&_.tiptap_p.is-editor-empty:first-child::before]:h-0',
    '[&_.tiptap_p.is-editor-empty:first-child::before]:italic',
    '[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
  ),
  variants: {
    compact: {
      // The text area is at least as tall as the toolbar above it, so the
      // editor reads as two equal rows. The toolbar is a 40px icon button
      // (`h-10`) between 8px of padding (`py-2`) on each side, and a 1px
      // bottom border; the variable states those same terms. The single line
      // sits in the middle of the row, and the whole row is the `.tiptap`
      // element, so a click anywhere in it focuses the editor. Text that
      // wraps still grows the row.
      true: cx(
        'w-full px-6',
        '[--editable-min-h:calc(var(--spacing)*10+var(--spacing)*2*2+1px)]',
        'min-h-(--editable-min-h)',
        '[&>.tiptap]:grid [&>.tiptap]:min-h-(--editable-min-h) [&>.tiptap]:content-center',
      ),
      false: cx(multilineContentVariants(), '[&>.tiptap]:min-h-[120px]'),
    },
  },
});

type ToolbarOptions = {
  bold?: boolean;
  italic?: boolean;
  links?: boolean;
  headings?:
    | boolean
    | { h1?: boolean; h2?: boolean; h3?: boolean; h4?: boolean };
  lists?: boolean | { bullet?: boolean; ordered?: boolean };
  thematicBreak?: boolean;
  history?: boolean;
};

const defaultToolbarOptions: Required<ToolbarOptions> = {
  bold: true,
  italic: true,
  links: false,
  headings: true,
  lists: true,
  thematicBreak: false,
  history: true,
};

type ChangeMode = 'blur' | 'input';

type EditorSelectionRange = {
  from: number;
  to: number;
};

type RichTextEditorFieldProps = CreateFormFieldProps<
  JSONContent,
  'div',
  {
    'toolbarOptions'?: ToolbarOptions;
    'changeMode'?: ChangeMode;
    'autoFocus'?: boolean;
    'placeholder'?: string;
    /**
     * Holds the value to one line: the document is a single paragraph, Enter
     * and Shift-Enter do nothing, and pasted lines arrive joined by spaces.
     * The block controls go with it — a heading, a list or a rule cannot be
     * made in this schema, so the toolbar does not offer one.
     */
    'singleLine'?: boolean;
    /**
     * For a field that holds a short label, not a prompt or a passage: the
     * text area is one line tall, as tall as the toolbar above it, rather than
     * the 120px box a multi-line editor opens at. Implies `singleLine`, since
     * a compact multi-line editor makes no sense. `singleLine` alone changes
     * only the value, never the height.
     */
    'compact'?: boolean;
    /**
     * Placeholders the text can hold, such as a person's name filled in
     * later. Each shows as a chip in the text, and the toolbar offers a
     * button to insert each at the caret. The value holds one as
     * `{ type: 'token', attrs: { id } }` among the paragraph's text.
     */
    'tokens'?: readonly RichTextEditorToken[];
    /**
     * Whether the text can hold versions: a piece of text that reads
     * differently in different cases, each case edited in place (see
     * `RichTextVersionsAttributes`). The consumer builds them, usually through
     * the insert menu.
     */
    'versions'?: boolean;
    /** A searchable menu of things to insert at the caret. */
    'insertMenu'?: RichTextInsertMenu;
    'id': string;
    'name': string;
    'aria-describedby': string;
  }
>;

const NO_HEADINGS = { h1: false, h2: false, h3: false, h4: false };
const NO_LISTS = { bullet: false, ordered: false };

// Helper to normalize toolbar options into a flat structure
function normalizeToolbarOptions(options?: ToolbarOptions, singleLine = false) {
  const merged = { ...defaultToolbarOptions, ...options };

  const headings =
    typeof merged.headings === 'boolean'
      ? {
          h1: merged.headings,
          h2: merged.headings,
          h3: merged.headings,
          h4: merged.headings,
        }
      : { h1: true, h2: true, h3: true, h4: true, ...merged.headings };

  const lists =
    typeof merged.lists === 'boolean'
      ? { bullet: merged.lists, ordered: merged.lists }
      : { bullet: true, ordered: true, ...merged.lists };

  return {
    bold: merged.bold ?? true,
    italic: merged.italic ?? true,
    // A single-line document has no room for a block. The schema refuses one,
    // so a heading or list button there is a control that does nothing.
    headings: singleLine ? NO_HEADINGS : headings,
    lists: singleLine ? NO_LISTS : lists,
    links: merged.links ?? false,
    thematicBreak: singleLine ? false : (merged.thematicBreak ?? false),
    history: merged.history ?? true,
  };
}

export default function RichTextEditorField({
  id,
  name,
  value,
  onChange,
  disabled,
  readOnly,
  toolbarOptions,
  changeMode = 'blur',
  autoFocus = false,
  placeholder,
  singleLine: singleLineProp = false,
  compact = false,
  tokens: tokensProp,
  versions = false,
  insertMenu,
  className,
  onFocus,
  onBlur,
  ...props
}: RichTextEditorFieldProps) {
  const singleLine = singleLineProp || compact;
  const intl = useAppIntl();
  const onChangeRef = useRef(onChange);
  // Where the insert menu was opened by typing its trigger: the editor, and
  // where the character sits. Null while it is closed or opened from the
  // toolbar.
  const [triggered, setTriggered] = useState<{
    editor: Editor;
    position: number;
    anchor: { left: number; top: number; height: number };
  } | null>(null);
  const [isInsertMenuOpen, setIsInsertMenuOpen] = useState(false);
  // The editor an item from the insert menu was just put into. Closing the
  // menu hands it the caret, so the next key, Undo included, acts on the
  // text the item went into rather than on the button that opened the menu.
  const pickedIntoRef = useRef<Editor | null>(null);
  const onTrigger = useCallback(
    (typedIn: Editor, position: number) => {
      const coords = typedIn.view.coordsAtPos(position);
      setTriggered({
        editor: typedIn,
        position,
        anchor: {
          left: coords.left,
          top: coords.top,
          height: coords.bottom - coords.top,
        },
      });
      pickedIntoRef.current = null;
      setIsInsertMenuOpen(true);
    },
    [setTriggered, setIsInsertMenuOpen],
  );
  // The version being written, when the caret is in one: the toolbar acts on
  // it rather than on the line around it.
  const [versionEditor, setVersionEditor] = useState<Editor | null>(null);
  const changeModeRef = useRef(changeMode);
  const linkSelectionRef = useRef<EditorSelectionRange | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [linkHref, setLinkHref] = useState('');
  const [linkValidationMessage, setLinkValidationMessage] = useState('');
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false);
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // Whether the researcher is working in the field: its text, a version's
  // own editor, its toolbar, or a menu the toolbar opened. Followed through
  // React's focus events, which reach the field from a menu drawn elsewhere
  // in the page, and settled a task later, since focus moving between two of
  // these blurs one before it focuses the other. Expanded versions fold back
  // to their pill once it is false.
  const [isActive, setIsActive] = useState(false);
  const inactiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (inactiveTimerRef.current !== null) {
        clearTimeout(inactiveTimerRef.current);
      }
    },
    [],
  );
  const options = normalizeToolbarOptions(toolbarOptions, singleLine);
  // By what they say rather than by identity or order: a host passing a
  // fresh array on every render, or the same placeholders in another order,
  // would otherwise rebuild the editor, and a rebuilt editor starts its undo
  // history again. Inserting a value from the menu reorders the host's list
  // as the value is bound, so Undo found nothing to undo. The editor holds
  // only what a pill shows; which are required is the toolbar's.
  const tokensKey = JSON.stringify(
    (tokensProp ?? [])
      .map(({ id: tokenId, label, text }) => ({
        id: tokenId,
        label,
        ...(text !== undefined && { text }),
      }))
      .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
  const tokens = useMemo(
    (): readonly RichTextEditorToken[] =>
      JSON.parse(tokensKey) as RichTextEditorToken[],
    [tokensKey],
  );
  const requiredTokens = new Set(
    (tokensProp ?? []).flatMap((token) =>
      token.required === true ? [token.id] : [],
    ),
  );
  const editorId = id ?? name ?? 'rich-text-editor';
  const editorName = name ?? editorId;
  const linkInputId = `${editorId}-link-url`;
  const linkErrorId = `${linkInputId}-error`;
  const ariaDescribedBy = props['aria-describedby'];
  const ariaInvalid = props['aria-invalid'];
  const ariaLabel = props['aria-label'];
  const ariaLabelledBy = props['aria-labelledby'];
  const ariaRequired = props['aria-required'];

  onChangeRef.current = onChange;
  changeModeRef.current = changeMode;

  // Whether the FIELD is unavailable — read-only, or disabled while its form
  // submits. Read by a hook below, so it is worked out before the early
  // return rather than beside the toolbar that shows it.
  const isDisabled = Boolean(disabled) || Boolean(readOnly);

  const inputState = getInputState({
    disabled,
    readOnly,
    'aria-invalid': ariaInvalid,
  });
  const editorAttributes = useMemo<Record<string, string>>(() => {
    const attributes: Record<string, string> = {
      'role': 'textbox',
      // Enter does not open a line in a single-line document, and a screen
      // reader tells its user which of the two this box is before they try.
      'aria-multiline': singleLine ? 'false' : 'true',
      'name': editorName,
      'id': editorId,
    };

    if (ariaLabelledBy) {
      attributes['aria-labelledby'] = ariaLabelledBy;
    } else {
      attributes['aria-label'] = ariaLabel ?? editorName;
    }

    if (ariaDescribedBy) {
      attributes['aria-describedby'] = ariaDescribedBy;
    }

    if (ariaInvalid || inputState === 'invalid') {
      attributes['aria-invalid'] = 'true';
    }

    if (ariaRequired) {
      attributes['aria-required'] = 'true';
    }

    if (disabled) {
      attributes['aria-disabled'] = 'true';
    }

    if (readOnly) {
      attributes['aria-readonly'] = 'true';
    }

    if (placeholder) {
      attributes['aria-placeholder'] = placeholder;
      attributes['data-placeholder'] = placeholder;
    }

    return attributes;
  }, [
    ariaDescribedBy,
    ariaInvalid,
    ariaLabel,
    ariaLabelledBy,
    ariaRequired,
    disabled,
    editorId,
    editorName,
    inputState,
    placeholder,
    readOnly,
    singleLine,
  ]);

  // Compute which heading levels are enabled
  const headingLevels = useMemo(
    () =>
      (
        [
          options.headings.h1 && 1,
          options.headings.h2 && 2,
          options.headings.h3 && 3,
          options.headings.h4 && 4,
        ] as const
      ).filter((level): level is 1 | 2 | 3 | 4 => typeof level === 'number'),
    [
      options.headings.h1,
      options.headings.h2,
      options.headings.h3,
      options.headings.h4,
    ],
  );
  const enclosingHeadingLevel = useEnclosingHeadingLevel();
  const enclosingHeadingDepth =
    enclosingHeadingLevel === null ? 0 : Number(enclosingHeadingLevel.slice(1));
  const editorExtensions = useMemo(
    () =>
      createCustomExtensions({
        headingLevels,
        enclosingHeadingDepth,
        enableBulletList: options.lists.bullet,
        enableOrderedList: options.lists.ordered,
        enableLinks: options.links,
        enableThematicBreak: options.thematicBreak,
        singleLine,
        placeholder,
        tokens,
        versions,
        trigger: insertMenu?.trigger,
        onTrigger,
      }),
    [
      headingLevels,
      enclosingHeadingDepth,
      options.lists.bullet,
      options.lists.ordered,
      options.links,
      options.thematicBreak,
      singleLine,
      placeholder,
      tokens,
      versions,
      insertMenu?.trigger,
      onTrigger,
    ],
  );
  // The field's own editor, once there is one: it keeps the history of every
  // edit, those made in a version's own editor included.
  const fieldEditorRef = useRef<Editor | null>(null);
  const sharedHistory = useMemo((): SharedHistory => {
    const inField = (step: 'undo' | 'redo') => () => {
      const field = fieldEditorRef.current;
      if (field === null || field.isDestroyed) return false;
      const done = field.commands[step]();
      // A step that takes away the version the caret was in hands the caret
      // to the line, once the version's editor has gone.
      setTimeout(() => {
        const active = document.activeElement;
        if (field.isDestroyed) return;
        if (active === null || active === document.body) {
          field.commands.focus();
        }
      }, 0);
      return done;
    };
    return { undo: inField('undo'), redo: inField('redo') };
  }, []);
  const emptyVersionText = intl.formatMessage(messages.emptyVersion);
  // What each version of a piece of text is edited with: everything the
  // field's own line can hold, on one line. A version has no history of its
  // own: an edit in it is an edit of the field's line, undone from either.
  // An empty version says that it shows nothing, which is a choice the text
  // can make, such as leaving out a greeting's name when it is not known.
  const versionExtensions = useMemo(
    () =>
      versions
        ? createCustomExtensions({
            headingLevels: [],
            // A version holds no headings, so none needs re-levelling.
            enclosingHeadingDepth: 0,
            enableBulletList: false,
            enableOrderedList: false,
            enableLinks: options.links,
            enableThematicBreak: false,
            singleLine: true,
            placeholder: emptyVersionText,
            placeholderWhenReadOnly: true,
            tokens,
            versions,
            trigger: insertMenu?.trigger,
            onTrigger,
            history: sharedHistory,
          })
        : [],
    [
      options.links,
      tokens,
      versions,
      insertMenu?.trigger,
      onTrigger,
      sharedHistory,
      emptyVersionText,
    ],
  );
  const caretAnchorRef = useRef<HTMLSpanElement>(null);
  const nestedEditing = useMemo(
    () => ({
      extensions: versionExtensions,
      editable: !disabled && !readOnly,
      onFocusEditor: setVersionEditor,
      active: isActive,
    }),
    [versionExtensions, disabled, readOnly, setVersionEditor, isActive],
  );
  // The schema these extensions make, worked out before there is an editor to
  // ask. A value has to be flattened against the marks the field will actually
  // have, and the first value is read while the editor is being built.
  const editorSchema = useMemo(
    () => getSchema(editorExtensions),
    [editorExtensions],
  );

  // What the field holds and the host has not been told about. `changeMode`
  // decides how long that lasts: on `input` it is over as soon as the update
  // is reported, and on `blur` it lasts until the caret leaves. For as long
  // as it lasts, this is the only copy of the researcher's typing there is.
  const unemittedDocumentRef = useRef<JSONContent | null>(null);
  const syncedEditorRef = useRef<Editor | null>(null);
  // Changing what the field offers rebuilds the editor around a new schema,
  // and it is rebuilt from what the field holds — which on `changeMode="blur"`
  // is a whole sentence ahead of `value` by design. Seeding the replacement
  // from the value instead threw that sentence away mid-edit.
  const seed = unemittedDocumentRef.current ?? value;
  // Where focus was as the field appeared. The editor takes `autoFocus` a
  // tick after it mounts, and focus that has moved on meanwhile — to a field
  // the researcher clicked, say — is theirs, not the editor's to take back.
  const [focusAtMount] = useState(() =>
    typeof document === 'undefined' ? null : document.activeElement,
  );

  const editor = useEditor(
    {
      editorProps: {
        attributes: editorAttributes,
      },
      extensions: editorExtensions,
      // Flattened here rather than after the editor exists: `useEditor` reads
      // this option itself, and reading a value with a block the single-line
      // schema has no type for is what loses it. `onCreate` is too late twice
      // over — it fires a tick after the field has painted, and by then the
      // document it would flatten is already empty.
      content:
        seed === undefined
          ? seed
          : singleLine
            ? oneLineDocumentOf(seed, editorSchema)
            : documentInSchema(seed, editorSchema),
      editable: !disabled && !readOnly,
      autofocus: false,
      onCreate: ({ editor: created }) => {
        if (!autoFocus) return;
        const active = document.activeElement;
        const focusMovedOn =
          active !== null &&
          active !== document.body &&
          active !== focusAtMount &&
          !created.view.dom.contains(active);
        if (focusMovedOn) return;
        // Here and now: the focus command waits another frame, by when the
        // researcher may already be somewhere else.
        const { state, view } = created;
        view.dispatch(state.tr.setSelection(Selection.atEnd(state.doc)));
        view.focus();
      },
      onUpdate: ({ editor: updateEditor }) => {
        const updated = updateEditor.getJSON();

        if (changeModeRef.current === 'input') {
          unemittedDocumentRef.current = null;
          onChangeRef.current?.(updated);
          return;
        }

        unemittedDocumentRef.current = updated;
      },
      onFocus: () => {
        setVersionEditor(null);
      },
      onBlur: ({ editor: blurEditor }) => {
        if (changeModeRef.current === 'blur') {
          unemittedDocumentRef.current = null;
          onChangeRef.current?.(blurEditor.getJSON());
        }
      },
    },
    [autoFocus, editorExtensions],
  );
  fieldEditorRef.current = editor;

  const target =
    versionEditor !== null && !versionEditor.isDestroyed
      ? versionEditor
      : editor;

  // Track editor state changes to update toolbar button states
  const editorState = useEditorState({
    editor: target,
    selector: ({ editor: e }) => ({
      isBold: e?.isActive('bold') ?? false,
      isItalic: e?.isActive('italic') ?? false,
      isH1: e?.isActive('heading', { level: 1 }) ?? false,
      isH2: e?.isActive('heading', { level: 2 }) ?? false,
      isH3: e?.isActive('heading', { level: 3 }) ?? false,
      isH4: e?.isActive('heading', { level: 4 }) ?? false,
      isLink: e?.isActive('link') ?? false,
      isBulletList: e?.isActive('bulletList') ?? false,
      isOrderedList: e?.isActive('orderedList') ?? false,
      placedTokens: editor === null ? '' : placedTokenIds(editor.state.doc),
    }),
  });
  // The field's editor keeps the history, of edits in its versions too.
  const historyState = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });
  const placedTokens = new Set(editorState.placedTokens.split('\n'));

  useEffect(() => {
    // A destroyed editor keeps its last document but nothing to change it
    // with: `destroy` drops the schema and the command manager. Changing what
    // the field offers — the single-line restriction included — rebuilds the
    // editor, and this effect runs once more against the outgoing one before
    // the new one arrives.
    if (!editor || editor.isDestroyed) return;

    const rebuilt = syncedEditorRef.current !== editor;
    syncedEditorRef.current = editor;

    // A rebuild that carried edits the host has not seen: the field now holds
    // a document the outgoing schema could not express — the researcher's own
    // words, flattened. Report it, and reconcile nothing this pass. `value` is
    // what the host held a keystroke ago, and comparing against it here is
    // what threw those words away.
    if (rebuilt && unemittedDocumentRef.current !== null) {
      unemittedDocumentRef.current = null;
      onChangeRef.current?.(editor.getJSON());
      return;
    }

    if (value === undefined) {
      if (!editor.isEmpty) {
        editor.commands.clearContent(false);
      }
      return;
    }

    // Don't overwrite the editor mid-edit; the effect re-runs on blur
    // (isFocused is a dependency) to apply any value change deferred here.
    if (isFocused) return;

    // The document comparison is the ONLY guard. A one-shot "ignore the next
    // sync" flag used to sit here as well, meant to swallow the echo of this
    // editor's own emission — but the echo is already a no-op below, and the
    // flag swallowed whichever sync happened to arrive next, which need not be
    // that echo. A host clearing or replacing the value from outside was
    // silently discarded, and the editor went on showing a document the form
    // store no longer held (#1393). Keying the flag on the emitted document
    // instead is no better: it then refuses a host that legitimately sends the
    // same document back, which is exactly what undo-then-redo does.
    // Compared as the editor will hold it, not as the host sent it: a
    // single-line field flattens what it is given, so a host that keeps
    // sending two paragraphs would otherwise never match and the document
    // would be replaced again on every pass.
    const incoming = singleLine
      ? asOneLine(value, editor.schema)
      : documentInSchema(value, editor.schema);
    const currentContent = JSON.stringify(editor.getJSON());
    const newContent = JSON.stringify(incoming);
    if (currentContent !== newContent) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [editor, value, isFocused, singleLine]);

  // A LAYOUT effect: the editable flag lives in the DOM as `contenteditable`,
  // and a non-editable ProseMirror node carries no tabindex, so it cannot take
  // focus at all. `useForm` sends focus to the first errored control from a
  // layout effect of its own; a passive effect here would still be holding
  // `contenteditable="false"` from the submitting render at that moment, and
  // the focus call would silently land on `<body>`. Child layout effects run
  // before the form's, so this puts the DOM back in step first.
  useLayoutEffect(() => {
    if (editor) {
      // `emitUpdate: false` — becoming disabled or read-only is not an edit.
      // TipTap's `setEditable` emits an update by default, which reported the
      // editor's current document back to the host as a change. Every form
      // disables its fields while submitting, so that turned a submit into a
      // write of whatever the editor happened to be showing — resurrecting a
      // value the host had already replaced.
      editor.setEditable(!disabled && !readOnly, false);
    }
  }, [editor, disabled, readOnly]);

  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: editorAttributes,
        },
      });
    }
  }, [editor, editorAttributes]);

  // A popover outlives the button that opened it. Disabling the trigger says
  // nothing about the panel already on screen: its URL box and its Apply and
  // Remove buttons are in a portal of their own, and they went on running
  // editor commands against a field the host had just made read-only —
  // reporting the result back as a change a researcher had made. So the
  // popover is closed when the field stops being one anybody can edit.
  // Adjusted during render rather than after a commit: the panel is gone in
  // the same paint that disables the field, and cannot reappear on re-enable.
  if (isDisabled && (isLinkPopoverOpen || linkValidationMessage !== '')) {
    setIsLinkPopoverOpen(false);
    setLinkValidationMessage('');
  }

  if (!editor) {
    return null;
  }

  const actOn = target ?? editor;
  // A version's line is a single line of inline text, so headings, lists and
  // rules only apply to the text around it.
  const blocksEditable = actOn === editor;

  const getActiveFormattingValues = () => {
    const values: string[] = [];
    if (editorState.isBold) values.push('bold');
    if (editorState.isItalic) values.push('italic');
    return values;
  };

  const getActiveHeadingValue = () => {
    if (editorState.isH1) return ['h1'];
    if (editorState.isH2) return ['h2'];
    if (editorState.isH3) return ['h3'];
    if (editorState.isH4) return ['h4'];
    return [];
  };

  const getActiveListValue = () => {
    if (editorState.isBulletList) return ['bullet'];
    if (editorState.isOrderedList) return ['ordered'];
    return [];
  };

  const prepareLinkPopoverState = () => {
    const previousHref = actOn.getAttributes('link').href;
    const { from, to } = actOn.state.selection;

    linkSelectionRef.current = { from, to };
    setLinkHref(typeof previousHref === 'string' ? previousHref : '');
    setIsEditingExistingLink(typeof previousHref === 'string');
    setLinkValidationMessage('');
  };

  const setLinkPopoverOpen = (open: boolean) => {
    if (open) {
      prepareLinkPopoverState();
    }

    if (!open) {
      setLinkValidationMessage('');
    }

    setIsLinkPopoverOpen(open);
  };

  const restoreLinkSelection = ({
    extendLinkRange = false,
  }: { extendLinkRange?: boolean } = {}) => {
    const selection = linkSelectionRef.current;
    const chain = actOn.chain().focus();

    if (selection) {
      chain.setTextSelection(selection);
    }

    if (extendLinkRange) {
      return chain.extendMarkRange('link');
    }

    return chain;
  };

  const applyLink = () => {
    const linkInput = linkInputRef.current;

    if (linkInput && !linkInput.checkValidity()) {
      setLinkValidationMessage(linkInput.validationMessage);
      linkInput.reportValidity();
      return;
    }

    const trimmedHref = (linkInputRef.current?.value ?? linkHref).trim();

    restoreLinkSelection({
      extendLinkRange: isEditingExistingLink,
    })
      .setLink({ href: trimmedHref })
      .run();

    setLinkValidationMessage('');
    setIsLinkPopoverOpen(false);
  };

  const removeLink = () => {
    restoreLinkSelection({ extendLinkRange: true }).unsetLink().run();
    setLinkHref('');
    setIsEditingExistingLink(false);
    setIsLinkPopoverOpen(false);
  };

  const selectLinkForEditing = () => {
    prepareLinkPopoverState();
  };

  // The formatting CLUSTER (drives separators and toolbar presence) versus
  // the toggle GROUP inside it: links render as a toolbar-level sibling of
  // the toggles, so a links-only toolbar must not mount an empty group.
  const showFormattingToggles = options.bold || options.italic;
  const showTextFormatting = showFormattingToggles || options.links;
  const showHeadings = headingLevels.length > 0;
  const showLists = options.lists.bullet || options.lists.ordered;
  const showThematicBreak = options.thematicBreak;
  const toolbarTokens = (tokensProp ?? []).filter(
    ({ inToolbar }) => inToolbar !== false,
  );
  const showTokens = toolbarTokens.length > 0 || insertMenu !== undefined;

  const insertItem = (item: RichTextInsertMenuItem) => {
    if (item.disabled === true) return;
    const content = Array.isArray(item.content)
      ? [...(item.content as readonly JSONContent[])]
      : (item.content as JSONContent);
    if (triggered !== null && !triggered.editor.isDestroyed) {
      const { editor: into, position } = triggered;
      // The trigger the menu was opened by is replaced, if it is still there.
      const typed =
        into.state.doc.textBetween(
          position,
          Math.min(position + 1, into.state.doc.content.size),
        ) === insertMenu?.trigger;
      const sizeBefore = into.state.doc.content.size;
      into
        .chain()
        .focus()
        .insertContentAt(
          typed ? { from: position, to: position + 1 } : position,
          content,
        )
        .run();
      selectInsertedVersions(into, position, sizeBefore, typed ? 1 : 0);
      pickedIntoRef.current = into;
    } else {
      const { from, to } = actOn.state.selection;
      const sizeBefore = actOn.state.doc.content.size;
      actOn.chain().focus().insertContent(content).run();
      selectInsertedVersions(actOn, from, sizeBefore, to - from);
      pickedIntoRef.current = actOn;
    }
    setTriggered(null);
    setIsInsertMenuOpen(false);
  };
  const showHistory = options.history;
  // Undone or redone in the field's history, with the caret handed back to
  // the editor it was in: a version's, while that version is still there.
  const actInHistory = (step: 'undo' | 'redo') => {
    if (actOn === editor) {
      editor.chain().focus()[step]().run();
      return;
    }
    editor.commands[step]();
    if (!actOn.isDestroyed) actOn.commands.focus();
  };

  // Track which groups are visible for separator logic
  const visibleGroups = [
    showTextFormatting,
    showHeadings,
    showLists,
    showThematicBreak,
    showTokens,
    showHistory,
  ].filter(Boolean);
  const hasToolbar = visibleGroups.length > 0;

  return (
    <div
      className={editorContainerVariants({
        state: inputState,
        className,
      })}
      onFocus={(event) => {
        if (inactiveTimerRef.current !== null) {
          clearTimeout(inactiveTimerRef.current);
          inactiveTimerRef.current = null;
        }
        setIsActive(true);
        setIsFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        if (inactiveTimerRef.current !== null) {
          clearTimeout(inactiveTimerRef.current);
        }
        inactiveTimerRef.current = setTimeout(() => {
          inactiveTimerRef.current = null;
          setIsActive(false);
          // The version folds but stays mounted, so the toolbar would go on
          // acting on its hidden text the next time it is used directly.
          setVersionEditor(null);
        }, 0);
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        // An edit in a version's own editor reaches the field's document
        // while the caret is in the version, after the field's editor has
        // already lost focus to it, so that editor's blur never reports it.
        // Leaving the field as a whole does.
        const pending = unemittedDocumentRef.current;
        if (changeModeRef.current === 'blur' && pending !== null) {
          unemittedDocumentRef.current = null;
          onChangeRef.current?.(pending);
        }
        setIsFocused(false);
        onBlur?.(event);
      }}
    >
      <NestedEditingContext.Provider value={nestedEditing}>
        <EditorContent
          editor={editor}
          className={editorContentVariants({ compact })}
        />
      </NestedEditingContext.Provider>
      {triggered !== null && (
        // Where the trigger was typed, for the insert menu to open beside.
        <span
          ref={caretAnchorRef}
          aria-hidden
          className="pointer-events-none fixed w-0"
          style={{
            left: triggered.anchor.left,
            top: triggered.anchor.top,
            height: triggered.anchor.height,
          }}
        />
      )}
      {hasToolbar && (
        <FieldUnavailableContext.Provider value={isDisabled}>
          <Toolbar.Root className={toolbarStyles}>
            {showFormattingToggles && (
              // One element carrying both the toolbar-group and toggle-group
              // behaviours: a ToggleGroup nested inside a Toolbar.Group wrapper
              // renders two nested `group` roles announcing nothing new.
              <Toolbar.Group
                className={toolbarGroupStyles}
                render={
                  <ToggleGroup
                    value={getActiveFormattingValues()}
                    onValueChange={(values: string[]) => {
                      const shouldBeBold = values.includes('bold');
                      const shouldBeItalic = values.includes('italic');

                      if (shouldBeBold !== editorState.isBold) {
                        actOn.chain().focus().toggleBold().run();
                      }
                      if (shouldBeItalic !== editorState.isItalic) {
                        actOn.chain().focus().toggleItalic().run();
                      }
                    }}
                    multiple
                  />
                }
              >
                {options.bold && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled}
                    value="bold"
                    aria-label={intl.formatMessage(messages.bold)}
                  >
                    <Bold />
                  </ToolbarToggleButton>
                )}
                {options.italic && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled}
                    value="italic"
                    aria-label={intl.formatMessage(messages.italic)}
                  >
                    <Italic />
                  </ToolbarToggleButton>
                )}
              </Toolbar.Group>
            )}
            {/* A toolbar-level sibling of the formatting toggles: it is not a
                toggle, so it does not belong inside their group element. */}
            {options.links && (
              <Popover
                // Closed by the render that makes the field unavailable, not
                // by the effect that follows it: an effect leaves one commit
                // in which the panel is on screen with its controls live.
                open={isLinkPopoverOpen && !isDisabled}
                onOpenChange={setLinkPopoverOpen}
              >
                {/*
                    The trigger is told as well as the button it renders. A
                    disclosure works out its own availability, and this one
                    used to work out that it was available while every one of
                    its siblings was not: `aria-disabled="false"`, undimmed,
                    and ready to open on a press.
                */}
                <PopoverTrigger asChild disabled={isDisabled}>
                  <ToolbarButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled}
                    aria-label={intl.formatMessage(messages.linkButton, {
                      hasLink: String(editorState.isLink),
                    })}
                    // No `aria-pressed`: PopoverTrigger makes this a
                    // disclosure, and a disclosure must not also claim to be
                    // a toggle. Whether a link is present is already carried
                    // by the accessible name above; `data-pressed` drives the
                    // selected styling without asserting an ARIA state.
                    data-pressed={editorState.isLink ? true : undefined}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectLinkForEditing();
                    }}
                  >
                    <Link />
                  </ToolbarButton>
                </PopoverTrigger>
                <PopoverContent align="start" side="bottom" className="w-80">
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      applyLink();
                    }}
                  >
                    <label
                      className="font-heading text-sm font-bold"
                      htmlFor={linkInputId}
                    >
                      {intl.formatMessage(messages.linkUrlLabel)}
                    </label>
                    <InputField
                      ref={linkInputRef}
                      id={linkInputId}
                      name={linkInputId}
                      type="url"
                      required
                      value={linkHref}
                      onChange={(nextHref) => {
                        setLinkHref(nextHref ?? '');
                        setLinkValidationMessage('');
                      }}
                      onInvalid={(event) => {
                        setLinkValidationMessage(
                          event.currentTarget.validationMessage,
                        );
                      }}
                      placeholder={intl.formatMessage(
                        messages.linkUrlPlaceholder,
                      )}
                      size="sm"
                      autoFocus
                      aria-invalid={Boolean(linkValidationMessage)}
                      aria-describedby={
                        linkValidationMessage ? linkErrorId : undefined
                      }
                    />
                    <div
                      id={linkErrorId}
                      className="text-destructive-ink min-h-5 text-sm leading-snug"
                      aria-live="polite"
                    >
                      {linkValidationMessage}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="text"
                        color="destructive"
                        icon={<Trash2 />}
                        aria-label={intl.formatMessage(messages.removeLink)}
                        disabled={!isEditingExistingLink}
                        onClick={removeLink}
                      >
                        {intl.formatMessage(messages.removeLinkShort)}
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        color="primary"
                        icon={<Check />}
                        aria-label={intl.formatMessage(messages.applyLink)}
                        onClick={(event) => {
                          event.preventDefault();
                          applyLink();
                        }}
                      >
                        {intl.formatMessage(messages.applyLinkShort)}
                      </Button>
                    </div>
                  </form>
                </PopoverContent>
              </Popover>
            )}

            {showTextFormatting && showHeadings && (
              <Toolbar.Separator className={toolbarSeparatorStyles} />
            )}

            {showHeadings && (
              <Toolbar.Group
                className={toolbarGroupStyles}
                render={
                  <ToggleGroup
                    value={getActiveHeadingValue()}
                    onValueChange={(values: string[]) => {
                      const newValue = values[0];
                      if (newValue === 'h1') {
                        actOn.chain().focus().toggleHeading({ level: 1 }).run();
                      } else if (newValue === 'h2') {
                        actOn.chain().focus().toggleHeading({ level: 2 }).run();
                      } else if (newValue === 'h3') {
                        actOn.chain().focus().toggleHeading({ level: 3 }).run();
                      } else if (newValue === 'h4') {
                        actOn.chain().focus().toggleHeading({ level: 4 }).run();
                      } else {
                        if (editorState.isH1) {
                          actOn
                            .chain()
                            .focus()
                            .toggleHeading({ level: 1 })
                            .run();
                        } else if (editorState.isH2) {
                          actOn
                            .chain()
                            .focus()
                            .toggleHeading({ level: 2 })
                            .run();
                        } else if (editorState.isH3) {
                          actOn
                            .chain()
                            .focus()
                            .toggleHeading({ level: 3 })
                            .run();
                        } else if (editorState.isH4) {
                          actOn
                            .chain()
                            .focus()
                            .toggleHeading({ level: 4 })
                            .run();
                        }
                      }
                    }}
                  />
                }
              >
                {options.headings.h1 && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled || !blocksEditable}
                    value="h1"
                    aria-label={intl.formatMessage(messages.heading1)}
                  >
                    <Heading1 />
                  </ToolbarToggleButton>
                )}
                {options.headings.h2 && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled || !blocksEditable}
                    value="h2"
                    aria-label={intl.formatMessage(messages.heading2)}
                  >
                    <Heading2 />
                  </ToolbarToggleButton>
                )}
                {options.headings.h3 && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled || !blocksEditable}
                    value="h3"
                    aria-label={intl.formatMessage(messages.heading3)}
                  >
                    <Heading3 />
                  </ToolbarToggleButton>
                )}
                {options.headings.h4 && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled || !blocksEditable}
                    value="h4"
                    aria-label={intl.formatMessage(messages.heading4)}
                  >
                    <Heading4 />
                  </ToolbarToggleButton>
                )}
              </Toolbar.Group>
            )}

            {(showTextFormatting || showHeadings) && showLists && (
              <Toolbar.Separator className={toolbarSeparatorStyles} />
            )}

            {showLists && (
              <Toolbar.Group
                className={toolbarGroupStyles}
                render={
                  <ToggleGroup
                    value={getActiveListValue()}
                    onValueChange={(values: string[]) => {
                      const newValue = values[0];
                      if (newValue === 'bullet') {
                        if (!editorState.isBulletList) {
                          actOn.chain().focus().toggleBulletList().run();
                        }
                      } else if (newValue === 'ordered') {
                        if (!editorState.isOrderedList) {
                          actOn.chain().focus().toggleOrderedList().run();
                        }
                      } else {
                        if (editorState.isBulletList) {
                          actOn.chain().focus().toggleBulletList().run();
                        } else if (editorState.isOrderedList) {
                          actOn.chain().focus().toggleOrderedList().run();
                        }
                      }
                    }}
                  />
                }
              >
                {options.lists.ordered && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled || !blocksEditable}
                    value="ordered"
                    aria-label={intl.formatMessage(messages.numberedList)}
                  >
                    <ListOrdered />
                  </ToolbarToggleButton>
                )}
                {options.lists.bullet && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled || !blocksEditable}
                    value="bullet"
                    aria-label={intl.formatMessage(messages.bulletList)}
                  >
                    <List />
                  </ToolbarToggleButton>
                )}
              </Toolbar.Group>
            )}

            {(showTextFormatting || showHeadings || showLists) &&
              showThematicBreak && (
                <Toolbar.Separator className={toolbarSeparatorStyles} />
              )}

            {showThematicBreak && (
              <Toolbar.Group className={toolbarGroupStyles}>
                <ToolbarButton
                  className={toolbarButtonStyles}
                  disabled={isDisabled || !blocksEditable}
                  aria-label={intl.formatMessage(messages.thematicBreak)}
                  onClick={() =>
                    actOn.chain().focus().setHorizontalRule().run()
                  }
                >
                  <Minus />
                </ToolbarButton>
              </Toolbar.Group>
            )}

            {(showTextFormatting ||
              showHeadings ||
              showLists ||
              showThematicBreak) &&
              showTokens && (
                <Toolbar.Separator className={toolbarSeparatorStyles} />
              )}

            {showTokens && (
              <Toolbar.Group
                className={toolbarGroupStyles}
                aria-label={intl.formatMessage(messages.tokens)}
              >
                {insertMenu !== undefined && (
                  <Popover
                    open={isInsertMenuOpen && !isDisabled}
                    onOpenChange={(open) => {
                      setIsInsertMenuOpen(open);
                      if (open) pickedIntoRef.current = null;
                      if (!open) setTriggered(null);
                    }}
                  >
                    <Tooltip>
                      <PopoverTrigger
                        asChild
                        nativeButton
                        disabled={isDisabled}
                      >
                        <TooltipTrigger
                          render={
                            <ToolbarButton
                              className={toolbarButtonStyles}
                              disabled={isDisabled}
                              aria-label={insertMenu.label}
                              onMouseDown={() => setTriggered(null)}
                            >
                              <Syringe aria-hidden />
                            </ToolbarButton>
                          }
                        />
                      </PopoverTrigger>
                      <TooltipContent>{insertMenu.label}</TooltipContent>
                    </Tooltip>
                    <PopoverContent
                      align="start"
                      side="bottom"
                      anchor={triggered === null ? undefined : caretAnchorRef}
                      // Closed by a pick, the menu hands the caret to the text
                      // the item went into; opened by typing, back to the
                      // text it was typed in.
                      finalFocus={() => {
                        // Focus already back in this text stays where it is:
                        // a click into the line that closed the menu, or into
                        // a version of the value just inserted, put the caret
                        // there, and moving it would send what is typed next
                        // somewhere else.
                        const root = editor?.isDestroyed ? null : editor;
                        const active =
                          root?.view.dom.ownerDocument.activeElement;
                        if (
                          root != null &&
                          active instanceof Node &&
                          root.view.dom.contains(active)
                        ) {
                          return false;
                        }
                        const picked = pickedIntoRef.current;
                        if (picked !== null && !picked.isDestroyed) {
                          return picked.view.dom;
                        }
                        return triggered === null
                          ? true
                          : triggered.editor.view.dom;
                      }}
                    >
                      <InsertMenuList menu={insertMenu} onPick={insertItem} />
                    </PopoverContent>
                  </Popover>
                )}
                {toolbarTokens.map((token) => {
                  const missing =
                    requiredTokens.has(token.id) && !placedTokens.has(token.id);
                  return (
                    <ToolbarButton
                      key={token.id}
                      className={toolbarTokenButtonStyles}
                      disabled={isDisabled}
                      data-missing={missing || undefined}
                      aria-label={intl.formatMessage(
                        missing
                          ? messages.insertRequiredToken
                          : messages.insertToken,
                        { token: token.label },
                      )}
                      onClick={() =>
                        actOn
                          .chain()
                          .focus()
                          .insertContent({
                            type: TOKEN_NODE,
                            attrs: { id: token.id },
                          })
                          .run()
                      }
                    >
                      <Plus aria-hidden />
                      {token.label}
                      {missing && (
                        <span
                          aria-hidden
                          className="bg-warning size-2 shrink-0 rounded-full"
                        />
                      )}
                    </ToolbarButton>
                  );
                })}
              </Toolbar.Group>
            )}

            {(showTextFormatting ||
              showHeadings ||
              showLists ||
              showThematicBreak ||
              showTokens) &&
              showHistory && (
                <Toolbar.Separator className={toolbarSeparatorStyles} />
              )}

            {showHistory && (
              <Toolbar.Group className={toolbarGroupStyles}>
                <ToolbarButton
                  className={toolbarButtonStyles}
                  disabled={isDisabled || !historyState?.canUndo}
                  aria-label={intl.formatMessage(messages.undo)}
                  onClick={() => actInHistory('undo')}
                >
                  <Undo />
                </ToolbarButton>
                <ToolbarButton
                  className={toolbarButtonStyles}
                  disabled={isDisabled || !historyState?.canRedo}
                  aria-label={intl.formatMessage(messages.redo)}
                  onClick={() => actInHistory('redo')}
                >
                  <Redo />
                </ToolbarButton>
              </Toolbar.Group>
            )}
          </Toolbar.Root>
        </FieldUnavailableContext.Provider>
      )}
    </div>
  );
}
