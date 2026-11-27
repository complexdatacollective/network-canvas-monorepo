import { type RefObject, useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { assetBlockMediaVariants } from '@codaco/fresco-ui/assetBlockLayout';
import {
  BLOCK_FRAME_OFFSET,
  BLOCK_FRAME_WIDTH,
  assetBlockControlsProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { useInterfaceLanguage } from '@codaco/fresco-ui/interfaceLanguage';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { ASSET_BLOCK_SIZES } from '@codaco/shared-consts';

import { SIZE_LABELS, type SizeChoice } from './assetBlockMessages.ts';
import type { DrawnFile } from './drawnFile.ts';

/**
 * The size nearest to a height the researcher has dragged a picture to.
 * `heights` are what each size would draw the picture at, smallest size
 * first; where two draw it the same, the larger is the one meant, since it
 * is the one that goes on fitting if the picture is replaced by a larger.
 */
export const sizeNearest = (
  wanted: number,
  heights: readonly (readonly [SizeChoice, number])[],
): SizeChoice => {
  let nearest: SizeChoice = 'full';
  let distance = Number.POSITIVE_INFINITY;
  for (const [choice, height] of heights) {
    const away = Math.abs(height - wanted);
    if (away <= distance) {
      nearest = choice;
      distance = away;
    }
  }
  return nearest;
};

/**
 * How tall a picture is wanted, once its corner has been dragged by `across`
 * and `down` from where it was `tall`. A picture keeps its shape, so a move
 * either way says the same thing: the one that says the most is taken, which
 * lets the corner be pulled along either side of the picture as well as from
 * corner to corner.
 */
export const heightDraggedTo = (
  tall: number,
  moved: Readonly<{ across: number; down: number }>,
  ratio: number,
): number => {
  const fromWidth = moved.across / ratio;
  return (
    tall + (Math.abs(fromWidth) > Math.abs(moved.down) ? fromWidth : moved.down)
  );
};

/**
 * The corner of a block's box, dragged to change the size its picture is
 * drawn at. The size goes from one of the sizes on offer to the next as the
 * pointer moves, and is the block's once the corner is let go.
 *
 * At a bottom corner of the box, where it is whatever size the picture has
 * within it, and on the side the picture grows towards: a picture held against
 * the right of its box grows to the left.
 *
 * For a pointer only, and hidden from a screen reader: the same sizes are
 * offered, to the keyboard too, among the block's settings.
 */
// How large the corner is to take hold of, around the 16px of it that is
// drawn.
const CORNER_SIZE = 24;

// Where the corner's middle goes, out from the box: on the middle of the line
// of the frame the editor draws round a selected block (whose outer edge is
// `BLOCK_FRAME_OFFSET` out), less half the corner.
const CORNER_OFFSET = -(
  BLOCK_FRAME_OFFSET -
  BLOCK_FRAME_WIDTH / 2 +
  CORNER_SIZE / 2
);

export function ResizeCorner({
  boxRef,
  cornerRef,
  drawn,
  size,
  onDrag,
  onDrop,
}: {
  boxRef: RefObject<HTMLDivElement | null>;
  /** The corner as it is drawn, for what must leave it uncovered. */
  cornerRef?: RefObject<HTMLDivElement | null>;
  drawn: DrawnFile & { ratio: number };
  size: SizeChoice;
  onDrag: (size: SizeChoice | undefined) => void;
  onDrop: (size: SizeChoice) => void;
}) {
  const intl = useAppIntl();
  // The size's name is the interface's words, over text in the language
  // being written.
  const interfaceLanguage = useInterfaceLanguage();
  const probeRef = useRef<HTMLSpanElement>(null);
  // Where the pointer took hold, and how tall the picture was then.
  const [held, setHeld] = useState<
    Readonly<{ x: number; y: number; tall: number }> | undefined
  >(undefined);
  const onLeft = drawn.across === 1;

  const sizeAt = (clientX: number, clientY: number): SizeChoice => {
    const box = boxRef.current;
    const probe = probeRef.current;
    if (box === null || probe === null || held === undefined) return size;
    const full = box.getBoundingClientRect().width / drawn.ratio;
    // What each size holds a picture to, read from the classes that hold it.
    const heights = ASSET_BLOCK_SIZES.map((choice): [SizeChoice, number] => {
      probe.className = cx(
        'invisible absolute size-0',
        assetBlockMediaVariants({ size: choice }),
      );
      const limit = Number.parseFloat(getComputedStyle(probe).maxHeight);
      return [choice, Number.isFinite(limit) ? Math.min(limit, full) : full];
    });
    const wanted = heightDraggedTo(
      held.tall,
      {
        // Away from the side the picture is held against is larger.
        across: (clientX - held.x) * (onLeft ? -1 : 1),
        down: clientY - held.y,
      },
      drawn.ratio,
    );
    return sizeNearest(wanted, [...heights, ['full', full]]);
  };

  return (
    <>
      <span ref={probeRef} aria-hidden />
      <div
        ref={cornerRef}
        {...assetBlockControlsProps}
        aria-hidden
        data-asset-block-resize=""
        className={cx(
          'pointer-events-auto absolute touch-none',
          'before:bg-primary before:border-surface-1 before:absolute before:inset-1 before:rounded-full before:border-2',
          onLeft ? 'cursor-nesw-resize' : 'cursor-nwse-resize',
        )}
        // Where the picture is drawn is measured from the left of its box,
        // whichever way the text runs, so the corner is placed from the left
        // or the right too: a side named for where a line starts would be the
        // other one in right-to-left text.
        style={{
          width: CORNER_SIZE,
          height: CORNER_SIZE,
          bottom: CORNER_OFFSET,
          ...(onLeft ? { left: CORNER_OFFSET } : { right: CORNER_OFFSET }),
        }}
        // A press here is not one on the block, which would start moving it.
        onMouseDown={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setHeld({ x: event.clientX, y: event.clientY, tall: drawn.height });
          onDrag(size);
        }}
        onPointerMove={(event) => {
          if (held !== undefined) onDrag(sizeAt(event.clientX, event.clientY));
        }}
        onPointerUp={(event) => {
          if (held === undefined) return;
          setHeld(undefined);
          onDrop(sizeAt(event.clientX, event.clientY));
        }}
        onLostPointerCapture={() => {
          if (held === undefined) return;
          setHeld(undefined);
          onDrag(undefined);
        }}
      />
      {held !== undefined && (
        <span
          {...interfaceLanguage}
          className="bg-primary text-primary-contrast elevation-low absolute bottom-3 rounded-sm px-2 py-0.5 text-xs font-bold whitespace-nowrap"
          // Inside the box, by the corner, where it covers the picture or
          // the empty side of its box and never the text after it. On the
          // corner's side, by the same measure.
          style={onLeft ? { left: 12 } : { right: 12 }}
        >
          {intl.formatMessage(SIZE_LABELS[size])}
        </span>
      )}
    </>
  );
}
