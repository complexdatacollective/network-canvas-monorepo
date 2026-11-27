'use client';

import {
  type AnyExtension,
  type Editor,
  type JSONContent,
  mergeAttributes,
  Node as TiptapNode,
} from '@tiptap/core';
import { type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
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

import { cx } from '../../../utils/cva';
import { FIELD_BLOCK_NODE } from './fieldBlockNode';
import { insertSection, SECTION_GROUP } from './sectionBlocks';
import {
  PLACEHOLDER_CLASSES,
  SectionDragHandle,
  sectionFrameVariants,
} from './sectionFrame';

export const LOGIC_BLOCK_NODE = 'logicBlock';
export const LOGIC_BRANCH_NODE = 'logicBranch';

/**
 * One branch of a logic block, as its consumer names it. "Branch" is this
 * node's word for what Network Canvas calls a version of a logic block
 * elsewhere: "versions" already names the inline node of `versionsNode`.
 *
 * `key` is what the `key` is what the
 * consumer records the branch as ("If", an answer, "Otherwise"…), and `meta`
 * whatever else it needs (a condition id, say). Both are opaque here.
 */
export type RichTextLogicBranch = Readonly<{ key: string; meta: unknown }>;

/** A branch as the document holds it: its name and the blocks it shows. */
export type RichTextLogicBranchContent = Readonly<{
  type: typeof LOGIC_BRANCH_NODE;
  attrs: RichTextLogicBranch;
  content: readonly JSONContent[];
}>;

/**
 * Content shown only in some cases, as the document holds it: a block of its
 * own among the document's blocks (or inside another logic block's branch),
 * with one branch for each case. A branch holds any blocks, fields included.
 * `meta` is the consumer's (which logic, which value it reads).
 */
export type RichTextLogicBlockContent = Readonly<{
  type: typeof LOGIC_BLOCK_NODE;
  attrs: Readonly<{ meta: unknown }>;
  content: readonly RichTextLogicBranchContent[];
}>;

/**
 * The form's fields as one logic block sees them, by field id: those inside
 * the block (at any depth); those in another version of a logic block that
 * contains it, which are never shown with it; and the rest of the document's
 * fields.
 */
export type RichTextLogicBlockFieldScope = Readonly<{
  inside: readonly string[];
  otherVersions: readonly string[];
  outside: readonly string[];
}>;

/** What a logic block's view is given to draw the block. */
export type RichTextLogicBlockViewProps = Readonly<{
  meta: unknown;
  branches: readonly RichTextLogicBranch[];
  /** The branches, as editable content. The view places it, exactly once. */
  content: ReactNode;
  selected: boolean;
  editable: boolean;
  active: boolean;
  /**
   * Changes the block's logic and its branches, as one undoable edit:
   * branches whose key is kept keep their content (see `setLogicBlock`).
   */
  update: (meta: unknown, branches: readonly RichTextLogicBranch[]) => void;
  remove: () => void;
  /** Selects the whole block, with the keyboard in the text. */
  select: () => void;
  /** The block's frame as drawn, for anchoring a popover to. */
  element: () => HTMLElement | null;
  /** Where the document's field blocks are, seen from this block, now. */
  fieldScope: () => RichTextLogicBlockFieldScope;
  /** The keys of the block's branches that show something, now. */
  branchesWithContent: () => readonly string[];
}>;

/** What the label at the top of a branch is given. */
export type RichTextLogicBranchLabelProps = Readonly<{
  /** The `meta` of the logic block the branch belongs to. */
  blockMeta: unknown;
  branch: RichTextLogicBranch;
  /** The branch's place among the block's branches, from 0. */
  index: number;
  /** Whether the branch shows nothing (one empty paragraph). */
  empty: boolean;
  editable: boolean;
}>;

/**
 * What a field that holds logic blocks is given by its consumer, which knows
 * what the logic means.
 */
export type RichTextLogicBlocks = Readonly<{
  /** Draws a logic block: everything in it other than its branches. */
  View: ComponentType<RichTextLogicBlockViewProps>;
  /** The label at the top of each branch ("If: …", "Otherwise"). */
  BranchLabel: ComponentType<RichTextLogicBranchLabelProps>;
  /** Shown in a branch that shows nothing, such as “Nothing is shown.” */
  emptyBranchText: string;
}>;

/** What a logic block's views are told of the field around them. */
type LogicBlocksField = Readonly<{
  blocks: RichTextLogicBlocks | null;
  editable: boolean;
  active: boolean;
}>;

export const LogicBlocksContext = createContext<LogicBlocksField>({
  blocks: null,
  editable: true,
  active: false,
});

/** Where the extensions read their consumer from (see `InlineValuesSource`). */
export type LogicBlocksSource = Readonly<{
  current: () => RichTextLogicBlocks | undefined;
}>;

const META_ATTRIBUTE = 'data-meta';

const parseMeta = (element: HTMLElement): unknown => {
  const written = element.getAttribute(META_ATTRIBUTE);
  if (written === null || written === '') return null;
  try {
    const meta: unknown = JSON.parse(written);
    return meta;
  } catch {
    return null;
  }
};

const metaAttribute = {
  default: null,
  parseHTML: parseMeta,
  renderHTML: (attributes: Record<string, unknown>) =>
    attributes.meta === null || attributes.meta === undefined
      ? {}
      : { [META_ATTRIBUTE]: JSON.stringify(attributes.meta) },
};

const branchOf = (node: ProseMirrorNode): RichTextLogicBranch => ({
  key: typeof node.attrs.key === 'string' ? node.attrs.key : '',
  meta: node.attrs.meta as unknown,
});

const branchesOf = (node: ProseMirrorNode): RichTextLogicBranch[] => {
  const branches: RichTextLogicBranch[] = [];
  node.forEach((child) => branches.push(branchOf(child)));
  return branches;
};

/** Whether a branch shows nothing: one empty paragraph. */
const isEmptyBranch = (node: ProseMirrorNode): boolean =>
  node.childCount === 1 &&
  node.firstChild?.type.name === 'paragraph' &&
  node.firstChild.content.size === 0;

/** The keys of the branches of `block` that show something. */
const branchesWithContent = (block: ProseMirrorNode): string[] => {
  const keys: string[] = [];
  block.forEach((branch) => {
    if (!isEmptyBranch(branch)) keys.push(branchOf(branch).key);
  });
  return keys;
};

/** A new logic block, each branch holding one empty paragraph. */
const logicBlockContent = (
  meta: unknown,
  branches: readonly RichTextLogicBranch[],
): RichTextLogicBlockContent => ({
  type: LOGIC_BLOCK_NODE,
  attrs: { meta },
  content: branches.map(({ key, meta: branchMeta }) => ({
    type: LOGIC_BRANCH_NODE,
    attrs: { key, meta: branchMeta },
    content: [{ type: 'paragraph' }],
  })),
});

/**
 * Puts a new logic block in at the nearest place a section can stand and
 * selects it. Returns where it went, or null.
 */
export const insertLogicBlock = (
  editor: Editor,
  meta: unknown,
  branches: readonly RichTextLogicBranch[],
): number | null =>
  branches.length === 0
    ? null
    : insertSection(editor, logicBlockContent(meta, branches), 'node');

/**
 * Rewrites the logic block at `position` with new logic and branches, as one
 * edit: a branch whose key the block already has keeps its content (and
 * takes the new `meta`), and a new key starts empty. Branches whose key goes
 * are removed with what they held.
 */
export const setLogicBlock = (
  editor: Editor,
  position: number,
  meta: unknown,
  branches: readonly RichTextLogicBranch[],
): boolean => {
  const { state } = editor;
  const node = state.doc.nodeAt(position);
  const { schema } = state;
  const blockType = schema.nodes[LOGIC_BLOCK_NODE];
  const branchType = schema.nodes[LOGIC_BRANCH_NODE];
  const paragraph = schema.nodes.paragraph;
  if (
    node === null ||
    node.type !== blockType ||
    branchType === undefined ||
    paragraph === undefined ||
    branches.length === 0
  ) {
    return false;
  }
  const kept = new Map<string, ProseMirrorNode>();
  node.forEach((branch) => {
    const { key } = branchOf(branch);
    if (!kept.has(key)) kept.set(key, branch);
  });
  const rebuilt = blockType.create(
    { ...node.attrs, meta },
    branches.map(({ key, meta: branchMeta }) =>
      branchType.create(
        { key, meta: branchMeta },
        kept.get(key)?.content ?? paragraph.create(),
      ),
    ),
  );
  const wasSelected =
    state.selection instanceof NodeSelection &&
    state.selection.from === position;
  const tr = state.tr.replaceWith(position, position + node.nodeSize, rebuilt);
  if (wasSelected) tr.setSelection(NodeSelection.create(tr.doc, position));
  editor.view.dispatch(tr);
  return true;
};

/** The ids of the field blocks inside `node`, at any depth. */
const fieldIdsIn = (node: ProseMirrorNode): string[] => {
  const ids: string[] = [];
  node.descendants((child) => {
    if (child.type.name !== FIELD_BLOCK_NODE) return true;
    const { fieldId } = child.attrs;
    if (typeof fieldId === 'string' && fieldId !== '') ids.push(fieldId);
    return false;
  });
  return ids;
};

const NO_FIELD_SCOPE: RichTextLogicBlockFieldScope = {
  inside: [],
  otherVersions: [],
  outside: [],
};

/**
 * The field scope (`RichTextLogicBlockFieldScope`) of the logic block at
 * `position` in `doc`: for each logic block that contains it, from the
 * nearest outwards, the fields of its branches other than the one that the
 * block is in are its other versions.
 */
export const logicBlockFieldScope = (
  doc: ProseMirrorNode,
  position: number,
): RichTextLogicBlockFieldScope => {
  const block = doc.nodeAt(position);
  if (block?.type.name !== LOGIC_BLOCK_NODE) return NO_FIELD_SCOPE;
  const inside = fieldIdsIn(block);
  const otherVersions: string[] = [];
  const $position = doc.resolve(position);
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if ($position.node(depth).type.name !== LOGIC_BRANCH_NODE) continue;
    const branchIndex = $position.index(depth - 1);
    $position.node(depth - 1).forEach((branch, _offset, index) => {
      if (index !== branchIndex) otherVersions.push(...fieldIdsIn(branch));
    });
  }
  const seen = new Set([...inside, ...otherVersions]);
  return {
    inside,
    otherVersions,
    outside: fieldIdsIn(doc).filter((id) => !seen.has(id)),
  };
};

