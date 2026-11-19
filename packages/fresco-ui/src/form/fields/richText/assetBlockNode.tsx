'use client';

import { mergeAttributes, type Editor, Node as TiptapNode } from '@tiptap/core';
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
} from '@tiptap/pm/state';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { type ComponentType, createContext, useContext } from 'react';

import { cx } from '../../../utils/cva';

export const ASSET_BLOCK_NODE = 'assetBlock';

/** The kinds of file a block can show. */
export type RichTextAssetBlockKind = 'image' | 'audio' | 'video';

/**
 * A file shown as a block among the text's paragraphs, as the value holds
 * it: `{ type: 'assetBlock', attrs }`. The editor does not know what a file
 * is or where it lives, only the id its consumer gave it and how the block
 * is to be shown.
 */
export type RichTextAssetBlockAttributes = Readonly<{
  /** The file, by the id the consumer's picker gave. */
  assetId: string;
  /** What the file shows or says, for a reader who cannot see or hear it. */
  description: string;
  /** How tall the file may be shown; `null` leaves it its own height. */
  size: 'small' | 'medium' | 'large' | null;
  /** Where the file sits across the text. */
  align: 'start' | 'center' | 'end';
  /** Whether audio or video starts by itself. */
  autoplay: boolean;
  /** Whether audio or video starts again when it ends. */
  loop: boolean;
}>;

