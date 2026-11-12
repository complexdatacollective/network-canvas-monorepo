/**
 * Right-to-left checks over a rendered page, shared by the Storybook suites
 * (in the story's own document) and the Playwright suites (through
 * `page.evaluate`).
 *
 * Every function that reads the DOM is self-contained, with its helpers
 * declared inside it: Playwright sends a function to the page as source text,
 * so nothing it uses may come from this module's scope.
 *
 * `snapshotLayout` + `compareMirrored`: the layout mirrors. Each element's
 * distance from its parent's left edge in one direction equals its distance
 * from the right edge in the other, and an arrow that points along the line
 * points the other way.
 */

/** One element's box inside its parent's, in one writing direction. */
export type PlacedElement = Readonly<{
  /** Child indexes from the root: the same element in both renders. */
  key: string;
  /** Tag, id, first classes and a little text, for a failure message. */
  label: string;
  /** Distance from the parent box's left edge to this box's left edge. */
  left: number;
  /** Distance from this box's right edge to the parent box's right edge. */
  right: number;
  /**
   * For an icon that points along the line: -1 drawn pointing left, 1 drawn
   * pointing right, after every transform on it and its ancestors.
   */
  pointing?: -1 | 1;
}>;

export type LayoutSnapshot = Readonly<{
  direction: 'ltr' | 'rtl';
  elements: readonly PlacedElement[];
  /** The `dir` attribute of every element that has one, by key. */
  directions: Readonly<Record<string, string>>;
}>;

export type SnapshotOptions = Readonly<{
  /** Selector for the root; the document body when absent. */
  root?: string;
  /**
   * Elements whose place is not the reading direction's business, with
   * everything inside them: a brand mark, a canvas whose contents are placed
   * by coordinates.
   */
  exclude?: readonly string[];
}>;

/**
 * Records where every visible box sits inside its parent. Plain inline boxes
 * are left out: a run of text inside a line reorders with the text's own
 * direction, which is the bidi algorithm's job, not the layout's. So is an
 * atomic inline box (`inline-block`, `inline-flex`: a pill, a link styled as
 * a button) that shares its line with text, which the bidi algorithm places
 * among the words. One with no text beside it (a button on its own) sits at
 * the start of its line and is recorded like a block.
 */
export function snapshotLayout(options: SnapshotOptions = {}): LayoutSnapshot {
  const root = options.root
    ? document.querySelector(options.root)
    : document.body;
  if (!root) throw new Error(`snapshotLayout: no element for ${options.root}`);
  // `data-direction-exempt` marks a drawing whose place is no business of the
  // reading direction (a spinner's arcs, a brand mark).
  const excluded = ['[data-direction-exempt]', ...(options.exclude ?? [])].join(
    ', ',
  );

  // lucide-react names each icon in a class: `lucide-chevron-right`.
  const inlineArrow =
    /^lucide-(?:arrow|arrow-big|chevron|chevrons|move|circle-arrow|circle-chevron|square-arrow|square-chevron)-(left|right)(?:-(?:to|from)-line|-dash)?(?:-icon)?$/;

  // -1 when the transforms on an element and its ancestors turn it round
  // horizontally an odd number of times. Tailwind's `-scale-x-100` and
  // `rotate-180` set the `scale` and `rotate` properties, not `transform`.
  const horizontalTurn = (element: Element): -1 | 1 => {
    let sign = 1;
    for (
      let node: Element | null = element;
      node && node !== document.documentElement;
      node = node.parentElement
    ) {
      const style = getComputedStyle(node);
      const matrix = /^matrix(?:3d)?\(([^,]+)/.exec(style.transform);
      if (matrix && Number(matrix[1]) < 0) sign = -sign;
      if (style.scale !== 'none' && Number(style.scale.split(' ')[0]) < 0) {
        sign = -sign;
      }
      if (style.rotate !== 'none') {
        const angle = /(-?[\d.]+)(deg|turn|rad|grad)$/.exec(style.rotate);
        if (angle) {
          const value = Number(angle[1]);
          const degrees =
            angle[2] === 'turn'
              ? value * 360
              : angle[2] === 'rad'
                ? (value * 180) / Math.PI
                : angle[2] === 'grad'
                  ? value * 0.9
                  : value;
          if (Math.cos((degrees * Math.PI) / 180) < -0.5) sign = -sign;
        }
      }
    }
    return sign < 0 ? -1 : 1;
  };

  const describe = (element: Element): string => {
    const id = element.id ? `#${element.id}` : '';
    const classes = [...element.classList].slice(0, 3).join('.');
    const text = (element.textContent ?? '').trim().slice(0, 30);
    return `<${element.tagName.toLowerCase()}${id}${classes ? `.${classes}` : ''}>${text ? ` “${text}”` : ''}`;
  };

  // Whether text outside `except` runs through the line boxes of
  // `container`: its own text, or text in a plain inline or
  // `display: contents` child.
  const hasLooseText = (container: Node, except: Element): boolean =>
    [...container.childNodes].some((node) => {
      if (node === except) return false;
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent ?? '').trim() !== '';
      }
      if (!(node instanceof Element)) return false;
      const display = getComputedStyle(node).display;
      return (
        (display === 'inline' || display === 'contents') &&
        hasLooseText(node, except)
      );
    });

  const elements: PlacedElement[] = [];
  const directions: Record<string, string> = {};
  const visit = (element: Element, key: string) => {
    if (excluded && element.matches(excluded)) return;
    const dir = element.getAttribute('dir');
    if (dir !== null) directions[key] = dir;
    const style = getComputedStyle(element);
    if (style.display === 'none') return;
    // The box the element is laid out in: a `display: contents` ancestor
    // draws no box of its own (its rect is empty), so it is skipped.
    let parent = element.parentElement;
    while (parent && getComputedStyle(parent).display === 'contents') {
      parent = parent.parentElement;
    }
    const isSvg = element instanceof SVGElement;
    if (
      parent &&
      style.display !== 'contents' &&
      style.display !== 'inline' &&
      !(style.display.startsWith('inline') && hasLooseText(parent, element)) &&
      style.visibility !== 'hidden'
    ) {
      const box = element.getBoundingClientRect();
      const parentBox = parent.getBoundingClientRect();
      // Boxes nobody sees are not laid out for reading: screen-reader text
      // (`sr-only` is 1px and clipped), Base UI's hidden inputs and focus
      // guards.
      const clipped =
        style.clip === 'rect(0px, 0px, 0px, 0px)' ||
        style.clipPath.startsWith('inset(50%');
      if (box.width > 1 && box.height > 1 && !clipped) {
        const arrow = isSvg
          ? [...element.classList]
              .map((name) => inlineArrow.exec(name)?.[1])
              .find(Boolean)
          : undefined;
        elements.push({
          key,
          label: describe(element),
          left: box.left - parentBox.left,
          right: parentBox.right - box.right,
          ...(arrow
            ? {
                pointing: ((arrow === 'left' ? -1 : 1) *
                  horizontalTurn(element)) as -1 | 1,
              }
            : {}),
        });
      }
    }
    // An icon's own shapes are drawn in its coordinates, not laid out.
    if (isSvg) return;
    [...element.children].forEach((child, index) =>
      visit(child, `${key}/${index}`),
    );
  };
  [...root.children].forEach((child, index) => visit(child, `${index}`));

  return {
    direction: getComputedStyle(root).direction === 'rtl' ? 'rtl' : 'ltr',
    elements,
    directions,
  };
}

