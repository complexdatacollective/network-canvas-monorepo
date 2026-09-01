import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RectElement, TextElement } from '~/model/types';

import { elementBounds, textBounds, textFontPx } from '../documentGeometry';
import { setTextMeasurer, textCanvasFont } from '../textMeasure';

function text(over: Partial<TextElement> = {}): TextElement {
  return {
    id: 't',
    kind: 'text',
    x: 0.5,
    y: 0.5,
    lines: ['Hello'],
    fill: 'text',
    fontSize: 'medium',
    fontWeight: 400,
    opacity: 1,
    ...over,
  };
}

function rect(over: Partial<RectElement> = {}): RectElement {
  return {
    id: 'r',
    kind: 'rect',
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.4,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 3,
    zoneLabel: null,
    ...over,
  };
}

// 10px per character regardless of font: makes the expected maths trivial.
const tenPerChar = (line: string) => line.length * 10;

afterEach(() => {
  setTextMeasurer(null);
});

describe('textFontPx', () => {
  it('resolves the vmin term against the smaller stage dimension', () => {
    // medium = clamp(14px, 2.6vmin, 32px); 2.6% of 800 = 20.8, inside the clamp.
    expect(textFontPx(text(), { width: 1000, height: 800 })).toBeCloseTo(20.8);
  });

  it('clamps to minPx on a small stage', () => {
    // 2.6% of 100 = 2.6 → floor 14.
    expect(textFontPx(text(), { width: 200, height: 100 })).toBe(14);
  });

  it('clamps to maxPx on a large stage', () => {
    // 2.6% of 3000 = 78 → ceiling 32.
    expect(textFontPx(text(), { width: 4000, height: 3000 })).toBe(32);
  });
});

describe('textBounds (approximate fallback)', () => {
  it('centres the approximate box on (x, y) when no stage box is given', () => {
    const b = textBounds(text({ lines: ['Hello'] }));
    // 5 chars × 0.02 wide, 1 line × 0.04 tall.
    expect(b.minX).toBeCloseTo(0.45);
    expect(b.maxX).toBeCloseTo(0.55);
    expect(b.minY).toBeCloseTo(0.48);
    expect(b.maxY).toBeCloseTo(0.52);
  });

  it('falls back to the approximation when no measurer is available (jsdom)', () => {
    // No injected measurer, and jsdom has no canvas 2D context.
    const withStage = textBounds(text(), { width: 1000, height: 800 });
    expect(withStage).toEqual(textBounds(text()));
  });
});

describe('textBounds (measured)', () => {
  it('centres width = widest line and height = lines × 1.2 × px on (x, y)', () => {
    setTextMeasurer(tenPerChar);
    const el = text({ lines: ['Hello', 'Hi!'] });
    const stage = { width: 1000, height: 800 };
    // px = 20.8; widest = 'Hello' → 50px → 0.05 of the 1000px width;
    // height = 2 × 1.2 × 20.8 = 49.92px → 0.0624 of the 800px height.
    const b = textBounds(el, stage);
    expect(b.minX).toBeCloseTo(0.475);
    expect(b.maxX).toBeCloseTo(0.525);
    expect(b.minY).toBeCloseTo(0.5 - 0.0312);
    expect(b.maxY).toBeCloseTo(0.5 + 0.0312);
  });

  it('measures with the same font shorthand the serialized SVG declares', () => {
    const fonts: string[] = [];
    setTextMeasurer((line, font) => {
      fonts.push(font);
      return line.length;
    });
    const el = text({ fontWeight: 700 });
    const stage = { width: 1000, height: 800 };
    textBounds(el, stage);
    expect(fonts).toEqual([textCanvasFont(700, textFontPx(el, stage))]);
    expect(fonts[0]).toMatch(/^700 .*px system-ui, sans-serif$/);
  });

  it('keeps a non-degenerate width when every line measures zero', () => {
    setTextMeasurer(() => 0);
    const b = textBounds(text({ lines: [''] }), { width: 1000, height: 1000 });
    expect(b.maxX - b.minX).toBeGreaterThan(0);
  });

  it('memoizes measurements for repeated identical inputs', () => {
    const measurer = vi.fn(tenPerChar);
    setTextMeasurer(measurer);
    const el = text({ lines: ['Hello', 'Hi!'] });
    const stage = { width: 1000, height: 800 };
    const first = textBounds(el, stage);
    const second = textBounds(el, stage);
    expect(second).toEqual(first);
    // One call per line, not per bounds request.
    expect(measurer).toHaveBeenCalledTimes(2);
    // A different stage resolves a different px → cache miss → re-measure.
    textBounds(el, { width: 500, height: 500 });
    expect(measurer).toHaveBeenCalledTimes(4);
  });

  it('drops cached widths when the measurer is replaced', () => {
    setTextMeasurer(tenPerChar);
    const el = text();
    const stage = { width: 1000, height: 1000 };
    const narrow = textBounds(el, stage);
    setTextMeasurer((line) => line.length * 20);
    const wide = textBounds(el, stage);
    expect(wide.maxX - wide.minX).toBeCloseTo(2 * (narrow.maxX - narrow.minX));
  });
});

describe('elementBounds stage threading', () => {
  it('passes the stage box through to text bounds', () => {
    setTextMeasurer(tenPerChar);
    const el = text();
    const stage = { width: 1000, height: 800 };
    expect(elementBounds(el, stage)).toEqual(textBounds(el, stage));
    expect(elementBounds(el, stage)).not.toEqual(textBounds(el));
  });

  it('ignores the stage box for non-text elements', () => {
    const el = rect();
    expect(elementBounds(el, { width: 1000, height: 800 })).toEqual(
      elementBounds(el),
    );
  });
});