function LogicBlockView({
  node,
  selected,
  editor,
  getPos,
  deleteNode,
}: ReactNodeViewProps) {
  const { blocks, editable, active } = useContext(LogicBlocksContext);
  const frame = useRef<HTMLElement>(null);
  const content = <NodeViewContent data-logic-branches="" />;
  return (
    <NodeViewWrapper
      ref={frame}
      data-logic-block-view=""
      data-selected={selected || undefined}
      className={sectionFrameVariants({ kind: 'logic', selected })}
    >
      <SectionDragHandle editable={editable} />
      {/*
        Clips what the consumer draws (a header's background, say) to the
        frame's rounded corners, inside its border. The frame itself does not
        clip, so the handle in the gutter before it is drawn whole; a section
        in a branch keeps its own handle inside the branch's gutter.
      */}
      <div className="overflow-clip rounded-[calc(var(--radius-lg)-2px)]">
        {blocks === null ? (
          content
        ) : (
          <blocks.View
            meta={node.attrs.meta as unknown}
            branches={branchesOf(node)}
            content={content}
            selected={selected}
            editable={editable}
            active={active}
            update={(meta, branches) => {
              const position = getPos();
              if (!editable || position === undefined) return;
              setLogicBlock(editor, position, meta, branches);
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
            element={() => frame.current}
            fieldScope={() => {
              const position = getPos();
              return position === undefined
                ? NO_FIELD_SCOPE
                : logicBlockFieldScope(editor.state.doc, position);
            }}
            branchesWithContent={() => {
              const position = getPos();
              const block =
                position === undefined
                  ? null
                  : editor.state.doc.nodeAt(position);
              return block === null ? [] : branchesWithContent(block);
            }}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}

function LogicBranchView({ node, editor, getPos }: ReactNodeViewProps) {
  const { blocks, editable } = useContext(LogicBlocksContext);
  const position = getPos();
  const $branch =
    position === undefined ? null : editor.state.doc.resolve(position);
  const block = $branch?.parent;
  const empty = isEmptyBranch(node);
  return (
    <NodeViewWrapper
      data-logic-branch-view=""
      data-key={branchOf(node).key}
      data-empty={empty || undefined}
      className={cx(
        'border-info/40 px-4 py-3 not-first:border-t not-first:border-dashed',
        empty && 'flex flex-wrap items-baseline gap-x-2',
      )}
    >
      {blocks !== null && (
        <div contentEditable={false} className="select-none">
          <blocks.BranchLabel
            blockMeta={block?.attrs.meta as unknown}
            branch={branchOf(node)}
            index={$branch?.index() ?? 0}
            empty={empty}
            editable={editable}
          />
        </div>
      )}
      {/*
        What the branch shows starts 32px in, a gutter for the drag handles of
        the sections in it (see `SectionDragHandle`). An empty branch holds
        none, and says so on the line of its label.
      */}
      <NodeViewContent className={empty ? 'min-w-0 flex-1' : 'ps-4'} />
    </NodeViewWrapper>
  );
}

const EMPTY_BRANCHES = new PluginKey('logicBlockEmptyBranches');

/**
 * Logic blocks and their branches, drawn by the consumer's views
 * (`RichTextLogicBlocks`). A block is moved by its handle or with
 * Mod-Shift-ArrowUp and Mod-Shift-ArrowDown, and copied and pasted whole,
 * between editors too: its logic travels as data attributes. A branch that
 * shows nothing says so (`emptyBranchText`).
 */
export const createLogicBlockNodes = (
  source: LogicBlocksSource,
): AnyExtension[] => {
  const LogicBranch = TiptapNode.create({
    name: LOGIC_BRANCH_NODE,
    content: `(block | ${SECTION_GROUP})+`,
    isolating: true,
    defining: true,
    selectable: false,

    addAttributes() {
      return {
        key: {
          default: '',
          parseHTML: (element) => element.getAttribute('data-key') ?? '',
          renderHTML: (attributes) => ({ 'data-key': attributes.key }),
        },
        meta: metaAttribute,
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-logic-branch]', priority: 60 }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes({ 'data-logic-branch': '' }, HTMLAttributes),
        0,
      ];
    },

    addNodeView() {
      return ReactNodeViewRenderer(LogicBranchView);
    },
  });

  const LogicBlock = TiptapNode.create({
    name: LOGIC_BLOCK_NODE,
    group: SECTION_GROUP,
    content: `${LOGIC_BRANCH_NODE}+`,
    isolating: true,
    selectable: true,
    draggable: true,

    addAttributes() {
      return { meta: metaAttribute };
    },

    parseHTML() {
      return [{ tag: 'div[data-logic-block]', priority: 60 }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes({ 'data-logic-block': '' }, HTMLAttributes),
        0,
      ];
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: EMPTY_BRANCHES,
          props: {
            decorations: (state) => {
              const text = source.current()?.emptyBranchText;
              if (text === undefined || text === '') return DecorationSet.empty;
              const decorations: Decoration[] = [];
              state.doc.descendants((node, position) => {
                if (node.type.name !== LOGIC_BRANCH_NODE) return true;
                if (isEmptyBranch(node)) {
                  const start = position + 1;
                  decorations.push(
                    Decoration.node(start, start + 2, {
                      'data-placeholder': text,
                      'class': PLACEHOLDER_CLASSES,
                    }),
                  );
                  return false;
                }
                return true;
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },

    addNodeView() {
      return ReactNodeViewRenderer(LogicBlockView);
    },
  });

  return [LogicBlock, LogicBranch];
};
