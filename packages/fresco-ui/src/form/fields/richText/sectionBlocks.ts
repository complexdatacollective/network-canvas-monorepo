import { type Editor, Extension } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type {
  Node as ProseMirrorNode,
  NodeType,
  ResolvedPos,
} from '@tiptap/pm/model';
import {
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { blockDragPlugin, endBlockDrag } from './blockDrag';

/**
 * The schema group of the blocks that stand as whole sections of a document
 * (a form's fields, logic blocks): allowed among the document's own blocks
 * and inside a logic block's branches, never inside a list item, a heading or
 * a paragraph.
 */
export const SECTION_GROUP = 'section';

const isSectionType = (type: NodeType): boolean =>
  (type.spec.group ?? '').split(' ').includes(SECTION_GROUP);

const isSection = (node: ProseMirrorNode): boolean => isSectionType(node.type);

const sectionTypesOf = (type: NodeType): NodeType[] =>
  Object.values(type.schema.nodes).filter(isSectionType);

/** Whether a node of `type` can hold sections among its children. */
export const holdsSections = (type: NodeType): boolean =>
  sectionTypesOf(type).some((section) => type.contentMatch.matchType(section));

/**
 * The depth of the innermost node around `$pos` that can hold sections (the
 * document, or a logic block's branch).
 */
const containerDepth = ($pos: ResolvedPos): number => {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (holdsSections($pos.node(depth).type)) return depth;
  }
  return 0;
};

/** Whether the children of `node`, at `depth`, are blocks: the document, or a branch. */
const isBlockContainer = (node: ProseMirrorNode, depth: number): boolean =>
  depth === 0 || holdsSections(node.type);

/** A block of the document, and where it is. */
type FoundBlock = Readonly<{ pos: number; node: ProseMirrorNode }>;

/**
 * The block the selection is: a block selected whole (a paragraph, a heading,
 * a whole list, a rule, a field, a logic block, a file), not text in one. A
 * caret in a paragraph is not a selection of the paragraph.
 */
export const selectedBlockOf = (state: EditorState): FoundBlock | null => {
  const { selection } = state;
  if (!(selection instanceof NodeSelection)) return null;
  const { $from } = selection;
  return isBlockContainer($from.parent, $from.depth)
    ? { pos: selection.from, node: selection.node }
    : null;
};

/**
 * The block the selection is in: a block selected whole, or the innermost
 * block that the caret (or the start of a selection of text) is in. In a
 * list, that is the whole list: its items are not blocks.
 */
export const blockAtSelection = (state: EditorState): FoundBlock | null => {
  const selected = selectedBlockOf(state);
  if (selected !== null) return selected;
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (isBlockContainer($from.node(depth - 1), depth - 1)) {
      return { pos: $from.before(depth), node: $from.node(depth) };
    }
  }
  return null;
};

/**
 * The tab of the block at `position` (`BlockTab`), where it has one now: a
 * block that holds other blocks has none of its own.
 */
const tabOf = (view: EditorView, block: FoundBlock): HTMLElement | null => {
  const first = block.node.firstChild;
  if (first !== null && !block.node.isTextblock && holdsSections(first.type)) {
    return null;
  }
  const dom = view.nodeDOM(block.pos);
  if (!(dom instanceof HTMLElement)) return null;
  const tab = dom.querySelector('[data-block-tab]');
  return tab instanceof HTMLElement ? tab : null;
};

/** The first control of a block's tab: what Tab on the selected block moves to. */
export const tabControlOf = (
  view: EditorView,
  block: FoundBlock,
): HTMLElement | null =>
  tabOf(view, block)?.querySelector<HTMLElement>('button:not([disabled])') ??
  null;

/** The button of a block's tab that Enter on the selected block presses. */
export const tabActionOf = (
  view: EditorView,
  block: FoundBlock,
): HTMLElement | null =>
  tabOf(view, block)?.querySelector<HTMLElement>(
    '[data-block-action]:not([disabled])',
  ) ?? null;

