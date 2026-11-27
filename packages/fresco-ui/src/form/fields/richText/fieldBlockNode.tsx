'use client';

import {
  type AnyExtension,
  type Editor,
  type JSONContent,
  mergeAttributes,
  Node as TiptapNode,
} from '@tiptap/core';
import {
  Fragment,
  type Node as ProseMirrorNode,
  Slice,
} from '@tiptap/pm/model';
import {
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from '@tiptap/pm/state';
import { Mapping } from '@tiptap/pm/transform';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
  useRef,
} from 'react';

import { headingVariants } from '../../../typography/Heading';
import { cx } from '../../../utils/cva';
import { useBlockHovered } from './blockFrames';
import { INLINE_VALUE_NODE } from './inlineValueNode';
import { oneLineContentOf } from './oneLine';
import { PLACEHOLDER_CLASSES } from './placeholderClasses';
import { insertSection, SECTION_GROUP } from './sectionBlocks';

export const FIELD_BLOCK_NODE = 'fieldBlock';
export const FIELD_LABEL_NODE = 'fieldLabel';
export const FIELD_HINT_NODE = 'fieldHint';

/**
 * A form's field as its block holds it. `fieldId` names the field (the same
 * field in every language's document); `variable` is the attribute it
 * collects, or `''` while none is chosen yet (an indeterminate field).
 */
export type RichTextFieldBlockAttributes = Readonly<{
  fieldId: string;
  variable: string;
  showValidationHints: boolean;
}>;

/**
 * Whether a field block contains the field's label and hint as text that is
 * typed in the block (`'editable'`), or contains no text at all (`'none'`),
 * as where the field's question is written somewhere else and the view shows
 * it in its own way.
 */
export type RichTextFieldBlockText = 'editable' | 'none';

/**
 * A field as the document stores it: a block of its own among the document's
 * blocks (or inside a logic block's branch). With editable text it contains
 * the field's label (the question) and hint as one line of text each; with
 * no text (`RichTextFieldBlocks.text`) it has no content.
 */
export type RichTextFieldBlockContent = Readonly<{
  type: typeof FIELD_BLOCK_NODE;
  attrs: RichTextFieldBlockAttributes;
  content?: readonly [
    Readonly<{ type: typeof FIELD_LABEL_NODE; content?: JSONContent[] }>,
    Readonly<{ type: typeof FIELD_HINT_NODE; content?: JSONContent[] }>,
  ];
}>;

/** What a field block's view is given to draw the field. */
export type RichTextFieldBlockViewProps = Readonly<{
  attributes: RichTextFieldBlockAttributes;
  /**
   * The field's label and hint, as editable text. The view places it,
   * exactly once. An ancestor of it carrying `data-field-required` draws the
   * label with the asterisk of a required field. Null where the block has no
   * text (`RichTextFieldBlocks.text`).
   */
  content: ReactNode;
  /** The block is the selection: clicked, or reached with Escape or the arrow keys. */
  selected: boolean;
  /**
   * The pointer is over the block. While it is, or while the block is
   * selected and focus is in the field (`active`), the view shows the
   * block's tab (`BlockTab`): its attribute and its settings button.
   */
  hovered: boolean;
  /** The field can be changed; a read-only or disabled one cannot. */
  editable: boolean;
  /** Focus is in the field's editor, or in something it shows over the page. */
  active: boolean;
  /** Whether the label and the hint are both empty; true with no text. */
  empty: boolean;
  /** Changes the block's attributes, as one undoable edit. */
  update: (changes: Partial<RichTextFieldBlockAttributes>) => void;
  /** Removes the block, as one undoable edit. */
  remove: () => void;
  /** Selects the whole block, with the keyboard in the text. */
  select: () => void;
  /**
   * Selects the whole block and leaves focus where it is: for a control of
   * the block's own that opens over the page, such as its settings, which
   * take focus themselves.
   */
  selectKeepingFocus: () => void;
  /** The block's frame as drawn, for anchoring a popover to. */
  element: () => HTMLElement | null;
}>;

