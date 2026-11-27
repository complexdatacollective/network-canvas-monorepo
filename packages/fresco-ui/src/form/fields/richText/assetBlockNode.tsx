'use client';

import { mergeAttributes, type Editor, Node as TiptapNode } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import {
  type ComponentType,
  createContext,
  type PointerEvent as ReactPointerEvent,
  useContext,
} from 'react';

import {
  ASSET_BLOCK_DEFAULTS,
  type AssetBlockAttributes,
  type AssetBlockKind,
  isAssetBlockAlignment,
  isAssetBlockSize,
} from '@codaco/shared-consts';

import { cva } from '../../../utils/cva';
import { useBlockHovered } from './blockFrames';

export const ASSET_BLOCK_NODE = 'assetBlock';

/** The kinds of file a block can show. */
export type RichTextAssetBlockKind = AssetBlockKind;

/**
 * A file shown as a block among the text's paragraphs, as the value holds
 * it (see `RichTextAssetBlockContent`). The editor does not know what a file
 * is or where it lives, only the id its consumer gave it and how the block
 * is to be shown.
 */
export type RichTextAssetBlockAttributes = AssetBlockAttributes;

/** A block as the value holds it, among the document's paragraphs. */
export type RichTextAssetBlockContent = Readonly<{
  type: typeof ASSET_BLOCK_NODE;
  attrs: RichTextAssetBlockAttributes;
}>;

const DEFAULTS: Omit<RichTextAssetBlockAttributes, 'assetId'> = {
  description: '',
  size: null,
  ...ASSET_BLOCK_DEFAULTS,
};

/** Lets the researcher choose a file of one kind (see `RichTextAssetBlocks`). */
type PickAssetBlock = (
  kind: RichTextAssetBlockKind,
) => Promise<string | undefined>;

/** What a block's view is given to draw the file and change how it shows. */
export type RichTextAssetBlockViewProps = Readonly<{
  attributes: RichTextAssetBlockAttributes;
  /** The block is the selection: clicked, or reached with the arrow keys. */
  selected: boolean;
  /**
   * The pointer is over the block. While it is, or while the block is
   * selected and focus is in the field (`active`), the view shows the
   * block's tab (`BlockTab`) with its settings button, inside the element its
   * frame is drawn round (`blockBoxProps`).
   */
  hovered: boolean;
  /** The field can be changed; a read-only or disabled one cannot. */
  editable: boolean;
  /**
   * Focus is in the field: in its text, or in something it shows over the
   * page, such as what this view shows there. For what a view shows only
   * while its block is being worked on.
   */
  active: boolean;
  update: (changes: Partial<RichTextAssetBlockAttributes>) => void;
  remove: () => void;
  /** Selects this block, with the keyboard in the text. */
  returnToText: () => void;
  /**
   * Selects this block and leaves focus where it is: for a control of the
   * block's own that opens over the page, such as its settings, which take
   * focus themselves.
   */
  selectKeepingFocus: () => void;
}>;

/**
 * What a field that holds files as blocks is given by its consumer, which
 * knows what the files are: how one is drawn, and a way to choose one.
 */
export type RichTextAssetBlocks = Readonly<{
  /**
   * Lets the researcher choose a file of `kind`. Resolves with its id, or
   * with `undefined` when they chose none. Without it the field shows the
   * blocks its text holds, which can be changed, moved and removed, and
   * offers no way to add one.
   */
  pick?: PickAssetBlock;
  /**
   * Draws a block: the file as its reader will meet it, and, while the block
   * is selected, whatever changes how it shows. Everything inside it is the
   * consumer's, so its words are the consumer's to translate.
   */
  View: ComponentType<RichTextAssetBlockViewProps>;
}>;

