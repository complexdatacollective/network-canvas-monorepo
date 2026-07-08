const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.25;
const EPSILON = 1e-6;

export const DEFAULT_ZOOM = 1;

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function zoomIn(zoom: number): number {
  return clampZoom(zoom * ZOOM_STEP);
}

export function zoomOut(zoom: number): number {
  return clampZoom(zoom / ZOOM_STEP);
}

export function canZoomIn(zoom: number): boolean {
  return zoom < MAX_ZOOM - EPSILON;
}

export function canZoomOut(zoom: number): boolean {
  return zoom > MIN_ZOOM + EPSILON;
}

// New scroll offset that keeps the viewport-centre point fixed when the content
// is scaled by `ratio` (= newZoom / oldZoom). Caller clamps to the valid range.
export function scaleAroundCenter(
  scroll: number,
  viewport: number,
  ratio: number,
): number {
  return (scroll + viewport / 2) * ratio - viewport / 2;
}

export function clampScroll(
  offset: number,
  scrollSize: number,
  viewport: number,
): number {
  return Math.min(Math.max(offset, 0), Math.max(0, scrollSize - viewport));
}

// Scroll offset that horizontally centres content wider than the viewport, or 0
// when it fits — matches the default centred layout used on reset.
export function centeredScrollLeft(
  scrollSize: number,
  viewport: number,
): number {
  return Math.max(0, (scrollSize - viewport) / 2);
}
