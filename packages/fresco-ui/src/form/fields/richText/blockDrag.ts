import {
  type EditorState,
  Plugin,
  PluginKey,
  type Transaction,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/**
 * A block being dragged by its handle (see `BlockFrameLayer`): where it is
 * (`from`), and where it would go if it were dropped now (`to`, a position
 * between two blocks), or null where it would stay where it is.
 */
export type BlockDrag = Readonly<{ from: number; to: number | null }>;

const isBlockDrag = (value: unknown): value is BlockDrag =>
  typeof value === 'object' &&
  value !== null &&
  'from' in value &&
  typeof value.from === 'number' &&
  'to' in value &&
  (value.to === null || typeof value.to === 'number');

const BLOCK_DRAG = new PluginKey<BlockDrag | null>('blockDrag');

/** The block being dragged in `state`, if one is. */
export const blockDragOf = (state: EditorState): BlockDrag | null =>
  BLOCK_DRAG.getState(state) ?? null;

/**
 * Says where the block being dragged would go, or (given null) that no block
 * is being dragged any more. Changes nothing in the document, so it is no
 * edit, and nothing to undo.
 */
export const showBlockDrag = (view: EditorView, drag: BlockDrag | null) => {
  view.dispatch(view.state.tr.setMeta(BLOCK_DRAG, drag));
};

/** Marks `tr` as ending the drag: no block is being dragged after it. */
export const endBlockDrag = (tr: Transaction): Transaction =>
  tr.setMeta(BLOCK_DRAG, null);

/**
 * What a block looks like where it would go: a copy of it as it is drawn,
 * faded, with nothing in it to reach or to read out (its tab, its ids, its
 * text are a copy's), and spaced as the block itself is.
 */
export const copyOfBlock = (element: HTMLElement): HTMLElement => {
  const copy = element.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return document.createElement('div');
  copy.style.removeProperty('display');
  copy.classList.remove('ProseMirror-selectednode');
  for (const tab of copy.querySelectorAll('[data-block-tab]')) tab.remove();
  for (const each of [copy, ...copy.querySelectorAll('[id]')]) {
    each.removeAttribute('id');
  }
  for (const each of [copy, ...copy.querySelectorAll('[contenteditable]')]) {
    each.setAttribute('contenteditable', 'false');
  }
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  return copy;
};

/**
 * Shows what dropping the block being dragged would do, without doing it: the
 * block is taken out of where it is, and a faded copy of it stands where it
 * would go, so the blocks around both places move as they would. Nothing is
 * shown while it would stay where it is.
 */
export const blockDragPlugin = () =>
  new Plugin<BlockDrag | null>({
    key: BLOCK_DRAG,
    state: {
      init: () => null,
      apply: (tr, current) => {
        const given: unknown = tr.getMeta(BLOCK_DRAG);
        if (given === null || isBlockDrag(given)) return given;
        // The document changed under the drag: what it would do is unknown.
        return tr.docChanged ? null : current;
      },
    },
    props: {
      decorations: (state) => {
        const drag = BLOCK_DRAG.getState(state) ?? null;
        if (drag === null || drag.to === null) return null;
        const { from, to } = drag;
        const node = state.doc.nodeAt(from);
        if (node === null) return null;
        return DecorationSet.create(state.doc, [
          Decoration.node(from, from + node.nodeSize, {
            'style': 'display: none',
            'data-block-dragged': '',
          }),
          Decoration.widget(
            to,
            (view) => {
              const dom = view.nodeDOM(from);
              const copy =
                dom instanceof HTMLElement
                  ? copyOfBlock(dom)
                  : document.createElement('div');
              copy.setAttribute('data-block-drop-preview', '');
              // On the element, over whatever its own classes give it.
              copy.style.pointerEvents = 'none';
              copy.style.opacity = '0.5';
              return copy;
            },
            { key: `block-drop-${from}-${to}`, side: -1 },
          ),
        ]);
      },
    },
  });