/** A field block was put in by its keyboard command (Mod-Shift-F). */
export type RichTextFieldBlockInsertEvent = Readonly<{
  fieldId: string;
  origin: 'keyboard';
  /** The new block's frame, for anchoring the attribute picker to. */
  element: HTMLElement | null;
}>;

/**
 * What a field that holds a form's fields is given by its consumer, which
 * knows what a field collects and how it is answered.
 */
export type RichTextFieldBlocks = Readonly<{
  /** Draws a field: everything in the block other than its label and hint. */
  View: ComponentType<RichTextFieldBlockViewProps>;
  /** A new field's id. */
  createId: () => string;
  /**
   * Told when Mod-Shift-F has put in a new, indeterminate field at the caret,
   * so the consumer can open its attribute picker on the block.
   */
  onInsert: (event: RichTextFieldBlockInsertEvent) => void;
  /**
   * Whether each block contains the field's label and hint as text typed in
   * the block (the default), or no text (see `RichTextFieldBlockText`). With
   * no text a block is one unit that the caret cannot enter, and the value
   * holds it without content. Read when the editor is made: a field that
   * changes it is made again.
   */
  text?: RichTextFieldBlockText;
  /**
   * The label and hint of the field `fieldId` in the language being edited,
   * as a block's content (a label and a hint, as in
   * `RichTextFieldBlockContent`), for a block that arrives as that field with
   * an empty label and hint, such as one pasted from a field whose blocks
   * contain no text. Undefined where the consumer has none. Unused with no
   * text.
   */
  textOf?: (fieldId: string) => readonly JSONContent[] | undefined;
  /** Shown in an empty label, such as “Type the question”. Unused with no text. */
  labelPlaceholder: string;
  /** Shown in an empty hint, such as “Add a hint (optional)”. Unused with no text. */
  hintPlaceholder: string;
}>;

/** Where the extensions read their consumer from (see `InlineValuesSource`). */
export type FieldBlocksSource = Readonly<{
  current: () => RichTextFieldBlocks | undefined;
}>;

/** What a field block's view is told of the field around it. */
type FieldBlocksField = Readonly<{
  blocks: RichTextFieldBlocks | null;
  editable: boolean;
  active: boolean;
}>;

export const FieldBlocksContext = createContext<FieldBlocksField>({
  blocks: null,
  editable: true,
  active: false,
});

/** A block's attributes as the view reads them, whatever the value held. */
const fieldBlockAttributesOf = (
  attrs: Record<string, unknown>,
): RichTextFieldBlockAttributes => ({
  fieldId: typeof attrs.fieldId === 'string' ? attrs.fieldId : '',
  variable: typeof attrs.variable === 'string' ? attrs.variable : '',
  showValidationHints: attrs.showValidationHints === true,
});

/**
 * A new field block, with an empty label and hint where blocks have text
 * (`RichTextFieldBlocks.text`).
 */
export const newFieldBlock = (
  attrs: Readonly<{ fieldId: string; variable: string }>,
  text: RichTextFieldBlockText,
): RichTextFieldBlockContent => ({
  type: FIELD_BLOCK_NODE,
  attrs: { ...attrs, showValidationHints: false },
  ...(text === 'editable' && {
    content: [{ type: FIELD_LABEL_NODE }, { type: FIELD_HINT_NODE }],
  }),
});

const isFieldText = (node: ProseMirrorNode): boolean =>
  node.type.name === FIELD_LABEL_NODE || node.type.name === FIELD_HINT_NODE;