type Placement = Readonly<{ from: number; to: number }>;

/**
 * Where a section goes for the selection: after a selected section; in place
 * of the empty line the caret is on; before the line whose start the caret
 * is at; otherwise after the block the caret is in (a whole list, when the
 * caret is in one of its items, since a section never goes into a list).
 */
const placementFor = (state: EditorState): Placement => {
  const { selection } = state;
  if (selection instanceof NodeSelection && isSection(selection.node)) {
    return { from: selection.to, to: selection.to };
  }
  const { $from } = selection;
  const depth = containerDepth($from);
  if (depth === $from.depth) return { from: $from.pos, to: $from.pos };
  const child = $from.node(depth + 1);
  const start = $from.before(depth + 1);
  const end = $from.after(depth + 1);
  if (child.isTextblock && child.content.size === 0) {
    return { from: start, to: end };
  }
  if (
    child.isTextblock &&
    $from.depth === depth + 1 &&
    $from.parentOffset === 0
  ) {
    return { from: start, to: start };
  }
  return { from: end, to: end };
};

/** A section as a document holds it (a field block, a logic block). */
type SectionContent = Readonly<{
  type: string;
  attrs?: Readonly<Record<string, unknown>>;
  content?: readonly unknown[];
}>;

/** Where the caret goes in a section just placed. */
export type SectionSelection = 'node' | 'text';

/**
 * Puts the section `content` in at the nearest place a section can stand
 * (see `placementFor`), as one edit, and selects it: the whole block, or the
 * caret at the start of its first line of text. A section that would end the
 * document brings an empty paragraph with it, so there is somewhere to type
 * below it. Returns where the section went, or null when it could not go in.
 */
export const insertSection = (
  editor: Editor,
  content: SectionContent,
  select: SectionSelection,
): number | null => {
  if (!editor.isEditable) return null;
  const { state } = editor;
  let node: ProseMirrorNode;
  try {
    node = state.schema.nodeFromJSON(content);
    node.check();
  } catch {
    return null;
  }
  const { from, to } = placementFor(state);
  const tr = state.tr;
  try {
    tr.replaceWith(from, to, node);
  } catch {
    return null;
  }
  const placed = tr.doc.nodeAt(from);
  if (placed === null || placed.type !== node.type) return null;
  const after = from + placed.nodeSize;
  const paragraph = state.schema.nodes.paragraph;
  if (after === tr.doc.content.size && paragraph !== undefined) {
    tr.insert(after, paragraph.create());
  }
  tr.setSelection(
    select === 'node'
      ? NodeSelection.create(tr.doc, from)
      : TextSelection.near(tr.doc.resolve(from + 1)),
  );
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return from;
};

/** Whether `node` is a section whose first or last child holds sections. */
const enterableAt = (
  node: ProseMirrorNode,
  side: 'first' | 'last',
): boolean => {
  if (!isSection(node)) return false;
  const child = side === 'first' ? node.firstChild : node.lastChild;
  return child !== null && holdsSections(child.type);
};

/**
 * Where a block moved one step up or down goes: past the block beside it, into the nearest branch of a logic block beside it, or out of
 * the branch it is in, into the branch beside that or past the logic block.
 * Null at the very top or bottom of the document.
 */
