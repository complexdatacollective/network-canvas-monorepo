'use client';

import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { GripVertical } from 'lucide-react';
import {
  createContext,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { cx } from '../../../utils/cva';
import { blockDragOf, copyOfBlock, showBlockDrag } from './blockDrag';
import { holdsSections, moveBlockTo, selectedBlockOf } from './sectionBlocks';

/**
 * Block frames: what the editor draws round the block under the pointer and
 * the selected block, so that a researcher sees what a block is and can move
 * it. A block is one of the document's own blocks or one in a logic block's
 * branch: a paragraph, a heading, a whole list, a rule, a field, a logic
 * block or a file. The items of a list are not blocks.
 *
 * Everything here is drawn over the page, outside the text (`BlockFrameLayer`),
 * so it changes nothing in the text's layout or in its editable content, and
 * never touches what is being typed or composed. Only the tab of a block with
 * settings (`BlockTab`) is drawn by the block's own view, beside its settings.
 */

/** A block, where the document holds it and where the editor draws it. */
type DrawnBlock = Readonly<{
  pos: number;
  node: ProseMirrorNode;
  dom: HTMLElement;
}>;

/** Whether `node` is a block whose own children are blocks: a logic block. */
const holdsBranches = (node: ProseMirrorNode): boolean => {
  const first = node.firstChild;
  return first !== null && !node.isTextblock && holdsSections(first.type);
};

/**
 * Whether `block` is the one empty line of a logic block's branch that shows
 * nothing. It is where the branch's content is written, not a block that the
 * researcher made: it has no handle, and is not moved.
 */
const isEmptyBranchLine = (view: EditorView, block: DrawnBlock): boolean => {
  if (!block.node.isTextblock || block.node.content.size !== 0) return false;
  const $block = view.state.doc.resolve(block.pos);
  return (
    $block.depth > 0 &&
    holdsSections($block.parent.type) &&
    $block.parent.childCount === 1
  );
};

const drawnChildren = (
  view: EditorView,
  container: ProseMirrorNode,
  start: number,
): DrawnBlock[] => {
  const blocks: DrawnBlock[] = [];
  container.forEach((node, offset) => {
    const pos = start + offset;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) blocks.push({ pos, node, dom });
  });
  return blocks;
};

/** The block of `blocks` nearest `y`, and how far from it `y` is. */
const nearestTo = (blocks: readonly DrawnBlock[], y: number) => {
  let nearest: Readonly<{ block: DrawnBlock; distance: number }> | null = null;
  for (const block of blocks) {
    const box = block.dom.getBoundingClientRect();
    const distance =
      y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
    if (nearest === null || distance < nearest.distance) {
      nearest = { block, distance };
    }
  }
  return nearest;
};

/**
 * The innermost block at the point (`x`, `y`) of the window. Every point
 * level with a block counts as over it, its gutter included, and a point in
 * the space between two blocks counts as over the nearer. A point inside a
 * logic block is over the block in its branch at that height, from the
 * branch's own gutter onwards, or over the logic block itself where its
 * branches show no block (its heading, a branch's label, a branch that
 * shows nothing).
 */
export const blockAtPoint = (
  view: EditorView,
  x: number,
  y: number,
): DrawnBlock | null => {
  let current =
    nearestTo(drawnChildren(view, view.state.doc, 0), y)?.block ?? null;
  while (current !== null && holdsBranches(current.node)) {
    const box = current.dom.getBoundingClientRect();
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) {
      return current;
    }
    let inner: DrawnBlock | null = null;
    const block = current;
    block.node.forEach((branch, offset) => {
      const branchPos = block.pos + 1 + offset;
      const branchDom = view.nodeDOM(branchPos);
      if (!(branchDom instanceof HTMLElement)) return;
      const shown =
        branchDom.querySelector('[data-node-view-content]') ?? branchDom;
      const shownBox = shown.getBoundingClientRect();
      if (y < shownBox.top || y > shownBox.bottom) return;
      const nearest =
        nearestTo(drawnChildren(view, branch, branchPos + 1), y)?.block ?? null;
      // A branch that shows nothing has no block of its own in it: the
      // pointer there is over the logic block.
      inner =
        nearest === null || isEmptyBranchLine(view, nearest) ? null : nearest;
    });
    if (inner === null) return current;
    current = inner;
  }
  return current;
};

