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
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ASSET_BLOCK_DEFAULTS,
  ASSET_BLOCK_SIZES,
  type AssetBlockAttributes,
  type AssetBlockKind,
  type AssetBlockSize,
  isAssetBlockSize,
} from '@codaco/shared-consts';

import {
  ASSET_BLOCK_DRAGGED_HEIGHT,
  assetBlockMediaVariants,
  assetBlockSpacingVariants,
} from '../../../assetBlockLayout';
import { cx, cva } from '../../../utils/cva';
import { isRightToLeft } from '../../../utils/horizontalOverflow';
import {
  nameOfStep,
  nearestStep,
  RESIZE_STEPS,
  type ResizeStep,
  stepBeside,
  type StepWidth,
  widthDraggedTo,
  widthsOfSteps,
} from './assetBlockResize';
import {
  BLOCK_FRAME_OFFSET,
  BLOCK_FRAME_WIDTH,
  useBlockHovered,
} from './blockFrames';

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
  /**
   * The handle that resizes the file: shown while the block is selected,
   * focus is in the field (`active`) and the field can be changed, `null`
   * otherwise. A view that draws a picture
   * (an image or a video) puts it inside the element its frame is drawn round
   * (`blockBoxProps(true)`), on whose bottom corner at the end of the line it
   * sits; one that draws no picture (an audio player, a file it cannot show)
   * leaves it out.
   *
   * Dragged, the picture grows and shrinks with the pointer, and takes the
   * nearest size when it is let go; from the keyboard, the arrow keys move it
   * a size at a time. Either is one change, undone in one step.
   */
  resizeHandle: ReactNode;
  /**
   * While the handle is being dragged, the size that the picture would take
   * if it were let go now (`null`: as wide as the page), for the view to name
   * beside the handle; `undefined` otherwise. While it is dragged the view
   * draws the picture with `assetBlockMediaVariants({ dragged: true })` in
   * place of its size, which holds it to the height that the pointer has
   * dragged it to.
   */
  resizing: Readonly<{ size: AssetBlockSize | null }> | undefined;
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
  base: 'relative rounded-sm select-none',
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

// How large the resize handle is to take hold of, round the 16 pixels of it
// that are drawn.
const HANDLE_SIZE = 24;

// Where the handle's middle goes, out from the picture: on the middle of the
// line of the frame drawn round a selected block (whose outer edge is
// `BLOCK_FRAME_OFFSET` out), less half the handle.
const HANDLE_OFFSET = -(
  BLOCK_FRAME_OFFSET -
  BLOCK_FRAME_WIDTH / 2 +
  HANDLE_SIZE / 2
);

// How far the pointer moves before the picture follows it, so that a press
// that does not move changes nothing.
const DRAG_THRESHOLD = 5;

// The narrowest that a picture is drawn while it is dragged.
const MIN_DRAGGED_WIDTH = 24;

/** A drag of the handle, from where the pointer took hold. */
type Held = {
  x: number;
  y: number;
  /** The picture as it was drawn when the pointer took hold. */
  start: Readonly<{ width: number; height: number }>;
  /** How wide the page is: the widest that the picture can be drawn. */
  full: number;
  /** How wide the picture is drawn at each size. */
  steps: readonly StepWidth[];
  /** Whether the end of a line is on the left. */
  rightToLeft: boolean;
  /** The element the dragged height is given on (`ASSET_BLOCK_DRAGGED_HEIGHT`). */
  wrapper: HTMLElement;
  /** Whether the pointer has moved far enough for the picture to follow it. */
  moving: boolean;
  /** The size the picture would take if it were let go now. */
  nearest: ResizeStep;
};