/**
 * Where two renders of the same content, one in each direction, fail to
 * mirror: an element whose distance from one edge of its parent is not its
 * distance from the other edge in the other render, and an arrow that points
 * the same way in both. An element in only one render is not compared.
 */
export function compareMirrored(
  first: LayoutSnapshot,
  second: LayoutSnapshot,
  // The same text can measure a pixel or so differently laid out in the
  // other direction (punctuation at the other end of a run); a fault in the
  // layout moves a box by a margin, several pixels.
  tolerance = 2,
): string[] {
  if (first.direction === second.direction) {
    return [`both renders are ${first.direction}`];
  }
  const others = new Map(second.elements.map((entry) => [entry.key, entry]));
  // An element whose `dir` is the same in both renders keeps its contents in
  // that direction on purpose (a code, a sample in another language): its
  // own box mirrors, what is inside it does not.
  const pinned = Object.entries(first.directions)
    .filter(([key, dir]) => second.directions[key] === dir)
    .map(([key]) => `${key}/`);
  const issues: string[] = [];
  for (const entry of first.elements) {
    if (pinned.some((prefix) => entry.key.startsWith(prefix))) continue;
    const other = others.get(entry.key);
    if (!other) continue;
    const startMoved = Math.abs(entry.left - other.right) > tolerance;
    const endMoved = Math.abs(entry.right - other.left) > tolerance;
    if (startMoved || endMoved) {
      issues.push(
        `${entry.label} is ${round(entry.left)}px from the left and ${round(entry.right)}px from the right in ${first.direction}, but ${round(other.right)}px from the right and ${round(other.left)}px from the left in ${second.direction}`,
      );
    }
    if (
      entry.pointing !== undefined &&
      other.pointing !== undefined &&
      entry.pointing === other.pointing
    ) {
      issues.push(
        `${entry.label} points ${entry.pointing < 0 ? 'left' : 'right'} in both directions`,
      );
    }
  }
  return issues;
}

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Whether two snapshots of the same render agree: the same elements in the
 * same places. Taking snapshots until two in a row agree is how a caller
 * knows the layout has stopped moving (a table filled in, a component
 * measured itself) before comparing it with another render.
 */
export function layoutsMatch(
  first: LayoutSnapshot,
  second: LayoutSnapshot,
  tolerance = 0.5,
): boolean {
  if (first.elements.length !== second.elements.length) return false;
  return first.elements.every((entry, index) => {
    const other = second.elements[index];
    return (
      other !== undefined &&
      other.key === entry.key &&
      Math.abs(other.left - entry.left) <= tolerance &&
      Math.abs(other.right - entry.right) <= tolerance &&
      other.pointing === entry.pointing
    );
  });
}