function FieldBlockView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: ReactNodeViewProps) {
  const { blocks, editable, active } = useContext(FieldBlocksContext);
  const frame = useRef<HTMLElement>(null);
  const hovered = useBlockHovered(editor, getPos);
  const attributes = fieldBlockAttributesOf(node.attrs);
  const indeterminate = attributes.variable === '';
  // A block with no text is a leaf: it has no label or hint to be empty.
  const empty =
    node.isLeaf ||
    (node.firstChild?.content.size === 0 && node.lastChild?.content.size === 0);
  const content = node.isLeaf ? null : (
    <NodeViewContent data-field-text="" className="flex flex-col gap-1" />
  );
  return (
    <NodeViewWrapper
      ref={frame}
      data-field-block-view=""
      data-field-id={attributes.fieldId}
      data-selected={selected || undefined}
      data-indeterminate={indeterminate || undefined}
      className={FIELD_BLOCK_CLASSES}
    >
      {blocks === null ? (
        content
      ) : (
        <blocks.View
          attributes={attributes}
          content={content}
          selected={selected}
          hovered={hovered}
          editable={editable}
          active={active}
          empty={empty}
          update={(changes) => {
            if (editable) updateAttributes(changes);
          }}
          remove={() => {
            if (!editable) return;
            deleteNode();
            editor.view.focus();
          }}
          select={() => {
            const position = getPos();
            if (position === undefined) return;
            editor.chain().focus().setNodeSelection(position).run();
          }}
          selectKeepingFocus={() => {
            const position = getPos();
            if (position === undefined) return;
            editor.commands.setNodeSelection(position);
          }}
          element={() => frame.current}
        />
      )}
    </NodeViewWrapper>
  );
}

// A field has no border or padding of its own: it is drawn as the interview
// draws it, and only its frame marks it out (see `BlockFrameLayer`). One
// whose attribute is not chosen yet has a dashed outline where its frame
// would be, which takes no room.
const FIELD_BLOCK_CLASSES =
  'relative my-6 rounded-sm outline-offset-4 first:mt-0 last:mb-0 data-indeterminate:outline-2 data-indeterminate:outline-current/30 data-indeterminate:outline-dashed';

// The label looks as the interview's field label does, the hint as its hint.
// An empty one shows its placeholder (`data-placeholder`, set below).
const LABEL_CLASSES = cx(
  headingVariants({ level: 'label', margin: 'none' }),
  'min-h-lh',
  '[[data-field-required]_&]:after:text-destructive-ink [[data-field-required]_&]:after:content-["_*"]',
  PLACEHOLDER_CLASSES,
);

const HINT_CLASSES = cx(
  'min-h-lh text-sm text-current/70',
  PLACEHOLDER_CLASSES,
);

const PLACEHOLDERS = new PluginKey('fieldBlockPlaceholders');