const moveTarget = (
  doc: ProseMirrorNode,
  position: number,
  size: number,
  direction: 'up' | 'down',
): number | null => {
  const $pos = doc.resolve(position);
  const parent = $pos.parent;
  const index = $pos.index();
  if (direction === 'up') {
    const before = index > 0 ? parent.child(index - 1) : null;
    if (before !== null) {
      const start = position - before.nodeSize;
      // The end of the last branch: inside the block and inside the branch.
      return enterableAt(before, 'last') ? start + before.nodeSize - 2 : start;
    }
    if ($pos.depth < 2 || !isSection($pos.node($pos.depth - 1))) return null;
    const branchIndex = $pos.index($pos.depth - 1);
    const branchStart = $pos.before($pos.depth);
    // The end of the branch before, or before the whole logic block.
    return branchIndex > 0 ? branchStart - 1 : $pos.before($pos.depth - 1);
  }
  const end = position + size;
  const after = index < parent.childCount - 1 ? parent.child(index + 1) : null;
  if (after !== null) {
    return enterableAt(after, 'first') ? end + 2 : end + after.nodeSize;
  }
  if ($pos.depth < 2 || !isSection($pos.node($pos.depth - 1))) return null;
  const block = $pos.node($pos.depth - 1);
  const branchIndex = $pos.index($pos.depth - 1);
  const branchEnd = $pos.after($pos.depth);
  return branchIndex < block.childCount - 1
    ? branchEnd + 1
    : $pos.after($pos.depth - 1);
};

/**
 * Moves the block at `position` to `target` (a position between two blocks,
 * in the document as it is before the move), in `tr`, and selects it there:
 * the whole block, or the text at `offset` inside it. `bias` says which way
 * `target` leans when the block is taken out right beside it. Taking the
 * last block out of a branch leaves it an empty paragraph. Returns where the
 * block went, or null (with `tr` left unusable) where it cannot go there.
 */
const placeBlock = (
  tr: Transaction,
  position: number,
  target: number,
  bias: -1 | 1,
  select: 'node' | Readonly<{ offset: number }>,
): number | null => {
  const node = tr.doc.nodeAt(position);
  if (node === null) return null;
  tr.delete(position, position + node.nodeSize);
  const placed = tr.mapping.map(target, bias);
  try {
    tr.insert(placed, node);
  } catch {
    return null;
  }
  if (tr.doc.nodeAt(placed)?.type !== node.type) return null;
  tr.setSelection(
    select === 'node'
      ? NodeSelection.create(tr.doc, placed)
      : TextSelection.create(tr.doc, placed + select.offset),
  );
  return placed;
};

/**
 * Moves the block at `position` to `target`, a position between two blocks
 * (in the document or in a logic block's branch), as one edit that is undone
 * on its own, and selects it there: what a block dropped by its handle does
 * (see `BlockFrameLayer`). The drag ends with it. Returns whether it moved.
 */
export const moveBlockTo = (
  view: EditorView,
  position: number,
  target: number,
): boolean => {
  const tr = view.state.tr;
  const bias = target > position ? 1 : -1;
  if (placeBlock(tr, position, target, bias, 'node') === null) return false;
  view.dispatch(closeHistory(endBlockDrag(tr)).scrollIntoView());
  return true;
};

/**
 * Moves the selected block (or the block the caret is in) one step up or
 * down, as one edit, keeping what was selected. Mod-Shift-ArrowUp and
 * Mod-Shift-ArrowDown: the keyboard's way of dragging a block by its handle.
 */
export const moveBlock = (
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  direction: 'up' | 'down',
): boolean => {
  const found = blockAtSelection(state);
  if (found === null) return false;
  const { pos: position, node } = found;
  const target = moveTarget(state.doc, position, node.nodeSize, direction);
  if (target === null) return false;
  if (dispatch === undefined) return true;
  const { selection } = state;
  const tr = state.tr;
  const placed = placeBlock(
    tr,
    position,
    target,
    direction === 'up' ? -1 : 1,
    selection instanceof NodeSelection
      ? 'node'
      : { offset: selection.from - position },
  );
  if (placed === null) return false;
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * What every block of a document shares where blocks have frames (see
 * `BlockFrameLayer`):
 *
 * - Mod-Shift-ArrowUp and Mod-Shift-ArrowDown move the selected block, or the
 *   block the caret is in, one step up or down (`moveBlock`).
 * - Escape in a block's text selects the block (a field's question and hint
 *   have their own Escape). It is not spent: what the editor stands in may
 *   act on it too.
 * - Tab on a selected block moves to the first control of its tab, where it
 *   has one (`BlockTab`); Enter presses the tab's action, which opens the
 *   block's settings.
 * - Text typed or pasted over a selected block goes below it.
 * - A click on a section's frame, or on what its view draws that is not
 *   text, selects the whole section.
 * - While a block is dragged by its handle, the document shows what dropping
 *   it would do (`blockDragPlugin`).
 */
