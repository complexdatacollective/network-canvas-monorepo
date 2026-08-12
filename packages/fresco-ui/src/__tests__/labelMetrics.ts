/**
 * jsdom performs no layout, so a label's box metrics are simulated from its
 * class name: the type size sets how many characters fit a line, the clamp
 * sets how many lines fit the box, and the wrapping classes set where words
 * may break. Words never break by default — a word longer than the line
 * overflows horizontally, exactly as in a browser. `hyphens-auto` allows
 * breaks at the dictionary points below, and `wrap-anywhere` at any
 * character. That is enough to exercise the fit ladder end to end without a
 * browser.
 */
const CHARACTERS_PER_LINE: Record<string, number> = {
  'text-lg': 9,
  'text-base': 11,
  'text-sm': 13,
  'text-xs': 15,
};

const LINE_HEIGHT = 20;
const CHARACTER_WIDTH = 8;

/**
 * The simulated hyphenation dictionary. Real engines only break words their
 * language patterns can segment, so words absent here fall through to the
 * emergency rung the way an unsegmentable string does in a browser.
 */
const HYPHENATION_POINTS: Record<string, readonly string[]> = {
  konstantinopoulos: ['konstan', 'tino', 'poulos'],
};

type WrapMode = 'none' | 'hyphens' | 'anywhere';

const fragmentsOf = (word: string, mode: WrapMode): readonly string[] => {
  if (mode === 'anywhere') return [...word];
  if (mode === 'hyphens') {
    const known = HYPHENATION_POINTS[word.toLowerCase()];
    if (known) return known;
  }
  return [word];
};

const readLabelShape = (element: HTMLElement) => {
  const className = element.className;
  const size =
    Object.keys(CHARACTERS_PER_LINE).find((candidate) =>
      className.includes(candidate),
    ) ?? 'text-base';
  const perLine = CHARACTERS_PER_LINE[size]!;
  const clampLines = Number(/line-clamp-(\d+)/.exec(className)?.[1] ?? 1);
  const mode: WrapMode = className.includes('wrap-anywhere')
    ? 'anywhere'
    : className.includes('hyphens-auto')
      ? 'hyphens'
      : 'none';

  const words = (element.textContent ?? '').split(/\s+/).filter(Boolean);

  // Greedy wrap: fragments of one word join without spaces; a fragment that
  // cannot fit the remainder of a line starts the next one.
  let lines = 1;
  let column = 0;
  let widestFragment = 0;
  for (const word of words) {
    fragmentsOf(word, mode).forEach((fragment, index) => {
      widestFragment = Math.max(widestFragment, fragment.length);
      const width = fragment.length + (index === 0 && column > 0 ? 1 : 0);
      if (column > 0 && column + width > perLine) {
        lines += 1;
        column = fragment.length;
      } else {
        column += width;
      }
    });
  }

  return {
    clientWidth: perLine * CHARACTER_WIDTH,
    scrollWidth: Math.max(perLine, widestFragment) * CHARACTER_WIDTH,
    clientHeight: clampLines * LINE_HEIGHT,
    scrollHeight: lines * LINE_HEIGHT,
  };
};

const METRICS = [
  'clientWidth',
  'scrollWidth',
  'clientHeight',
  'scrollHeight',
] as const;

export function installLabelMetrics() {
  for (const metric of METRICS) {
    Object.defineProperty(HTMLSpanElement.prototype, metric, {
      configurable: true,
      get(this: HTMLElement) {
        return readLabelShape(this)[metric];
      },
    });
  }
}

export function uninstallLabelMetrics() {
  for (const metric of METRICS) {
    Reflect.deleteProperty(HTMLSpanElement.prototype, metric);
  }
}