const placeholderDecorations = (
  state: EditorState,
  source: FieldBlocksSource,
): DecorationSet => {
  const blocks = source.current();
  if (blocks === undefined) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  state.doc.descendants((node, position) => {
    if (!isFieldText(node)) return true;
    if (node.content.size === 0) {
      decorations.push(
        Decoration.node(position, position + node.nodeSize, {
          'data-placeholder':
            node.type.name === FIELD_LABEL_NODE
              ? blocks.labelPlaceholder
              : blocks.hintPlaceholder,
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(state.doc, decorations);
};

/**
 * A block pasted, dropped as a copy, or brought back by Undo into a document
 * that already has its field (the same id, or another field collecting the
 * same attribute) arrives as a new field with no attribute chosen: a field
 * appears once in a document. Blocks that were there before keep what they
 * have. A block that arrives as the field it is, with an empty label and
 * hint, takes the field's own text from the consumer (`textOf`), as one
 * pasted from a field whose blocks contain no text does.
 */
const uniqueFieldsPlugin = (source: FieldBlocksSource, hasText: boolean) =>
  new Plugin({
    key: new PluginKey('uniqueFieldBlocks'),
    appendTransaction: (transactions, oldState, newState) => {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const mapping = new Mapping(
        transactions.flatMap((tr) => tr.mapping.maps),
      );
      const survivors = new Set<number>();
      oldState.doc.descendants((node, position) => {
        if (node.type.name !== FIELD_BLOCK_NODE) return true;
        const mapped = mapping.mapResult(position, 1);
        if (!mapped.deleted) survivors.add(mapped.pos);
        return false;
      });
      const blocks: { position: number; node: ProseMirrorNode }[] = [];
      newState.doc.descendants((node, position) => {
        if (node.type.name === FIELD_BLOCK_NODE) {
          blocks.push({ position, node });
        }
        return true;
      });
      const ids = new Set<string>();
      const variables = new Set<string>();
      const claim = ({ node }: { node: ProseMirrorNode }) => {
        const { fieldId, variable } = fieldBlockAttributesOf(node.attrs);
        ids.add(fieldId);
        if (variable !== '') variables.add(variable);
      };
      const arrived = blocks.filter(({ position }) => {
        if (!survivors.has(position)) return true;
        return false;
      });
      for (const block of blocks) {
        if (survivors.has(block.position)) claim(block);
      }
      const renamed: typeof blocks = [];
      const kept: typeof blocks = [];
      for (const block of arrived) {
        const { fieldId, variable } = fieldBlockAttributesOf(block.node.attrs);
        if (
          fieldId === '' ||
          ids.has(fieldId) ||
          (variable !== '' && variables.has(variable))
        ) {
          renamed.push(block);
        } else {
          claim(block);
          kept.push(block);
        }
      }
      const textOf = hasText ? source.current()?.textOf : undefined;
      const filled = kept.flatMap(({ position, node }) => {
        const empty =
          node.firstChild?.content.size === 0 &&
          node.lastChild?.content.size === 0;
        const text = empty
          ? textOf?.(fieldBlockAttributesOf(node.attrs).fieldId)
          : undefined;
        if (text === undefined) return [];
        try {
          const content = Fragment.fromArray(
            text.map((part) => newState.schema.nodeFromJSON(part)),
          );
          // Text the block cannot contain is left out, and the block stays
          // empty.
          return node.type.validContent(content)
            ? [{ position, node, content }]
            : [];
        } catch {
          return [];
        }
      });
      if (renamed.length === 0 && filled.length === 0) return null;
      const createId =
        source.current()?.createId ?? (() => crypto.randomUUID());
      const tr = newState.tr;
      for (const { position, node } of renamed) {
        tr.setNodeMarkup(position, undefined, {
          ...node.attrs,
          fieldId: createId(),
          variable: '',
        });
      }
      // From the end, so that each block is still where it was found.
      for (const { position, node, content } of filled.toReversed()) {
        tr.replaceWith(position + 1, position + node.nodeSize - 1, content);
      }
      return tr;
    },
  });

/** The label or hint the caret is in, with the depth of its field block. */
const fieldTextAt = (
  state: EditorState,
): Readonly<{ kind: 'label' | 'hint'; blockDepth: number }> | null => {
  const { $from } = state.selection;
  if ($from.depth < 1) return null;
  const { name } = $from.parent.type;
  if (name === FIELD_LABEL_NODE) {
    return { kind: 'label', blockDepth: $from.depth - 1 };
  }
  if (name === FIELD_HINT_NODE) {
    return { kind: 'hint', blockDepth: $from.depth - 1 };
  }
  return null;
};

/** Selects the field block the caret is in. */
const selectEnclosingBlock = (editor: Editor): boolean => {
  const found = fieldTextAt(editor.state);
  if (found === null) return false;
  const { $from } = editor.state.selection;
  editor.view.dispatch(
    editor.state.tr.setSelection(
      NodeSelection.create(editor.state.doc, $from.before(found.blockDepth)),
    ),
  );
  return true;
};

/**
 * A field's label and hint, and the block that holds them, with the field's
 * keys:
 *
 * - Enter in the label moves to the hint; Enter in the hint starts a
 *   paragraph after the field. Shift-Enter and Mod-Enter do nothing: each is
 *   one line.
 * - Backspace at the start of the hint moves to the end of the label, and
 *   Delete at the end of the label moves to the start of the hint; neither
 *   can be selected as a whole, so no key empties one at a stroke.
 *   Backspace in an empty label of a field with an empty hint selects the
 *   field, and a second Backspace removes it.
 * - Escape in the label or hint selects the field. Enter on a selected field
 *   presses its tab's action (see `DocumentBlocks`): its settings, or its
 *   attribute list. Enter on a value selected in the label or hint is the
 *   value's own (see `createInlineValueNode`).
 * - Mod-Shift-F puts in a new field at the caret.
 *
 * Text pasted into a label or hint arrives as one line.
 *
 * With no text (`text: 'none'`, see `RichTextFieldBlocks.text`) the block is
 * an atom, without a label or hint: the caret moves past it, and only its
 * Enter and Mod-Shift-F remain. A block pasted from a field whose blocks have
 * text arrives without it.
 */
export const createFieldBlockNodes = (
  source: FieldBlocksSource,
  {
    inlineValues,
    text,
  }: Readonly<{ inlineValues: boolean; text: RichTextFieldBlockText }>,
): AnyExtension[] => {
  const hasText = text === 'editable';
  const lineContent = inlineValues ? `(text | ${INLINE_VALUE_NODE})*` : 'text*';

  const FieldLabel = TiptapNode.create({
    name: FIELD_LABEL_NODE,
    content: lineContent,
    marks: 'bold italic',
    defining: true,
    // Never a node selection: one would draw nothing, and a key pressed then
    // would empty it (ProseMirror puts an empty one back).
    selectable: false,
    parseHTML() {
      return [{ tag: 'div[data-field-label]', priority: 60 }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, {
          'data-field-label': '',
          'class': LABEL_CLASSES,
        }),
        0,
      ];
    },
  });

  const FieldHint = TiptapNode.create({
    name: FIELD_HINT_NODE,
    content: lineContent,
    marks: 'bold italic',
    defining: true,
    // Never a node selection: one would draw nothing, and a key pressed then
    // would empty it (ProseMirror puts an empty one back).
    selectable: false,
    parseHTML() {
      return [{ tag: 'div[data-field-hint]', priority: 60 }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, {
          'data-field-hint': '',
          'class': HINT_CLASSES,
        }),
        0,
      ];
    },
  });

  const FieldBlock = TiptapNode.create({
    name: FIELD_BLOCK_NODE,
    group: SECTION_GROUP,
    ...(hasText
      ? { content: `${FIELD_LABEL_NODE} ${FIELD_HINT_NODE}`, isolating: true }
      : { atom: true }),
    selectable: true,
    // Moved by the handle its frame shows (see `BlockFrameLayer`).
    draggable: false,
    // Its keys come before the editor's own Enter, Backspace and Delete.
    priority: 1000,

    addAttributes() {
      return {
        fieldId: {
          default: '',
          parseHTML: (element) => element.getAttribute('data-field-id') ?? '',
          renderHTML: (attributes) => ({
            'data-field-id': attributes.fieldId,
          }),
        },
        variable: {
          default: '',
          parseHTML: (element) => element.getAttribute('data-variable') ?? '',
          renderHTML: (attributes) => ({
            'data-variable': attributes.variable,
          }),
        },
        showValidationHints: {
          default: false,
          parseHTML: (element) =>
            element.getAttribute('data-show-validation-hints') === 'true',
          renderHTML: (attributes) => ({
            'data-show-validation-hints': String(
              attributes.showValidationHints === true,
            ),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-field-block]', priority: 60 }];
    },

    renderHTML({ HTMLAttributes }) {
      const attributes = mergeAttributes(
        { 'data-field-block': '' },
        HTMLAttributes,
      );
      return hasText ? ['div', attributes, 0] : ['div', attributes];
    },

    addKeyboardShortcuts() {
      return {
        'Enter': ({ editor }) => {
          // A selected field: Enter presses its tab's action (see
          // `DocumentBlocks`). A value selected in the label or hint: its own
          // Enter opens it.
          if (editor.state.selection instanceof NodeSelection) return false;
          const found = fieldTextAt(editor.state);
          if (found === null) return false;
          const { $from } = editor.state.selection;
          const { tr, schema } = editor.state;
          if (found.kind === 'label') {
            tr.setSelection(TextSelection.create(tr.doc, $from.after() + 1));
          } else {
            const paragraph = schema.nodes.paragraph;
            if (paragraph === undefined) return true;
            const after = $from.after(found.blockDepth);
            tr.insert(after, paragraph.create());
            tr.setSelection(TextSelection.create(tr.doc, after + 1));
          }
          editor.view.dispatch(tr.scrollIntoView());
          return true;
        },
        'Shift-Enter': ({ editor }) => fieldTextAt(editor.state) !== null,
        'Mod-Enter': ({ editor }) => fieldTextAt(editor.state) !== null,
        'Backspace': ({ editor }) => {
          const { selection } = editor.state;
          const found = fieldTextAt(editor.state);
          if (found === null || !selection.empty) return false;
          const { $from } = selection;
          if ($from.parentOffset > 0) return false;
          const block = $from.node(found.blockDepth);
          if (found.kind === 'hint') {
            editor.view.dispatch(
              editor.state.tr.setSelection(
                TextSelection.create(editor.state.doc, $from.before() - 1),
              ),
            );
            return true;
          }
          const empty =
            block.firstChild?.content.size === 0 &&
            block.lastChild?.content.size === 0;
          if (empty) return selectEnclosingBlock(editor);
          // The start of a label: nothing before it in the field to join.
          return true;
        },
        'Delete': ({ editor }) => {
          const { selection } = editor.state;
          const found = fieldTextAt(editor.state);
          if (found?.kind !== 'label' || !selection.empty) return false;
          const { $from } = selection;
          if ($from.parentOffset < $from.parent.content.size) return false;
          editor.view.dispatch(
            editor.state.tr.setSelection(
              TextSelection.create(editor.state.doc, $from.after() + 1),
            ),
          );
          return true;
        },
        'Mod-Shift-f': ({ editor }) => {
          const blocks = source.current();
          if (blocks === undefined || !editor.isEditable) return false;
          const fieldId = blocks.createId();
          const position = insertSection(
            editor,
            newFieldBlock({ fieldId, variable: '' }, text),
            'text',
          );
          if (position === null) return true;
          const element = editor.view.nodeDOM(position);
          blocks.onInsert({
            fieldId,
            origin: 'keyboard',
            element: element instanceof HTMLElement ? element : null,
          });
          return true;
        },
      };
    },

    addProseMirrorPlugins() {
      const { schema } = this.editor;
      return [
        uniqueFieldsPlugin(source, hasText),
        new Plugin({
          key: PLACEHOLDERS,
          props: {
            decorations: (state) => placeholderDecorations(state, source),
            handleKeyDown: (view, event) => {
              if (event.key !== 'Escape' || fieldTextAt(view.state) === null) {
                return false;
              }
              // Spent here: a dialog around the text must not also close.
              event.stopPropagation();
              const { $from } = view.state.selection;
              const found = fieldTextAt(view.state);
              if (found === null) return false;
              view.dispatch(
                view.state.tr.setSelection(
                  NodeSelection.create(
                    view.state.doc,
                    $from.before(found.blockDepth),
                  ),
                ),
              );
              return true;
            },
            // One line, whatever was copied.
            transformPasted: (slice, view) => {
              const { parent } = view.state.selection.$from;
              if (!isFieldText(parent)) return slice;
              // ProseMirror types `toJSON()` as `any`; a fragment's JSON is a
              // list of JSONContent nodes, or null when it is empty.
              const pasted: JSONContent[] | null = slice.content.toJSON();
              const nodes = oneLineContentOf(pasted, schema).flatMap((json) => {
                const node = schema.nodeFromJSON(json);
                if (!parent.type.contentMatch.matchType(node.type)) return [];
                return [node.mark(parent.type.allowedMarks(node.marks))];
              });
              return nodes.length === 0
                ? Slice.empty
                : new Slice(Fragment.fromArray(nodes), 0, 0);
            },
          },
        }),
      ];
    },

    addNodeView() {
      return ReactNodeViewRenderer(FieldBlockView);
    },
  });

  return hasText ? [FieldBlock, FieldLabel, FieldHint] : [FieldBlock];
};
