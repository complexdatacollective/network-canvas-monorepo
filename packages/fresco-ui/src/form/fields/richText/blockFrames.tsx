'use client';

import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { GripVertical } from 'lucide-react';
import {
  createContext,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { cx } from '../../../utils/cva';
import { holdsSections, selectedBlockOf } from './sectionBlocks';

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
 * branches show no block (its heading, a branch's label).
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
      inner =
        nearestTo(drawnChildren(view, branch, branchPos + 1), y)?.block ?? null;
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
 * attribute, the settings button). The first button in it is what Tab from
 * the selected block moves to, and what Enter on the selected block presses
 * (`data-block-action`). Drawn by the block's view while its frame shows,
 * inside the element the frame is drawn round.
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
        'bg-input elevation-low pointer-events-auto absolute inset-e-3.5 -top-9.5 z-20 flex items-center gap-1 rounded-full border-2 p-0.5 select-none',
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
 * Starts dragging the block at `position` from something outside the text
 * (its handle): the block becomes the selection, and the editor's own drop
 * moves it where it is dropped (or copies it, with the copy modifier).
 */
export const startBlockDrag = (
  view: EditorView,
  position: number,
  event: DragEvent,
  image: Element | null,
) => {
  const { dataTransfer } = event;
  if (dataTransfer === null) return;
  view.dispatch(
    view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)),
  );
  const { dom, text, slice } = view.serializeForClipboard(
    view.state.selection.content(),
  );
  dataTransfer.clearData();
  dataTransfer.setData('text/html', dom.innerHTML);
  dataTransfer.setData('text/plain', text);
  dataTransfer.effectAllowed = 'copyMove';
  if (image !== null) dataTransfer.setDragImage(image, 0, 0);
  view.dragging = { slice, move: true };
};

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

type DrawnFrame = Placed &
  Readonly<{ width: number; height: number; boxed: boolean }>;

type DrawnHandle = Placed & Readonly<{ position: number }>;

type Drawing = Readonly<{
  hovered: DrawnFrame | null;
  selected: DrawnFrame | null;
  handle: DrawnHandle | null;
}>;

const NOTHING: Drawing = { hovered: null, selected: null, handle: null };

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
  sameFrame(one.hovered, other.hovered) &&
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

const FRAME_CLASSES =
  'pointer-events-none absolute z-10 border-2 data-boxed:rounded-[calc(var(--radius-sm)+4px)] not-data-boxed:rounded-sm';

/**
 * The frames and the drag handle of an editor's blocks, drawn over the
 * editor, which it must be placed in (as its last child, in an element that
 * is `relative`). The frame of the block under the pointer is in the text's
 * colour, the frame of the selected block in the primary colour (while
 * focus is in the editor), and the handle stands in the gutter at the start
 * of the block under the pointer, or of the selected one. They appear and
 * go at once. Clicking the handle selects its block; dragging it moves the
 * block, as the editor moves anything dropped in it. The keyboard's way is
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
    // What the frames are placed from: the inside of the editor's border.
    const outer = container.getBoundingClientRect();
    const origin = {
      left: outer.left + container.clientLeft,
      top: outer.top + container.clientTop,
    };
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
    const forHandle = hovered ?? selected;
    const next: Drawing = {
      hovered:
        hovered === undefined || hovered === selected
          ? null
          : frameOf(hovered, origin),
      selected: selected === undefined ? null : frameOf(selected, origin),
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
  const dragHandled = (event: ReactDragEvent<HTMLDivElement>) => {
    if (handle === null || editor.isDestroyed) return;
    const { view } = editor;
    const block = drawnBlocks(view).find(
      (each) => each.pos === handle.position,
    );
    startBlockDrag(
      view,
      handle.position,
      event.nativeEvent,
      block === undefined ? null : boxOf(block),
    );
  };

  return (
    <div
      ref={layer}
      aria-hidden
      data-block-frames=""
      // Placed from measured coordinates, which are physical.
      className="pointer-events-none absolute inset-0"
    >
      {drawing.hovered !== null && (
        <div
          data-block-frame="hovered"
          data-boxed={drawing.hovered.boxed || undefined}
          className={cx(FRAME_CLASSES, 'border-current/30')}
          style={frameStyle(drawing.hovered)}
        />
      )}
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
          draggable
          onClick={selectHandled}
          onDragStart={dragHandled}
          onDragEnd={() => {
            if (editor.isDestroyed) return;
            const { view } = editor;
            const { dragging } = view;
            // As the editor's own drag does: a drop that it handled has
            // cleared it already.
            setTimeout(() => {
              if (view.dragging === dragging) view.dragging = null;
            }, 50);
          }}
          className="pointer-events-auto absolute z-20 flex h-8.5 w-6.5 cursor-grab items-center justify-center rounded-xs bg-current/8 text-current/70 hover:bg-current/15 active:cursor-grabbing"
          style={{ left: handle.left, top: handle.top }}
        >
          <GripVertical aria-hidden className="pointer-events-none size-4.5" />
        </div>
      )}
    </div>
  );
}
