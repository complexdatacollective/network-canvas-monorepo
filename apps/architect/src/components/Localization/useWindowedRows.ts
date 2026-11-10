import {
  type RefObject,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * One row of a windowed table: a group's heading or one of its texts. The key
 * names it for the whole life of the table, so a height measured for it
 * survives the rows around it being filtered away and back.
 */
export type WindowedItem = Readonly<{ key: string; heading: boolean }>;

/**
 * How many rows, counting each group's heading, a table holds before only the
 * ones near the screen are drawn. A table this size opens in about a fifth of
 * a second, so below it every row is drawn: nothing is gained by leaving any
 * out, and the browser's own find still reaches all of them.
 */
const WINDOWED_FROM_ROWS = 150;

/**
 * How tall a row not yet drawn is taken to be. Fixed, not learned from the
 * rows drawn so far: every row above the screen that has not been drawn
 * counts at this height, so an estimate that moved would move all of them, and
 * the screen with them.
 */
const ROW_ESTIMATE = 96;
const HEADING_ESTIMATE = 40;

/** The attribute that ties a drawn row to its item, and its measured height. */
const WINDOW_KEY_ATTRIBUTE = 'data-window-key';

/** What a drawn row carries for the observer that measures it. */
export const windowItemProps = (key: string) => ({
  [WINDOW_KEY_ATTRIBUTE]: key,
});

/** The key of the item the element is in, if it is in one. */
export const readWindowKey = (element: EventTarget | null) =>
  element instanceof Element
    ? element
        .closest(`[${WINDOW_KEY_ATTRIBUTE}]`)
        ?.getAttribute(WINDOW_KEY_ATTRIBUTE)
    : undefined;

/** Whether the item `key` is drawn in `table` just now. */
export const isItemDrawn = (table: HTMLElement | null, key: string) =>
  Array.from(table?.querySelectorAll(`[${WINDOW_KEY_ATTRIBUTE}]`) ?? []).some(
    (element) => element.getAttribute(WINDOW_KEY_ATTRIBUTE) === key,
  );

/** The key of a group's heading item, from the group's own key. */
export const headingItemKey = (groupKey: string) => `group:${groupKey}`;

/** The key of a text's item, from the text's own key. */
export const rowItemKey = (rowKey: string) => `row:${rowKey}`;

/** The height each item was last drawn at, by its key. */
type Measured = ReadonlyMap<string, number>;

const NOTHING_MEASURED: Measured = new Map();

/** `measured` with `changes` in it, or `measured` itself where nothing moved. */
const withMeasurements = (
  measured: Measured,
  changes: ReadonlyMap<string, number>,
): Measured => {
  let next: Map<string, number> | undefined;
  for (const [key, height] of changes) {
    const before = measured.get(key);
    if (before !== undefined && Math.abs(before - height) < 0.5) continue;
    next ??= new Map(measured);
    next.set(key, height);
  }
  return next ?? measured;
};

type Layout = Readonly<{
  /** Where each item starts, and, last, where the last one ends. */
  offsets: Float64Array;
  indexOf: ReadonlyMap<string, number>;
}>;

/**
 * Where every item sits if each is as tall as it was last drawn, and, where it
 * has not been drawn, as tall as it is estimated to be.
 */
export const layOut = (
  items: readonly WindowedItem[],
  measured: Measured,
): Layout => {
  const offsets = new Float64Array(items.length + 1);
  const indexOf = new Map<string, number>();
  items.forEach((item, index) => {
    const height =
      measured.get(item.key) ??
      (item.heading ? HEADING_ESTIMATE : ROW_ESTIMATE);
    offsets[index + 1] = (offsets[index] ?? 0) + height;
    indexOf.set(item.key, index);
  });
  return { offsets, indexOf };
};

/**
 * The items a stretch of the table's height `from` to `to` touches: the first
 * one, and the one after the last.
 */
export const itemsBetween = (
  offsets: Float64Array,
  from: number,
  to: number,
): readonly [first: number, end: number] => {
  const count = offsets.length - 1;
  // The first item that ends below `from`.
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((offsets[middle + 1] ?? 0) > from) high = middle;
    else low = middle + 1;
  }
  const first = low;
  // The first item that starts at or below `to`.
  low = first;
  high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((offsets[middle] ?? 0) >= to) high = middle;
    else low = middle + 1;
  }
  return [first, low];
};

type Scrolled = Readonly<{
  /** How far the scroller is scrolled, from the top of the first item. */
  top: number;
  /** How much of the table the scroller shows at once. */
  viewport: number;
}>;

/** No less than this much of the table is drawn beyond each edge of the screen. */
const MIN_OVERSCAN = 400;

const overscanFor = (viewport: number) => Math.max(viewport, MIN_OVERSCAN);

/**
 * Measures the rows it is given to observe. A row above the screen that turns
 * out taller or shorter than it was taken to be moves what is on the screen,
 * so the scroller moves by the difference.
 */
const observeHeights = (
  table: () => HTMLTableElement | null,
  layout: () => Layout,
  report: (changes: ReadonlyMap<string, number>) => void,
) =>
  new ResizeObserver((entries) => {
    const changes = new Map<string, number>();
    for (const { target } of entries) {
      const key = target.getAttribute(WINDOW_KEY_ATTRIBUTE);
      const { height } = target.getBoundingClientRect();
      if (key === null || height === 0) continue;
      changes.set(key, height);
    }
    if (changes.size === 0) return;

    const current = layout();
    const scroller = table()?.parentElement;
    if (scroller) {
      const bodyTop = table()?.tHead?.offsetHeight ?? 0;
      let shift = 0;
      for (const [key, height] of changes) {
        const index = current.indexOf.get(key);
        if (index === undefined) continue;
        const start = current.offsets[index] ?? 0;
        const was = (current.offsets[index + 1] ?? 0) - start;
        if (bodyTop + start + was <= scroller.scrollTop) shift += height - was;
      }
      if (Math.abs(shift) >= 0.5) scroller.scrollTop += shift;
    }
    report(changes);
  });