const DEFAULTS: Omit<RichTextAssetBlockAttributes, 'assetId'> = {
  description: '',
  size: null,
  align: 'center',
  autoplay: true,
  loop: true,
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
  /** The field can be changed; a read-only or disabled one cannot. */
  editable: boolean;
  update: (changes: Partial<RichTextAssetBlockAttributes>) => void;
  remove: () => void;
  /** Puts the caret back in the text, on this block. */
  returnToText: () => void;
  /** The field's way of choosing a file, where it has one. */
  pick?: PickAssetBlock;
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

/** The consumer's side of the blocks in the editor around a node view. */
export const AssetBlocksContext = createContext<RichTextAssetBlocks | null>(
  null,
);

/**
 * Whether the field around a node view can be changed. The field says so
 * here because the editor does not: making it read-only or disabled changes
 * no text, so nothing draws a block's view again, and one that asked the
 * editor would go on showing what it showed when it was last drawn.
 */
export const AssetBlocksEditableContext = createContext(true);

const isSize = (value: unknown): value is 'small' | 'medium' | 'large' =>
  value === 'small' || value === 'medium' || value === 'large';

const isAlign = (value: unknown): value is 'start' | 'center' | 'end' =>
  value === 'start' || value === 'center' || value === 'end';

/** A node's attributes as the view reads them, whatever the value held. */
const attributesOf = (
  attrs: Record<string, unknown>,
): RichTextAssetBlockAttributes => ({
  assetId: typeof attrs.assetId === 'string' ? attrs.assetId : '',
  description:
    typeof attrs.description === 'string'
      ? attrs.description
      : DEFAULTS.description,
  size: isSize(attrs.size) ? attrs.size : DEFAULTS.size,
  align: isAlign(attrs.align) ? attrs.align : DEFAULTS.align,
  autoplay: attrs.autoplay !== false,
  loop: attrs.loop !== false,
});

// Set on what a view draws for changing a block: keys and clicks there are
// the control's, not the text's.
const CONTROLS_ATTRIBUTE = 'data-asset-block-controls';

const isInControls = (event: Event): boolean =>
  event.target instanceof Element &&
  event.target.closest(`[${CONTROLS_ATTRIBUTE}]`) !== null;

/** Spread on the element holding a view's controls (see `stopEvent`). */
export const assetBlockControlsProps = { [CONTROLS_ATTRIBUTE]: '' } as const;

const isAssetBlock = (node: unknown): boolean =>
  typeof node === 'object' &&
  node !== null &&
  'type' in node &&
  typeof node.type === 'object' &&
  node.type !== null &&
  'name' in node.type &&
  node.type.name === ASSET_BLOCK_NODE;

function AssetBlockView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: ReactNodeViewProps) {
  const blocks = useContext(AssetBlocksContext);
  const editable = useContext(AssetBlocksEditableContext);
  const attributes = attributesOf(node.attrs);

  return (
    <NodeViewWrapper
      // The text around it is editable; the block is one whole thing in it.
      contentEditable={false}
      data-asset-block=""
      data-selected={selected || undefined}
      className={cx(
        'my-4 rounded-sm outline-offset-4',
        selected && 'outline-primary outline-2',
      )}
    >
      {blocks === null ? null : (
        <blocks.View
          // A view belongs to its file: one given another file is made
          // again, so that a player or a preview it draws is the new file's.
          key={attributes.assetId}
          attributes={attributes}
          selected={selected}
          editable={editable}
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
          pick={blocks.pick}
          returnToText={() => {
            const position = getPos();
            if (position === undefined) return;
            editor.chain().focus().setNodeSelection(position).run();
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

/**
 * A file among the text's blocks: an image, an audio recording or a video.
 * One whole thing, selected, moved and deleted as a unit, and never typed
 * into or over: text typed while it is selected starts a paragraph below it.
 * What it looks like, and what changes how it shows, are its
 * consumer's (`RichTextAssetBlocks`).
 *
 * Reached with the arrow keys like any block. Enter on a selected block
 * moves into its controls, and Escape there moves back out to the block.
 */
export const AssetBlockNode = TiptapNode.create({
  name: ASSET_BLOCK_NODE,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

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
          return isSize(size) ? size : DEFAULTS.size;
        },
        renderHTML: (attributes) =>
          isSize(attributes.size) ? { 'data-size': attributes.size } : {},
      },
      align: {
        default: DEFAULTS.align,
        parseHTML: (element) => {
          const align = element.getAttribute('data-align');
          return isAlign(align) ? align : DEFAULTS.align;
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

  addKeyboardShortcuts() {
    return {
      // Into the selected block's controls, where there are any.
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        if (
          !('node' in selection) ||
          !isAssetBlock(selection.node) ||
          !editor.isEditable
        ) {
          return false;
        }
        const element = editor.view.nodeDOM(selection.from);
        if (!(element instanceof HTMLElement)) return false;
        const first = element.querySelector<HTMLElement>(
          `[${CONTROLS_ATTRIBUTE}] :is(input, button, [tabindex]):not([disabled])`,
        );
        if (first === null) return false;
        first.focus();
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('assetBlockTyping'),
        props: {
          // Text typed over a selection replaces it, and a selected block is
          // a selection: a field that opens with its caret at the end of
          // text ending in a block would lose the block to the first key
          // pressed. The words start a paragraph below the block instead.
          handleTextInput: (view, _from, _to, text) => {
            const { selection, schema, tr } = view.state;
            if (
              !(selection instanceof NodeSelection) ||
              !isAssetBlock(selection.node)
            ) {
              return false;
            }
            const paragraph = schema.nodes.paragraph;
            if (paragraph === undefined) return false;
            const below = selection.to;
            tr.insert(below, paragraph.create(null, schema.text(text)));
            tr.setSelection(
              TextSelection.create(tr.doc, below + 1 + text.length),
            );
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssetBlockView, {
      stopEvent: ({ event }) => isInControls(event),
      ignoreMutation: () => true,
    });
  },
});

/**
 * Puts a block showing `assetId` where the selection is, and the caret in
 * the paragraph after it. A block that would end the text brings an empty
 * paragraph with it, as a rule does: nothing else leaves somewhere to type
 * below it.
 */
export const insertAssetBlock = (editor: Editor, assetId: string): boolean =>
  editor
    .chain()
    .focus()
    .insertContent({ type: ASSET_BLOCK_NODE, attrs: { assetId } })
    .command(({ tr, dispatch }) => {
      if (tr.doc.lastChild?.type.name !== ASSET_BLOCK_NODE) return true;
      const paragraph = tr.doc.type.schema.nodes.paragraph;
      if (paragraph === undefined) return true;
      if (dispatch) {
        tr.insert(tr.doc.content.size, paragraph.create());
        tr.setSelection(Selection.atEnd(tr.doc));
      }
      return true;
    })
    .run();
