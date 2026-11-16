/**
 * Where the publications network may be drawn on its stage, given where the
 * text column lies over it.
 *
 * The column is at the start of the stage: on the left, or on the right in a
 * right-to-left language. Its side is read from where it was measured rather
 * than from the language, so the network keeps clear of the column wherever
 * the layout puts it.
 */

type Size = { width: number; height: number };
type Rect = Size & { x: number; y: number };

/** The stage's size, and the text column's edges measured from its left. */
export type StageView = Size & { columnLeft: number; columnRight: number };

// How far under the heading the whole network may reach before the first
// card, as a fraction of the column's width.
const INTRO_TUCK = 0.85;
// Room kept between the network and the column once the cards are being read.
const COLUMN_GAP = 56;
// Room kept between the network and the far edge of the stage.
const EDGE_GAP = 48;
const MIN_WIDTH = 160;

const columnIsOnTheRight = (view: StageView) =>
  (view.columnLeft + view.columnRight) / 2 > view.width / 2;

/**
 * Where the camera may frame things: beside the text column. Before the first
 * card (`tucked`) the whole network may reach in under the heading, where it
 * recedes, so it can use the width; after that it sits wholly beside the
 * column.
 */
export function safeArea(view: StageView, tucked: boolean): Rect {
  const tuck = (view.columnRight - view.columnLeft) * INTRO_TUCK;
  const y = 72;
  const height = view.height - 144;

  if (columnIsOnTheRight(view)) {
    const right = tucked
      ? view.columnRight - tuck
      : view.columnLeft - COLUMN_GAP;
    const width = Math.max(MIN_WIDTH, right - EDGE_GAP);
    return { x: right - width, y, width, height };
  }

  const x = tucked ? view.columnLeft + tuck : view.columnRight + COLUMN_GAP;
  return {
    x,
    y,
    width: Math.max(MIN_WIDTH, view.width - x - EDGE_GAP),
    height,
  };
}

/**
 * The mask that makes the network recede under the text column, so the cards
 * stay easy to read: faint from the stage's edge on the column's side to just
 * short of the column's inner edge, then full strength a little past it.
 */
export function columnMask(view: StageView): string {
  const onTheRight = columnIsOnTheRight(view);
  const inner = onTheRight ? view.width - view.columnLeft : view.columnRight;
  return `linear-gradient(to ${onTheRight ? 'left' : 'right'}, rgb(0 0 0 / 0.3) ${Math.max(0, inner - 24)}px, black ${inner + 72}px)`;
}