/** What a block's node view is told of the field around it. */
type AssetBlockField = Readonly<{
  /** The consumer's side of the blocks; `null` where it gave none. */
  blocks: RichTextAssetBlocks | null;
  /**
   * Whether the field can be changed. The field says so here because the
   * editor does not: making it read-only or disabled changes no text, so
   * nothing draws a block's view again, and one that asked the editor would
   * go on showing what it showed when it was last drawn.
   */
  editable: boolean;
  /** Whether focus is in the field (see `RichTextAssetBlockViewProps.active`). */
  active: boolean;
}>;

export const AssetBlockFieldContext = createContext<AssetBlockField>({
  blocks: null,
  editable: true,
  active: false,
});

/**
 * The element the editor draws around a block's view. Its frame, handle and
 * tab are drawn over the page (see `BlockFrameLayer`), round the file the view
 * draws (`blockBoxProps`).
 */
const assetBlockFrameVariants = cva({
  // Nothing in a block is text to select. A browser that reads words out of
  // a picture (Safari does) would otherwise let them be selected in it, as if
  // the page held them.
  base: 'relative my-4 rounded-sm select-none',
  variants: {
    // Part of a selection of text, it is covered in the colour selected text
    // is: the browser draws that over words, and not over a block.
    inSelectedText: {
      true: 'after:pointer-events-none after:absolute after:inset-0 after:rounded-sm after:bg-[Highlight] after:opacity-40',
      false: '',
    },
  },
  defaultVariants: { inSelectedText: false },
});

/** A node's attributes as the view reads them, whatever the value held. */
const attributesOf = (
  attrs: Record<string, unknown>,
): RichTextAssetBlockAttributes => ({
  assetId: typeof attrs.assetId === 'string' ? attrs.assetId : '',
  description:
    typeof attrs.description === 'string'
      ? attrs.description
      : DEFAULTS.description,
  size: isAssetBlockSize(attrs.size) ? attrs.size : DEFAULTS.size,
  align: isAssetBlockAlignment(attrs.align) ? attrs.align : DEFAULTS.align,
  autoplay: attrs.autoplay !== false,
  loop: attrs.loop !== false,
});

// Set on what a view draws for changing a block: keys and clicks there are
// the control's, not the text's.
const CONTROLS_ATTRIBUTE = 'data-asset-block-controls';

// Set on the file a view draws: a pointer pressed there selects the block,
// and is otherwise the file's own, so a player's controls work whether or
// not the block is selected, and the file is never dragged by itself.
const FILE_ATTRIBUTE = 'data-asset-block-file';

const isIn = (event: Event, attribute: string): boolean =>
  event.target instanceof Element &&
  event.target.closest(`[${attribute}]`) !== null;

/** Spread on the element holding a view's controls (see `stopEvent`). */
export const assetBlockControlsProps = { [CONTROLS_ATTRIBUTE]: '' } as const;

/** Spread on the element a view draws its file in (see `stopEvent`). */
export const assetBlockFileProps = { [FILE_ATTRIBUTE]: '' } as const;

// What a researcher can operate in a block's settings. Not judged by
// `tabindex`: a popover takes its controls out of the Tab order
// (`tabindex="-1"`) while focus is outside it, and puts them back as focus
// comes in, so a control judged by it could be reached only once. Elements
// that take focus only to scroll, or a hidden input that stands behind a
// switch or a checkbox, are not controls.
const CONTROL =
  ':is(input:not([type="hidden"]), select, textarea, button, a[href]):not([disabled], [aria-hidden="true"])';

/**
 * The first control that a researcher can operate in `container`: where
 * focus goes as a block's settings open, whether or not focus has been in
 * them before.
 */
export const firstSettingsControlIn = (
  container: ParentNode,
): HTMLElement | null =>
  Array.from(container.querySelectorAll<HTMLElement>(CONTROL)).find(
    (control) => control.closest('[aria-hidden="true"], [inert]') === null,
  ) ?? null;

const isAssetBlock = (node: unknown): boolean =>
  typeof node === 'object' &&
  node !== null &&
  'type' in node &&
  typeof node.type === 'object' &&
  node.type !== null &&
  'name' in node.type &&
  node.type.name === ASSET_BLOCK_NODE;