/** Every block the document draws, at any depth. */
const drawnBlocks = (view: EditorView): DrawnBlock[] => {
  const all: DrawnBlock[] = [];
  const visit = (container: ProseMirrorNode, start: number) => {
    for (const block of drawnChildren(view, container, start)) {
      all.push(block);
      if (!holdsBranches(block.node)) continue;
      block.node.forEach((branch, offset) =>
        visit(branch, block.pos + 1 + offset + 1),
      );
    }
  };
  visit(view.state.doc, 0);
  return all;
};

/**
 * What the pointer is over: the block, drawn. Held apart from the editor's
 * state, since hovering changes nothing in the document or its selection.
 */
export type BlockFrameStore = Readonly<{
  hovered: () => HTMLElement | null;
  setHovered: (element: HTMLElement | null) => void;
  subscribe: (listener: () => void) => () => void;
}>;

export const createBlockFrameStore = (): BlockFrameStore => {
  let hovered: HTMLElement | null = null;
  const listeners = new Set<() => void>();
  return {
    hovered: () => hovered,
    setHovered: (element) => {
      if (element === hovered) return;
      hovered = element;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

/** The store of the editor a block view is in; null where blocks have no frames. */
export const BlockFramesContext = createContext<BlockFrameStore | null>(null);

const NOTHING_HOVERED = () => () => undefined;

/**
 * Whether the pointer is over the block that a node view draws (and not over
 * a block inside it).
 */
export function useBlockHovered(
  editor: Editor,
  getPos: () => number | undefined,
): boolean {
  const store = useContext(BlockFramesContext);
  return useSyncExternalStore(store?.subscribe ?? NOTHING_HOVERED, () => {
    const hovered = store?.hovered() ?? null;
    if (hovered === null || editor.isDestroyed) return false;
    const position = getPos();
    return position !== undefined && editor.view.nodeDOM(position) === hovered;
  });
}

/**
 * Marks the element that a block's frame is drawn round, where that is not
 * the whole block: the file drawn in a file's block, which can be narrower
 * than the line it stands on. `boxed` for a file with a shape of its own (a
 * picture, a video), whose frame follows its corners.
 */
export const blockBoxProps = (boxed: boolean) =>
  ({
    'data-block-box': '',
    ...(boxed && { 'data-block-boxed': '' }),
  }) as const;

/**
 * The tab of a block with settings: on the top edge of its frame, at the
 * block's end, outside the block, so that it covers the block above rather
 * than its own. It holds what the block's consumer puts in it (a field's
 * attribute, the settings button, `BlockSettingsButton`). The first button
 * in it is what Tab from the selected block moves to, and what Enter on the
 * selected block presses (`data-block-action`). Drawn by the block's view
 * while its frame shows, inside the element the frame is drawn round.
 *
 * What starts the tab other than a block's own round button (a field's
 * attribute) keeps clear of its rounded end.
 */
export function BlockTab({
  selected,
  children,
}: Readonly<{ selected: boolean; children: ReactNode }>) {
  return (
    <div
      contentEditable={false}
      data-block-tab=""
      className={cx(
        'bg-input elevation-low pointer-events-auto absolute inset-e-3.5 bottom-[calc(100%+2px)] z-20 flex items-center gap-1 rounded-full border-2 p-0.5 select-none',
        '[&>:first-child:not([data-block-button])]:ms-1.5',
        selected ? 'border-primary' : 'border-current/30',
      )}
    >
      {children}
    </div>
  );
}

/** Spread on the button of a block's tab that Enter on the selected block presses. */
export const blockActionProps = { 'data-block-action': '' } as const;

/**
 * How far outside a picture or a video its frame is drawn, in pixels, and
 * how wide the frame's line is: for a consumer that places something on the
 * frame, such as the corner that resizes a picture.
 */
export const BLOCK_FRAME_OFFSET = 4;
export const BLOCK_FRAME_WIDTH = 2;

/** How far outside a block its frame is drawn, and its corners. */
type FrameShape = Readonly<{
  inline: number;
  block: number;
  /** A block with a shape of its own: its frame follows its corners. */
  boxed: boolean;
}>;

const FRAME_SHAPES = {
  // A logic block's border is inside its box.
  logic: { inline: 6, block: 6, boxed: true },
  boxed: {
    inline: BLOCK_FRAME_OFFSET,
    block: BLOCK_FRAME_OFFSET,
    boxed: true,
  },
  // A rule is a line: its frame takes in room to point at.
  rule: { inline: 4, block: 12, boxed: false },
  text: { inline: 4, block: 4, boxed: false },
} as const satisfies Record<string, FrameShape>;

/** The handle's size: 26 × 34 pixels, 40 pixels before the block. */
const HANDLE = { width: 26, height: 34, before: 40 } as const;

/** What a block's frame is drawn round: its file, or the whole block. */
const boxOf = (block: DrawnBlock): HTMLElement => {
  if (block.node.isAtom) {
    const box = block.dom.querySelector('[data-block-box]');
    if (box instanceof HTMLElement) return box;
  }
  const wrapper = block.dom.querySelector(':scope > [data-node-view-wrapper]');
  return wrapper instanceof HTMLElement ? wrapper : block.dom;
};

const shapeOf = (block: DrawnBlock, box: HTMLElement): FrameShape => {
  if (holdsBranches(block.node)) return FRAME_SHAPES.logic;
  if (box.hasAttribute('data-block-boxed')) return FRAME_SHAPES.boxed;
  if (block.node.type.name === 'horizontalRule') return FRAME_SHAPES.rule;
  return FRAME_SHAPES.text;
};

/** Where the first line of a block's text is, if it has text. */
const firstLineOf = (
  view: EditorView,
  block: DrawnBlock,
): Readonly<{ top: number; bottom: number }> | null => {
  if (block.node.isTextblock) return view.coordsAtPos(block.pos + 1);
  let found: number | null = null;
  block.node.descendants((node, offset) => {
    if (found !== null) return false;
    if (node.isTextblock) {
      found = block.pos + 1 + offset + 1;
      return false;
    }
    return !holdsBranches(node);
  });
  return found === null ? null : view.coordsAtPos(found);
};

type Placed = Readonly<{ left: number; top: number }>;

/** What the frames are placed from: the inside of the editor's border. */
const originOf = (container: HTMLElement): Placed => {
  const outer = container.getBoundingClientRect();
  return {
    left: outer.left + container.clientLeft,
    top: outer.top + container.clientTop,
  };
};

type DrawnFrame = Placed &
  Readonly<{ width: number; height: number; boxed: boolean }>;

type DrawnHandle = Placed & Readonly<{ position: number }>;

type Drawing = Readonly<{
  selected: DrawnFrame | null;
  handle: DrawnHandle | null;
}>;

const NOTHING: Drawing = { selected: null, handle: null };

const frameOf = (block: DrawnBlock, origin: Placed): DrawnFrame => {
  const box = boxOf(block);
  const shape = shapeOf(block, box);
  const drawn = box.getBoundingClientRect();
  return {
    left: drawn.left - origin.left - shape.inline,
    top: drawn.top - origin.top - shape.block,
    width: drawn.width + shape.inline * 2,
    height: drawn.height + shape.block * 2,
    boxed: shape.boxed,
  };
};

const handleOf = (
  view: EditorView,
  block: DrawnBlock,
  origin: Placed,
): DrawnHandle => {
  const box = boxOf(block);
  const shape = shapeOf(block, box);
  const drawn = box.getBoundingClientRect();
  // The start of the line, in the direction of the block's own text.
  const rightToLeft = getComputedStyle(block.dom).direction === 'rtl';
  const left = rightToLeft
    ? drawn.right + HANDLE.before - HANDLE.width
    : drawn.left - HANDLE.before;
  // Level with the top of a boxed block; centred on the first line of text.
  const line = shape.boxed ? null : firstLineOf(view, block);
  const middle =
    line === null
      ? shape.boxed
        ? drawn.top + HANDLE.height / 2
        : (drawn.top + drawn.bottom) / 2
      : (line.top + line.bottom) / 2;
  return {
    left: left - origin.left,
    top: middle - HANDLE.height / 2 - origin.top,
    position: block.pos,
  };
};

const sameFrame = (one: DrawnFrame | null, other: DrawnFrame | null) =>
  one === other ||
  (one !== null &&
    other !== null &&
    one.left === other.left &&
    one.top === other.top &&
    one.width === other.width &&
    one.height === other.height &&
    one.boxed === other.boxed);

const sameDrawing = (one: Drawing, other: Drawing) =>
  sameFrame(one.selected, other.selected) &&
  one.handle?.left === other.handle?.left &&
  one.handle?.top === other.handle?.top &&
  one.handle?.position === other.handle?.position;

const frameStyle = (frame: DrawnFrame): CSSProperties => ({
  left: frame.left,
  top: frame.top,
  width: frame.width,
  height: frame.height,
});

/**
 * A block as it was drawn when a drag began, placed from the editor's
 * corner: where a block being dragged can go is worked out from where every
 * block was then, not from the page as the drag changes it, so that what it
 * would do depends only on where the pointer is.
 */
type MeasuredBlock = Readonly<{
  pos: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** A logic block's branches, each a place blocks can go. */
  branches: readonly MeasuredBranch[];
}>;

type MeasuredBranch = Readonly<{
  top: number;
  bottom: number;
  /** The position at the end of the branch's blocks. */
  end: number;
  blocks: readonly MeasuredBlock[];
}>;

const measureBlocks = (
  view: EditorView,
  container: ProseMirrorNode,
  start: number,
  origin: Placed,
): MeasuredBlock[] =>
  drawnChildren(view, container, start).map((block) => {
    const box = block.dom.getBoundingClientRect();
    const branches: MeasuredBranch[] = [];
    if (holdsBranches(block.node)) {
      block.node.forEach((branch, offset) => {
        const branchPos = block.pos + 1 + offset;
        const branchDom = view.nodeDOM(branchPos);
        if (!(branchDom instanceof HTMLElement)) return;
        const shown = (
          branchDom.querySelector('[data-node-view-content]') ?? branchDom
        ).getBoundingClientRect();
        branches.push({
          top: shown.top - origin.top,
          bottom: shown.bottom - origin.top,
          end: branchPos + branch.nodeSize - 1,
          blocks: measureBlocks(view, branch, branchPos + 1, origin),
        });
      });
    }
    return {
      pos: block.pos,
      top: box.top - origin.top,
      bottom: box.bottom - origin.top,
      left: box.left - origin.left,
      right: box.right - origin.left,
      branches,
    };
  });

/**
 * Where the block at `dragged` goes if it is dropped at (`x`, `y`): before
 * the first block (other than itself) whose middle is below the point, or
 * at `end`. A point inside a logic block, level with one of its branches,
 * is a place in that branch; the gutter beside a logic block is not, so a
 * block dragged straight up or down by its handle goes past it whole.
 */
const dropTargetIn = (
  blocks: readonly MeasuredBlock[],
  end: number,
  dragged: number,
  x: number,
  y: number,
): number => {
  for (const block of blocks) {
    if (block.pos === dragged || block.branches.length === 0) continue;
    if (x < block.left || x > block.right) continue;
    if (y < block.top || y > block.bottom) continue;
    const branch = block.branches.find(
      (each) => y >= each.top && y <= each.bottom,
    );
    if (branch !== undefined) {
      return dropTargetIn(branch.blocks, branch.end, dragged, x, y);
    }
  }
  const before = blocks.find(
    (block) => block.pos !== dragged && y < (block.top + block.bottom) / 2,
  );
  return before?.pos ?? end;
};

/** How near the edge of what scrolls the editor a drag scrolls it. */
const AUTO_SCROLL_EDGE = 48;

/** What scrolls `element` into view: its nearest scrolling ancestor. */
const scrollerOf = (element: Element): Element => {
  for (
    let parent = element.parentElement;
    parent !== null;
    parent = parent.parentElement
  ) {
    const { overflowY } = getComputedStyle(parent);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
  }
  return element.ownerDocument.scrollingElement ?? element.ownerDocument.body;
};

/** A block being dragged by its handle, from the pointer going down on it. */
type HandleDrag = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly position: number;
  /** Set once the pointer has moved far enough for this to be a drag. */
  started: null | {
    readonly size: number;
    readonly blocks: readonly MeasuredBlock[];
    readonly preview: HTMLElement;
    /** Where the copy is placed from: the corner of what it is fixed to. */
    readonly previewOrigin: Placed;
    readonly grab: Placed;
    readonly scroller: Element;
    to: number | null;
    x: number;
    y: number;
    scrolling: number | undefined;
  };
};

/** How far the pointer moves on a handle before it drags the block. */
const DRAG_THRESHOLD = 5;

const FRAME_CLASSES =
  'pointer-events-none absolute z-10 border-2 data-boxed:rounded-[calc(var(--radius-sm)+4px)] not-data-boxed:rounded-sm';

/**
 * The frame and the drag handle of an editor's blocks, drawn over the
 * editor, which it must be placed in (as its last child, in an element that
 * is `relative`). The selected block has a frame in the primary colour
 * (while focus is in the editor), unless it is a paragraph or a heading;
 * the block under the pointer has none. The handle stands in the gutter at
 * the start of the block under the pointer, or of the selected one. They
 * appear and go at once. Clicking the handle selects its block.
 *
 * Dragging the handle, in any direction, picks the block up: a copy of the
 * block alone follows the pointer, and the document shows at once what
 * dropping it would do (`blockDragPlugin`), the blocks around making room
 * for it. Letting go moves it there, as one edit; Escape, or letting go where
 * it would not move, leaves it where it was. Near the top or bottom of what
 * scrolls the editor, the drag scrolls it. The keyboard's way is
 * Mod-Shift-ArrowUp and Mod-Shift-ArrowDown on the selected block, so the
 * handle is hidden from assistive technology and out of the Tab order.
 */
export function BlockFrameLayer({
  editor,
  store,
  active,
}: Readonly<{ editor: Editor; store: BlockFrameStore; active: boolean }>) {
  const layer = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<Drawing>(NOTHING);
  // Where the pointer last was over the editor, to find the block under it
  // again as the text changes under a still pointer.
  const pointer = useRef<Readonly<{ x: number; y: number }> | null>(null);
  const latestActive = useRef(active);

  const hoverAt = useCallback(
    (x: number, y: number, target: EventTarget | null) => {
      if (editor.isDestroyed) return;
      const { view } = editor;
      if (blockDragOf(view.state) !== null) return;
      const element = target instanceof Element ? target : null;
      // The handle belongs to the block it stands beside.
      if (element?.closest('[data-block-handle]')) return;
      const tab = element?.closest('[data-block-tab]') ?? null;
      if (tab !== null) {
        const selected = selectedBlockOf(view.state);
        const selectedDom =
          selected === null ? null : view.nodeDOM(selected.pos);
        const hovered = store.hovered();
        if (hovered?.contains(tab)) return;
        if (selectedDom instanceof HTMLElement && selectedDom.contains(tab)) {
          store.setHovered(selectedDom);
        }
        return;
      }
      const content = view.dom.parentElement;
      if (element === null || content === null || !content.contains(element)) {
        store.setHovered(null);
        return;
      }
      store.setHovered(blockAtPoint(view, x, y)?.dom ?? null);
    },
    [editor, store],
  );

  const draw = useCallback(() => {
    const own = layer.current;
    const container = own?.parentElement;
    if (own === null || container === null || container === undefined) return;
    if (editor.isDestroyed || !editor.isEditable) {
      setDrawing(NOTHING);
      return;
    }
    const { view } = editor;
    // A block being dragged shows where it would go, and nothing else.
    if (blockDragOf(view.state) !== null) {
      setDrawing(NOTHING);
      return;
    }
    const origin = originOf(container);
    const blocks = drawnBlocks(view);
    let hoveredDom = store.hovered();
    if (hoveredDom !== null && !hoveredDom.isConnected) {
      const at = pointer.current;
      store.setHovered(null);
      if (at !== null) {
        hoverAt(at.x, at.y, document.elementFromPoint(at.x, at.y));
      }
      hoveredDom = store.hovered();
    }
    const hovered =
      hoveredDom === null
        ? undefined
        : blocks.find((block) => block.dom === hoveredDom);
    const chosen = latestActive.current ? selectedBlockOf(view.state) : null;
    const selected =
      chosen === null
        ? undefined
        : blocks.find((block) => block.pos === chosen.pos);
    const handled = hovered ?? selected;
    const forHandle =
      handled === undefined || isEmptyBranchLine(view, handled)
        ? undefined
        : handled;
    const next: Drawing = {
      // A paragraph or a heading is text, which the caret and the
      // selection already mark: only a block of another kind has a frame.
      selected:
        selected === undefined || selected.node.isTextblock
          ? null
          : frameOf(selected, origin),
      handle:
        forHandle === undefined ? null : handleOf(view, forHandle, origin),
    };
    setDrawing((current) => (sameDrawing(current, next) ? current : next));
  }, [editor, hoverAt, store]);

  useLayoutEffect(() => {
    latestActive.current = active;
    // oxlint-disable-next-line react/set-state-in-effect -- the frames are placed from the drawn page, which is measured only once it is drawn
    draw();
  }, [active, draw]);

  useLayoutEffect(() => {
    const container = layer.current?.parentElement;
    if (container === null || container === undefined) return undefined;
    let frame: number | undefined;
    const later = () => {
      frame ??= requestAnimationFrame(() => {
        frame = undefined;
        draw();
      });
    };
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      hoverAt(event.clientX, event.clientY, event.target);
    };
    const onLeave = () => {
      pointer.current = null;
      store.setHovered(null);
    };
    // The text changed or the selection moved: the block under a still
    // pointer may be another, and every frame may have moved.
    const onTransaction = () => {
      const at = pointer.current;
      if (at !== null && !editor.view.composing) {
        hoverAt(at.x, at.y, document.elementFromPoint(at.x, at.y));
      }
      draw();
    };
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', onLeave);
    editor.on('transaction', onTransaction);
    const unsubscribe = store.subscribe(draw);
    window.addEventListener('scroll', later, { capture: true, passive: true });
    window.addEventListener('resize', later);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(later);
    if (!editor.isDestroyed) observer?.observe(editor.view.dom);
    observer?.observe(container);
    // A view that places what its frame goes round itself, such as a picture
    // drawn narrower than its block once it has loaded, moves it without the
    // text changing size: its frame follows.
    const moved =
      typeof MutationObserver === 'undefined'
        ? undefined
        : new MutationObserver(later);
    if (!editor.isDestroyed) {
      moved?.observe(editor.view.dom, {
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
      editor.off('transaction', onTransaction);
      unsubscribe();
      window.removeEventListener('scroll', later, { capture: true });
      window.removeEventListener('resize', later);
      observer?.disconnect();
      moved?.disconnect();
    };
  }, [draw, editor, hoverAt, store]);

  const { handle } = drawing;
  const selectHandled = () => {
    if (handle === null || editor.isDestroyed) return;
    const { view } = editor;
    view.dispatch(
      view.state.tr.setSelection(
        NodeSelection.create(view.state.doc, handle.position),
      ),
    );
    view.focus();
  };
  // The drag of the handle the pointer went down on, while it lasts, and
  // what ends it (without a drop).
  const handleDrag = useRef<HandleDrag | null>(null);
  const cancelDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelDrag.current?.(), []);

  // Picks the block up, once the pointer has moved far enough.
  const pickUp = (drag: HandleDrag): boolean => {
    const own = layer.current;
    const container = own?.parentElement;
    if (own === null || container === null || container === undefined) {
      return false;
    }
    if (editor.isDestroyed) return false;
    const { view } = editor;
    const node = view.state.doc.nodeAt(drag.position);
    const dom = view.nodeDOM(drag.position);
    if (node === null || !(dom instanceof HTMLElement)) return false;
    const origin = originOf(container);
    // Measured as it is drawn before the drag changes anything.
    const blocks = measureBlocks(view, view.state.doc, 0, origin);
    const box = boxOf({ pos: drag.position, node, dom });
    const drawn = box.getBoundingClientRect();
    // The block alone: none of what is drawn over it or around it.
    const preview = copyOfBlock(box);
    preview.setAttribute('data-block-drag-preview', '');
    preview.classList.add('bg-input', 'elevation-high', 'rounded-sm');
    // Fixed, so that the editor's own edges do not cut it off, and placed
    // from the pointer's coordinates, which are physical. Stated on the
    // element, over whatever placing the block's own classes give it.
    Object.assign(preview.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      margin: '0',
      zIndex: '30',
      pointerEvents: 'none',
      opacity: '0.9',
    });
    preview.style.width = `${drawn.width}px`;
    own.append(preview);
    // At 0, 0 of what it is fixed to: the window, unless something round
    // the editor is transformed.
    const placedAt = preview.getBoundingClientRect();
    drag.started = {
      size: node.nodeSize,
      blocks,
      preview,
      previewOrigin: { left: placedAt.left, top: placedAt.top },
      // Where on the block the pointer holds it, kept as it moves.
      grab: {
        left: Math.min(Math.max(drag.startX - drawn.left, 0), drawn.width),
        top: Math.min(Math.max(drag.startY - drawn.top, 0), drawn.height),
      },
      scroller: scrollerOf(container),
      to: null,
      x: drag.startX,
      y: drag.startY,
      scrolling: undefined,
    };
    store.setHovered(null);
    view.dispatch(
      view.state.tr.setSelection(
        NodeSelection.create(view.state.doc, drag.position),
      ),
    );
    showBlockDrag(view, { from: drag.position, to: null });
    view.focus();
    return true;
  };

  // The pointer is at (`x`, `y`): the copy follows it, and the document
  // shows what dropping the block there would do.
  const dragTo = (drag: HandleDrag, x: number, y: number) => {
    const { started } = drag;
    const container = layer.current?.parentElement;
    if (started === null || container === null || container === undefined) {
      return;
    }
    if (editor.isDestroyed) return;
    started.x = x;
    started.y = y;
    const origin = originOf(container);
    const { previewOrigin, grab } = started;
    started.preview.style.translate = `${x - previewOrigin.left - grab.left}px ${y - previewOrigin.top - grab.top}px`;
    const { view } = editor;
    const to = dropTargetIn(
      started.blocks,
      view.state.doc.content.size,
      drag.position,
      x - origin.left,
      y - origin.top,
    );
    const moves = to !== drag.position && to !== drag.position + started.size;
    const next = moves ? to : null;
    if (next === started.to) return;
    started.to = next;
    showBlockDrag(view, { from: drag.position, to: next });
  };

  // Near the top or bottom of what scrolls the editor, scrolls it, faster
  // the nearer, for as long as the pointer stays there.
  const scrollNear = (drag: HandleDrag) => {
    const { started } = drag;
    if (started === null || started.scrolling !== undefined) return;
    const step = () => {
      started.scrolling = undefined;
      if (handleDrag.current !== drag) return;
      const { scroller, y } = started;
      const page = scroller === scroller.ownerDocument.scrollingElement;
      const edges = page
        ? { top: 0, bottom: window.innerHeight }
        : scroller.getBoundingClientRect();
      const above = edges.top + AUTO_SCROLL_EDGE - y;
      const below = y - (edges.bottom - AUTO_SCROLL_EDGE);
      const by =
        above > 0
          ? -Math.min(above, AUTO_SCROLL_EDGE) / 3
          : below > 0
            ? Math.min(below, AUTO_SCROLL_EDGE) / 3
            : 0;
      if (by === 0) return;
      const before = scroller.scrollTop;
      scroller.scrollTop += by;
      if (scroller.scrollTop === before) return;
      dragTo(drag, started.x, started.y);
      started.scrolling = requestAnimationFrame(step);
    };
    started.scrolling = requestAnimationFrame(step);
  };

  // The drag is over: dropped (`drop`), or given up.
  const putDown = (drag: HandleDrag, drop: boolean) => {
    const { started } = drag;
    if (started === null) return;
    if (started.scrolling !== undefined) {
      cancelAnimationFrame(started.scrolling);
    }
    started.preview.remove();
    if (editor.isDestroyed) return;
    const { view } = editor;
    const moved =
      drop &&
      started.to !== null &&
      moveBlockTo(view, drag.position, started.to);
    if (!moved) showBlockDrag(view, null);
    view.focus();
  };

  const pressHandle = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || handle === null || editor.isDestroyed) return;
    // Keeps the focus in the text, and starts no selection of the page.
    event.preventDefault();
    cancelDrag.current?.();
    const drag: HandleDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      position: handle.position,
      started: null,
    };
    handleDrag.current = drag;
    const onMove = (moved: PointerEvent) => {
      if (moved.pointerId !== drag.pointerId) return;
      if (drag.started === null) {
        const distance = Math.hypot(
          moved.clientX - drag.startX,
          moved.clientY - drag.startY,
        );
        if (distance < DRAG_THRESHOLD) return;
        if (!pickUp(drag)) {
          finish(false);
          return;
        }
      }
      moved.preventDefault();
      dragTo(drag, moved.clientX, moved.clientY);
      scrollNear(drag);
    };
    const onUp = (released: PointerEvent) => {
      if (released.pointerId === drag.pointerId) finish(true);
    };
    const onCancel = () => finish(false);
    const onKey = (pressed: KeyboardEvent) => {
      if (pressed.key !== 'Escape' || drag.started === null) return;
      pressed.preventDefault();
      pressed.stopPropagation();
      finish(false);
    };
    const finish = (drop: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      if (handleDrag.current === drag) handleDrag.current = null;
      if (cancelDrag.current === cancel) cancelDrag.current = null;
      putDown(drag, drop);
    };
    const cancel = () => finish(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    cancelDrag.current = cancel;
  };

  return (
    <div
      ref={layer}
      aria-hidden
      data-block-frames=""
      // Placed from measured coordinates, which are physical.
      className="pointer-events-none absolute inset-0"
    >
      {drawing.selected !== null && (
        <div
          data-block-frame="selected"
          data-boxed={drawing.selected.boxed || undefined}
          className={cx(FRAME_CLASSES, 'border-primary')}
          style={frameStyle(drawing.selected)}
        />
      )}
      {handle !== null && (
        // The keyboard moves a block with Mod-Shift-ArrowUp and
        // Mod-Shift-ArrowDown, and selects one with Escape.
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          data-block-handle=""
          onClick={selectHandled}
          onPointerDown={pressHandle}
          className="pointer-events-auto absolute z-20 flex h-8.5 w-6.5 cursor-grab touch-none items-center justify-center rounded-xs bg-current/8 text-current/70 hover:bg-current/15 active:cursor-grabbing"
          style={{ left: handle.left, top: handle.top }}
        >
          <GripVertical aria-hidden className="pointer-events-none size-4.5" />
        </div>
      )}
    </div>
  );
}