export const DocumentBlocks = Extension.create({
  name: 'documentBlocks',

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-ArrowUp': ({ editor }) =>
        moveBlock(editor.state, editor.view.dispatch, 'up'),
      'Mod-Shift-ArrowDown': ({ editor }) =>
        moveBlock(editor.state, editor.view.dispatch, 'down'),
      'Tab': ({ editor }) => {
        const selected = selectedBlockOf(editor.state);
        if (selected === null) return false;
        const control = tabControlOf(editor.view, selected);
        if (control === null) return false;
        control.focus();
        return true;
      },
      'Enter': ({ editor }) => {
        const selected = selectedBlockOf(editor.state);
        if (selected === null || !editor.isEditable) return false;
        const action = tabActionOf(editor.view, selected);
        if (action === null) return false;
        action.click();
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      blockDragPlugin(),
      new Plugin({
        key: new PluginKey('documentBlocks'),
        props: {
          handleKeyDown: (view, event) => {
            if (
              event.key !== 'Escape' ||
              view.state.selection instanceof NodeSelection
            ) {
              return false;
            }
            const block = blockAtSelection(view.state);
            if (block === null) return false;
            view.dispatch(
              view.state.tr.setSelection(
                NodeSelection.create(view.state.doc, block.pos),
              ),
            );
            // Not spent: a host that undoes its changes on Escape still does.
            return false;
          },
          // Text typed over a selection replaces it, and a selected block
          // is a selection: a whole field, file or paragraph would go with
          // one key. The words start a paragraph below it instead.
          handleTextInput: (view, _from, _to, text) => {
            const { schema, tr } = view.state;
            const selected = selectedBlockOf(view.state);
            const paragraph = schema.nodes.paragraph;
            if (selected === null || paragraph === undefined) return false;
            const below = selected.pos + selected.node.nodeSize;
            tr.insert(below, paragraph.create(null, schema.text(text)));
            tr.setSelection(
              TextSelection.create(tr.doc, below + 1 + text.length),
            );
            view.dispatch(tr.scrollIntoView());
            return true;
          },
          // Pasting over a selected block is the same: what is pasted goes
          // in below it, and the caret goes to its end.
          handlePaste: (view, _event, slice) => {
            const selected = selectedBlockOf(view.state);
            if (selected === null) return false;
            const { tr } = view.state;
            const below = selected.pos + selected.node.nodeSize;
            tr.replaceRange(below, below, slice);
            let end = below;
            tr.mapping.maps.at(-1)?.forEach((_from, _to, _newFrom, newTo) => {
              end = newTo;
            });
            tr.setSelection(Selection.near(tr.doc.resolve(end), -1));
            view.dispatch(
              tr
                .scrollIntoView()
                .setMeta('paste', true)
                .setMeta('uiEvent', 'paste'),
            );
            return true;
          },
          // A click on a section's frame, or on what its view draws that is
          // not text (a field's control, a logic block's heading, a branch's
          // label), selects the whole section.
          handleClickOn: (
            view,
            _position,
            node,
            nodePosition,
            event,
            direct,
          ) => {
            if (!direct || !view.editable) return false;
            let at: number | null = null;
            if (isSection(node)) {
              at = nodePosition;
            } else if (holdsSections(node.type) && nodePosition > 0) {
              const $branch = view.state.doc.resolve(nodePosition);
              if (isSection($branch.parent)) at = $branch.before();
            }
            if (at === null) return false;
            view.dispatch(
              view.state.tr.setSelection(
                NodeSelection.create(view.state.doc, at),
              ),
            );
            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});