// Marks a block that a selection of text runs across (see the plugin below).
const IN_SELECTED_TEXT = { inSelectedText: true } as const;

const isInSelectedText = (decorations: readonly { spec: unknown }[]) =>
  decorations.some((decoration) => decoration.spec === IN_SELECTED_TEXT);

function AssetBlockView({
  node,
  selected,
  decorations,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: ReactNodeViewProps) {
  const { blocks, editable, active } = useContext(AssetBlockFieldContext);
  const hovered = useBlockHovered(editor, getPos);
  const attributes = attributesOf(node.attrs);
  const select = () => {
    const position = getPos();
    if (position === undefined) return;
    editor.chain().focus().setNodeSelection(position).run();
  };
  // Only while the field has focus: a selection the field has lost is not
  // what the keys act on, and the page may by then have selected something
  // else, which the editor does not hear of.
  const inSelectedText = active && isInSelectedText(decorations);

  return (
    <NodeViewWrapper
      // The text around it is editable; the block is one whole thing in it.
      contentEditable={false}
      data-asset-block=""
      data-selected={selected || undefined}
      data-in-selected-text={inSelectedText || undefined}
      className={assetBlockFrameVariants({ inSelectedText })}
      // A press on the file selects the block; what it pressed (a player's
      // control) still acts.
      onPointerDown={(event: ReactPointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        // Not a press in its tab, whose buttons select it themselves.
        if (
          event.target instanceof Element &&
          event.target.closest(`[${FILE_ATTRIBUTE}]`) !== null &&
          event.target.closest('[data-block-tab]') === null
        ) {
          select();
        }
      }}
    >
      {blocks === null ? null : (
        <blocks.View
          // A view belongs to its file: one given another file is made
          // again, so that a player or a preview it draws is the new file's.
          key={attributes.assetId}
          attributes={attributes}
          selected={selected}
          hovered={hovered}
          editable={editable}
          active={active}
          // A view may still be showing a control when the field stops being
          // editable, and a command changes the text whether or not the
          // editor is: neither does anything then.
          update={(changes) => {
            if (editable) updateAttributes(changes);
          }}
          remove={() => {
            if (!editable) return;
            // Its controls go with the block, and focus that was in them
            // would be left on nothing: it goes back to the text.
            deleteNode();
            editor.view.focus();
          }}
          returnToText={select}
          selectKeepingFocus={() => {
            const position = getPos();
            if (position === undefined) return;
            editor.commands.setNodeSelection(position);
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

/**
 * A file among the text's blocks: an image, an audio recording or a video.
 * One whole thing, selected, moved and deleted as a unit, and never typed
 * into or over: text typed while it is selected starts a paragraph below it
 * (see `DocumentBlocks`).
 * What it looks like, and what changes how it shows, are its
 * consumer's (`RichTextAssetBlocks`).
 *
 * Reached with the arrow keys like any block, and selected by a press on its
 * file. Its settings open from the settings button in its tab (`BlockTab`),
 * or with Enter on the selected block (see `DocumentBlocks`).
 */
export const AssetBlockNode = TiptapNode.create({
  name: ASSET_BLOCK_NODE,
  group: 'block',
  atom: true,
  selectable: true,
  // Moved by the handle its frame shows (see `BlockFrameLayer`).
  draggable: false,

  addAttributes() {
    return {
      assetId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-asset-id') ?? '',
        renderHTML: (attributes) => ({ 'data-asset-id': attributes.assetId }),
      },
      description: {
        default: DEFAULTS.description,
        parseHTML: (element) =>
          element.getAttribute('data-description') ?? DEFAULTS.description,
        renderHTML: (attributes) => ({
          'data-description': attributes.description,
        }),
      },
      size: {
        default: DEFAULTS.size,
        parseHTML: (element) => {
          const size = element.getAttribute('data-size');
          return isAssetBlockSize(size) ? size : DEFAULTS.size;
        },
        renderHTML: (attributes) =>
          isAssetBlockSize(attributes.size)
            ? { 'data-size': attributes.size }
            : {},
      },
      align: {
        default: DEFAULTS.align,
        parseHTML: (element) => {
          const align = element.getAttribute('data-align');
          return isAssetBlockAlignment(align) ? align : DEFAULTS.align;
        },
        renderHTML: (attributes) => ({ 'data-align': attributes.align }),
      },
      autoplay: {
        default: DEFAULTS.autoplay,
        parseHTML: (element) =>
          element.getAttribute('data-autoplay') !== 'false',
        renderHTML: (attributes) => ({
          'data-autoplay': String(attributes.autoplay !== false),
        }),
      },
      loop: {
        default: DEFAULTS.loop,
        parseHTML: (element) => element.getAttribute('data-loop') !== 'false',
        renderHTML: (attributes) => ({
          'data-loop': String(attributes.loop !== false),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-asset-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes)];
  },

  renderText() {
    return '';
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('assetBlockTyping'),
        props: {
          // A selection of text that runs across a block takes the block
          // with it (copied, cut, typed over), so the block is marked as
          // the text is. A block selected by itself has a frame instead.
          decorations: ({ doc, selection }) => {
            if (selection.empty || selection instanceof NodeSelection) {
              return null;
            }
            const marked: Decoration[] = [];
            doc.nodesBetween(selection.from, selection.to, (node, position) => {
              if (!isAssetBlock(node)) return true;
              if (
                position >= selection.from &&
                position + node.nodeSize <= selection.to
              ) {
                marked.push(
                  Decoration.node(
                    position,
                    position + node.nodeSize,
                    {},
                    IN_SELECTED_TEXT,
                  ),
                );
              }
              return false;
            });
            return DecorationSet.create(doc, marked);
          },
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssetBlockView, {
      stopEvent: ({ event }) =>
        isIn(event, CONTROLS_ATTRIBUTE) ||
        isIn(event, FILE_ATTRIBUTE) ||
        isIn(event, 'data-block-tab'),
      ignoreMutation: () => true,
      // Left to itself, a view whose node is unchanged is not drawn again
      // when only its decorations change, and a selection moving across a
      // block changes nothing else about it.
      update: ({
        oldNode,
        newNode,
        oldDecorations,
        newDecorations,
        updateProps,
      }) => {
        if (
          newNode !== oldNode ||
          isInSelectedText(newDecorations) !== isInSelectedText(oldDecorations)
        ) {
          updateProps();
        }
        return true;
      },
    });
  },
});

/**
 * Puts a block showing `assetId` where the selection is, and selects it: what
 * a researcher does next with a file just placed is say how it shows, and
 * Enter on the selected block opens its settings. A block that would end the text
 * brings an empty paragraph with it, as a rule does: nothing else leaves
 * somewhere to type below it.
 */
export const insertAssetBlock = (editor: Editor, assetId: string): boolean =>
  editor
    .chain()
    .focus()
    .insertContent({ type: ASSET_BLOCK_NODE, attrs: { assetId } })
    .command(({ tr, dispatch }) => {
      // Where the block went: it is the one that was not there before, once
      // those that were are followed to where they are now.
      const kept = new Set<number>();
      tr.before.descendants((node, position) => {
        if (node.type.name === ASSET_BLOCK_NODE) {
          kept.add(tr.mapping.map(position));
        }
      });
      let placed: number | undefined;
      tr.doc.descendants((node, position) => {
        if (node.type.name === ASSET_BLOCK_NODE && !kept.has(position)) {
          placed = position;
        }
      });
      const paragraph = tr.doc.type.schema.nodes.paragraph;
      if (!dispatch) return true;
      if (
        tr.doc.lastChild?.type.name === ASSET_BLOCK_NODE &&
        paragraph !== undefined
      ) {
        tr.insert(tr.doc.content.size, paragraph.create());
      }
      if (placed !== undefined) {
        tr.setSelection(NodeSelection.create(tr.doc, placed));
      }
      return true;
    })
    .run();
