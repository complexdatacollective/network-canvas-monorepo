/**
 * jsdom performs no layout, so a label's box metrics are simulated from the
 * type size and line count in its class name: smaller type fits more characters
 * per line, and a taller clamp fits more lines. That is enough to exercise the
 * fit ladder end to end without a browser.
 */
const CHARACTERS_PER_LINE: Record<string, number> = {
  'text-lg': 9,
  'text-base': 11,
  'text-sm': 13,
  'text-xs': 15,
};

const LINE_HEIGHT = 20;

const readLabelShape = (element: HTMLElement) => {
  const size =
    Object.keys(CHARACTERS_PER_LINE).find((candidate) =>
      element.className.includes(candidate),
    ) ?? 'text-base';
  const lines = Number(/line-clamp-(\d+)/.exec(element.className)?.[1] ?? 1);
  const required = Math.ceil(
    (element.textContent?.length ?? 0) / CHARACTERS_PER_LINE[size]!,
  );
  return { lines, required };
};

export function installLabelMetrics() {
  Object.defineProperty(HTMLSpanElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return readLabelShape(this).lines * LINE_HEIGHT;
    },
  });
  Object.defineProperty(HTMLSpanElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return readLabelShape(this).required * LINE_HEIGHT;
    },
  });
}

export function uninstallLabelMetrics() {
  Reflect.deleteProperty(HTMLSpanElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLSpanElement.prototype, 'scrollHeight');
}
