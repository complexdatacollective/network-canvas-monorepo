// Offscreen-canvas text measurement shared by the measured text bounds
// (documentGeometry) and the inline editor's content sizing. jsdom has no 2D
// context, so tests inject a fake with setTextMeasurer; when no measurer is
// available at all, callers fall back to approximate bounds. Widths are
// memoized per (font, lines) so pointer-move hit tests do not re-measure on
// every event.

type TextMeasurer = (line: string, font: string) => number;

const MAX_CACHED_MEASUREMENTS = 256;

let override: TextMeasurer | null = null;
let canvasMeasurer: TextMeasurer | null | undefined;
const widthCache = new Map<string, number>();

function createCanvasMeasurer(): TextMeasurer | null {
  if (typeof document === 'undefined') return null;
  try {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return null;
    return (line, font) => {
      context.font = font;
      return context.measureText(line).width;
    };
  } catch {
    return null;
  }
}

function activeMeasurer(): TextMeasurer | null {
  if (override) return override;
  if (canvasMeasurer === undefined) canvasMeasurer = createCanvasMeasurer();
  return canvasMeasurer;
}

// The canvas font shorthand matching the serialized SVG's font declaration, so
// measured widths agree with what the preview <img> paints.
export function textCanvasFont(weight: number, px: number): string {
  return `${weight} ${px}px system-ui, sans-serif`;
}

// Widest rendered line in px, or null when no measurer exists (jsdom without
// an injected fake) — callers fall back to approximate bounds.
export function measureWidestLinePx(
  lines: string[],
  font: string,
): number | null {
  const measure = activeMeasurer();
  if (!measure) return null;
  // JSON keeps the key injective across line boundaries — a line may itself
  // contain '\n', so a plain join would collide ['a','b'] with ['a\nb'].
  const key = `${font}\u0000${JSON.stringify(lines)}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;
  const widest = lines.reduce(
    (max, line) => Math.max(max, measure(line, font)),
    0,
  );
  if (widthCache.size >= MAX_CACHED_MEASUREMENTS) widthCache.clear();
  widthCache.set(key, widest);
  return widest;
}

// Test seam: replaces the canvas measurer (null restores it) and drops cached
// widths so the new measurer takes effect immediately.
export function setTextMeasurer(measurer: TextMeasurer | null): void {
  override = measurer;
  widthCache.clear();
}