/**
 * The handle on the bottom corner of a selected picture, at the end of the
 * line, that resizes it. Dragged, the picture grows and shrinks with the
 * pointer, and when it is let go it takes the nearest of the sizes it can be
 * given (`RESIZE_STEPS`). A slider to a screen reader: the arrow keys, Home
 * and End move it from one size to another, and Escape returns to the text.
 *
 * A picture is centred on its line, so the handle at its end corner keeps
 * under the pointer as the picture grows towards both edges.
 *
 * The block's node view gives it to the block's view (`resizeHandle`); it is
 * exported for a view drawn outside an editor, such as in a story. It must
 * stand inside the element the view's frame is drawn round
 * (`blockBoxProps(true)`), within an element marked `data-asset-block`, which
 * the dragged height is given on.
 */
export function AssetBlockResizeHandle({
  size,
  onPreview,
  onResize,
  onLeave,
}: Readonly<{
  size: ResizeStep;
  /** Says what a drag would do, or (given `undefined`) that it has ended. */
  onPreview: (resizing: Readonly<{ size: ResizeStep }> | undefined) => void;
  onResize: (size: ResizeStep) => void;
  onLeave: () => void;
}>) {
  const probeRef = useRef<HTMLSpanElement>(null);
  const held = useRef<Held | null>(null);
  // A handle taken away while it is dragged (the block stops being
  // selected) leaves the picture at its size.
  useEffect(
    () => () => {
      held.current?.wrapper.style.removeProperty(ASSET_BLOCK_DRAGGED_HEIGHT);
    },
    [],
  );

  // What each band holds a picture's height to, read from the classes that
  // hold it, since they are given in units of the page (`rem`, `vh`).
  const bandHeights = (): Record<AssetBlockSize, number> => {
    const heights: Record<AssetBlockSize, number> = {
      small: 0,
      medium: 0,
      large: 0,
    };
    const probe = probeRef.current;
    if (probe === null) return heights;
    for (const band of ASSET_BLOCK_SIZES) {
      probe.className = cx(
        'invisible absolute size-0',
        assetBlockMediaVariants({ size: band }),
      );
      const limit = Number.parseFloat(getComputedStyle(probe).maxHeight);
      heights[band] = Number.isFinite(limit) ? limit : 0;
    }
    return heights;
  };

  const release = () => {
    const drag = held.current;
    held.current = null;
    drag?.wrapper.style.removeProperty(ASSET_BLOCK_DRAGGED_HEIGHT);
    onPreview(undefined);
  };

  // Each step, the drawn picture follows the pointer. Its height is set on
  // the element round the block rather than drawn again, since it changes
  // with every move of the pointer.
  const follow = (drag: Held, clientX: number, clientY: number) => {
    const across = (clientX - drag.x) * (drag.rightToLeft ? -1 : 1);
    const down = clientY - drag.y;
    if (
      !drag.moving &&
      Math.max(Math.abs(across), Math.abs(down)) < DRAG_THRESHOLD
    ) {
      return;
    }
    const width = widthDraggedTo(
      drag.start,
      { across, down },
      { min: MIN_DRAGGED_WIDTH, max: drag.full },
    );
    const height = width / (drag.start.width / drag.start.height);
    drag.wrapper.style.setProperty(ASSET_BLOCK_DRAGGED_HEIGHT, `${height}px`);
    const nearest = nearestStep(width, drag.steps, size);
    if (!drag.moving || nearest !== drag.nearest) {
      drag.moving = true;
      drag.nearest = nearest;
      onPreview({ size: nearest });
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onLeave();
      return;
    }
    // The key that points towards the end of the line makes it larger.
    const towardsEnd = isRightToLeft(event.currentTarget) ? -1 : 1;
    const next: ResizeStep | undefined =
      event.key === 'ArrowUp'
        ? stepBeside(size, 1)
        : event.key === 'ArrowDown'
          ? stepBeside(size, -1)
          : event.key === 'ArrowRight'
            ? stepBeside(size, towardsEnd === 1 ? 1 : -1)
            : event.key === 'ArrowLeft'
              ? stepBeside(size, towardsEnd === 1 ? -1 : 1)
              : event.key === 'Home'
                ? RESIZE_STEPS[0]
                : event.key === 'End'
                  ? RESIZE_STEPS.at(-1)
                  : undefined;
    if (next === undefined) return;
    event.preventDefault();
    if (next !== size) onResize(next);
  };

  return (
    <div
      {...assetBlockControlsProps}
      role="slider"
      tabIndex={0}
      // Read only by a screen reader, so plain English.
      lang="en"
      aria-label="Display size"
      aria-valuemin={0}
      aria-valuemax={RESIZE_STEPS.length - 1}
      aria-valuenow={RESIZE_STEPS.indexOf(size)}
      aria-valuetext={nameOfStep(size)}
      data-asset-block-resize=""
      className={cx(
        'focusable pointer-events-auto absolute touch-none rounded-full',
        'cursor-nwse-resize rtl:cursor-nesw-resize',
        // Drawn as the block's tab is: the input colour, edged in the
        // colour of a selected block.
        'before:bg-input before:border-primary before:absolute before:inset-1 before:rounded-full before:border-2',
      )}
      style={{
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        bottom: HANDLE_OFFSET,
        insetInlineEnd: HANDLE_OFFSET,
      }}
      // A press here is not one on the block, which would select it again,
      // nor the start of moving it or of selecting text.
      onMouseDown={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        const box = handle.closest('[data-block-boxed]');
        const wrapper = handle.closest<HTMLElement>('[data-asset-block]');
        if (box === null || wrapper === null) return;
        const drawn = box.getBoundingClientRect();
        if (drawn.width === 0 || drawn.height === 0) return;
        const full = wrapper.getBoundingClientRect().width;
        handle.setPointerCapture(event.pointerId);
        held.current = {
          x: event.clientX,
          y: event.clientY,
          start: { width: drawn.width, height: drawn.height },
          full,
          steps: widthsOfSteps({
            full,
            ratio: drawn.width / drawn.height,
            heights: bandHeights(),
          }),
          rightToLeft: isRightToLeft(handle),
          wrapper,
          moving: false,
          nearest: size,
        };
      }}
      onPointerMove={(event) => {
        const drag = held.current;
        if (drag !== null) follow(drag, event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        const drag = held.current;
        if (drag === null) return;
        follow(drag, event.clientX, event.clientY);
        const { moving, nearest } = drag;
        release();
        if (moving && nearest !== size) onResize(nearest);
      }}
      onLostPointerCapture={() => {
        if (held.current !== null) release();
      }}
      onKeyDown={onKeyDown}
    >
      <span ref={probeRef} aria-hidden className="invisible absolute size-0" />
    </div>
  );
}

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
  // What a drag of the resize handle would do, while it is dragged.
  const [resizing, setResizing] = useState<
    Readonly<{ size: ResizeStep }> | undefined
  >(undefined);
  // Shown with the block's frame: while the block is selected and focus is in
  // the field. A selection the field has lost is not drawn. A handle being
  // dragged stays until it is let go, since the settings that had focus are
  // hidden while it is.
  const resizable = selected && editable && (active || resizing !== undefined);
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
        // Not a press in its tab, whose buttons select it themselves, nor
        // on its resize handle, which needs it selected already.
        if (
          event.target instanceof Element &&
          event.target.closest(`[${FILE_ATTRIBUTE}]`) !== null &&
          event.target.closest('[data-block-tab]') === null &&
          event.target.closest('[data-asset-block-resize]') === null
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
          resizeHandle={
            resizable ? (
              <AssetBlockResizeHandle
                size={attributes.size}
                onPreview={setResizing}
                // One change to the text, so one step to undo.
                onResize={(size) => updateAttributes({ size })}
                onLeave={select}
              />
            ) : null
          }
          resizing={resizable ? resizing : undefined}
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
 * or with Enter on the selected block (see `DocumentBlocks`). While it is
 * selected, a picture is resized with the handle on its corner
 * (`AssetBlockResizeHandle`), which Tab reaches after the settings button.
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
      // Spaced as the interview spaces a block, on the element that stands
      // among the document's other blocks (as a field block's is).
      className: assetBlockSpacingVariants(),
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
