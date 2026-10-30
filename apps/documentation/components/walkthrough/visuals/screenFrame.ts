// The illustrated browser window stills and captures sit in, drawn at the
// width of the /updates windows so its chrome matches theirs.
const FRAME_WIDTH = 720;
const MARGIN = 12;

export function screenFrame(width: number, height: number) {
  const frame = {
    x: MARGIN,
    y: MARGIN,
    width: FRAME_WIDTH,
    height: 56 + (FRAME_WIDTH - 6) * (height / width),
  };
  const viewWidth = FRAME_WIDTH + MARGIN * 2;
  const viewHeight = frame.height + MARGIN * 2 + 24;
  return {
    frame,
    viewWidth,
    viewHeight,
    // Fits the drawing to both dimensions of a size-contained stage.
    fit: { width: `min(100cqw, calc(100cqh * ${viewWidth / viewHeight}))` },
  };
}
