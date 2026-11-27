import { type Editor, Extension } from '@tiptap/core';
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

/** The section the keys act on: a selected one, or the field the caret is in. */
const sectionAtSelection = (
  state: EditorState,
): Readonly<{ position: number; node: ProseMirrorNode }> | null => {
  const { selection } = state;
  if (selection instanceof NodeSelection && isSection(selection.node)) {
    return { position: selection.from, node: selection.node };
  }
  const { $from } = selection;
  if ($from.depth < 2) return null;
  const around = $from.node($from.depth - 1);
  if (!isSection(around) || !$from.parent.isTextblock) return null;
  return { position: $from.before($from.depth - 1), node: around };
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
 * Where a section moved one step up or down goes: past the section or block
 * beside it, into the nearest branch of a logic block beside it, or out of
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
 * Moves the selected section (or the field the caret is in) one step up or
 * down, as one edit, keeping what was selected. Mod-Shift-ArrowUp and
 * Mod-Shift-ArrowDown: the keyboard's way of dragging a block.
 */
const moveSection = (
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  direction: 'up' | 'down',
): boolean => {
  const found = sectionAtSelection(state);
  if (found === null) return false;
  const { position, node } = found;
  const target = moveTarget(state.doc, position, node.nodeSize, direction);
  if (target === null) return false;
  if (dispatch === undefined) return true;
  const { selection } = state;
  const wasNode = selection instanceof NodeSelection;
  const offset = selection.from - position;
  const tr = state.tr;
  // Taking the last block out of a branch leaves it an empty paragraph.
  tr.delete(position, position + node.nodeSize);
  const placed = tr.mapping.map(target, direction === 'up' ? -1 : 1);
  try {
    tr.insert(placed, node);
  } catch {
    return false;
  }
  const at = tr.doc.nodeAt(placed)?.type === node.type ? placed : null;
  if (at === null) return false;
  tr.setSelection(
    wasNode
      ? NodeSelection.create(tr.doc, at)
      : TextSelection.create(tr.doc, at + offset),
  );
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * What every section shares: the keys that move one, text typed or pasted
 * over a selected one, and a click on a part of one that is not text selecting it
 * whole.
 */
export const SectionBlocks = Extension.create({
  name: 'sectionBlocks',

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-ArrowUp': ({ editor }) =>
        moveSection(editor.state, editor.view.dispatch, 'up'),
      'Mod-Shift-ArrowDown': ({ editor }) =>
        moveSection(editor.state, editor.view.dispatch, 'down'),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('sectionBlocks'),
        props: {
          // Text typed over a selection replaces it, and a selected section
          // is a selection: a whole field would go with one key. The words
          // start a paragraph below it instead.
          handleTextInput: (view, _from, _to, text) => {
            const { selection, schema, tr } = view.state;
            if (
              !(selection instanceof NodeSelection) ||
              !isSection(selection.node)
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
          // Pasting over a selected section is the same: what is pasted goes
          // in below it, and the caret goes to its end.
          handlePaste: (view, _event, slice) => {
            const { selection, tr } = view.state;
            if (
              !(selection instanceof NodeSelection) ||
              !isSection(selection.node)
            ) {
              return false;
            }
            const below = selection.to;
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
          // label), selects the whole section, which is what shows its
          // settings.
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