/**
 * Draws only the items of a table near the screen. The rest stand in as a
 * blank row as tall as they are expected to be, so the table scrolls as if it
 * held them all.
 *
 * An item's height is measured when it is drawn, and kept; before that it is
 * estimated. When a height is learned for an item above the screen, the
 * scroller moves by the difference, so what is being read stays where it is.
 *
 * Nothing is left out while the table holds no more than `WINDOWED_FROM_ROWS`
 * rows. `pinned` items are drawn wherever they are: the one holding focus
 * and its neighbours, which would otherwise lose focus when scrolled away.
 */
export const useWindowedRows = ({
  tableRef,
  items,
  pinned,
}: {
  /** The table whose parent is the element that scrolls it. */
  tableRef: RefObject<HTMLTableElement | null>;
  items: readonly WindowedItem[];
  pinned: readonly number[];
}) => {
  const windowed = items.length > WINDOWED_FROM_ROWS;
  const [measured, setMeasured] = useState(NOTHING_MEASURED);
  const [scrolled, setScrolled] = useState<Scrolled>(() => ({
    top: 0,
    viewport: window.innerHeight,
  }));
  const layout = useMemo(() => layOut(items, measured), [items, measured]);
  // What the observers of drawn rows and of the scroll need, which they read
  // when they fire rather than being made again by every change.
  const latest = useRef({ layout, windowed });
  useLayoutEffect(() => {
    latest.current = { layout, windowed };
  });

  const sync = useCallback(() => {
    const element = tableRef.current?.parentElement;
    if (!element) return;
    // A scroller with no height shows none of the table, so there is no screen
    // to draw for and nothing is left out: as it is before it is laid out, or
    // wherever nothing is.
    const viewport = element.clientHeight || Number.POSITIVE_INFINITY;
    const top = Math.max(
      0,
      element.scrollTop - (tableRef.current?.tHead?.offsetHeight ?? 0),
    );
    // Left alone until the screen has moved far enough into what is drawn
    // beyond it that drawing more would soon be needed, so a scroll is not a
    // render of the table for every pixel.
    // A transition, so drawing the rows a long scroll comes to can give way to
    // the next scroll: the rows drawn beyond the screen are there to be
    // scrolled through while the rest are drawn.
    startTransition(() =>
      setScrolled((current) =>
        current.viewport === viewport &&
        Math.abs(current.top - top) < overscanFor(viewport) / 2
          ? current
          : { top, viewport },
      ),
    );
  }, [tableRef]);

  // Measured as the rows are drawn, and again whenever one changes height: an
  // editor opening, text wrapping at a new width.
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);

  useEffect(() => {
    const element = tableRef.current?.parentElement;
    if (!windowed || !element) return undefined;
    element.addEventListener('scroll', sync, { passive: true });
    const resized = new ResizeObserver(sync);
    resized.observe(element);
    return () => {
      element.removeEventListener('scroll', sync);
      resized.disconnect();
    };
  }, [tableRef, windowed, sync]);

  // Filtering can leave less table than the scroller was scrolled through.
  useLayoutEffect(() => {
    if (windowed) sync();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the items are not read; a change to them is the reason to look again at where the scroller is
  }, [windowed, items, sync]);

  const [first, end] = useMemo(() => {
    const overscan = overscanFor(scrolled.viewport);
    return itemsBetween(
      layout.offsets,
      scrolled.top - overscan,
      scrolled.top + scrolled.viewport + overscan,
    );
  }, [layout, scrolled]);

  /** Whether item `index` is drawn. */
  const isDrawn = (index: number) =>
    !windowed || (index >= first && index < end) || pinned.includes(index);

  /** How tall items `from` up to `to` are expected to be together. */
  const heightBetween = (from: number, to: number) =>
    (layout.offsets[to] ?? 0) - (layout.offsets[from] ?? 0);

  /** Hands a drawn row to the observer that measures it. */
  const measure = useCallback(
    (element: HTMLElement | null) => {
      if (element === null || !windowed) return undefined;
      observer.current ??= observeHeights(
        () => tableRef.current,
        () => latest.current.layout,
        (changes) =>
          setMeasured((existing) => withMeasurements(existing, changes)),
      );
      const heights = observer.current;
      heights.observe(element);
      return () => heights.unobserve(element);
    },
    // oxlint-disable-next-line react/memo-dependencies -- the ref's identity never changes, but exhaustive-deps cannot know a ref passed in is stable
    [tableRef, windowed],
  );

  /** Scrolls so that item `index` is the first under the column headings. */
  const scrollToItem = useCallback(
    (index: number) => {
      const element = tableRef.current?.parentElement;
      if (!element) return;
      // oxlint-disable-next-line react-hooks/immutability -- the scroller is the element the table is drawn in, which this hook is for moving, not a value it was given
      element.scrollTop = latest.current.layout.offsets[index] ?? 0;
      sync();
    },
    [tableRef, sync],
  );

  return { windowed, isDrawn, heightBetween, measure, scrollToItem };
};
