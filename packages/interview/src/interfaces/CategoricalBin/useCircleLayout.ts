import { useCallback, useEffect, useState } from "react";

/**
 * Picks the column count that maximises the cell size for `count` items
 * inside a `width × height` area (accounting for gaps). Pure function so
 * it produces the same `cols` for the same inputs.
 *
 * The bin's actual circle diameter is sized in CSS via container queries
 * (see CategoricalBinItem), so a small drift in the measured container
 * dimensions still yields a stable visual layout — only `cols` is
 * decided here.
 */
function computeCols(width: number, height: number, count: number, gap: number): number {
	if (count === 0 || width <= 0 || height <= 0) return 1;

	let best = 0;
	let bestCols = 1;
	for (let cols = 1; cols <= count; cols++) {
		const rows = Math.ceil(count / cols);
		const cellW = (width - gap * (cols - 1)) / cols;
		const cellH = (height - gap * (rows - 1)) / rows;
		const size = Math.min(cellW, cellH);
		if (size > best) {
			best = size;
			bestCols = cols;
		}
	}

	return bestCols;
}

type UseCircleLayoutOptions = {
	count: number;
};

// Snap measured dimensions before running the algorithm. Container size
// can drift by a few dozen pixels between consecutive runs as the
// AnimatePresence transition + ResizeObserver settle on different
// equilibria; snapping ensures `cols` remains stable across that drift.
const COLS_SNAP_PX = 50;

// Wait this long with no further ResizeObserver callbacks before
// committing the measurement. The CategoricalBin container nests inside a
// flex column whose siblings (Prompts, NodeDrawer, motion AnimatePresence
// children) all reflow asynchronously across multiple frames after mount.
// A single RAF (or even double-RAF) commits during that cascade, capturing
// a transient pre-layout size (e.g. width before flex grow has run).
// 120ms comfortably outlasts the observed long task (~180ms peak; settle
// debounce restarts whenever the observer fires again, so the actual delay
// is just one quiet 120ms window).
const SETTLE_MS = 120;

// Don't commit a measurement that's implausibly small for a categorical bin
// container — the container is `flex-1` inside a full-viewport interface,
// so anything under this is mid-layout. Treat it as "still settling" and
// wait for the next observer callback.
const MIN_PLAUSIBLE_PX = 64;

export function useCircleLayout({ count }: UseCircleLayoutOptions) {
	const [dimensions, setDimensions] = useState({ width: 0, height: 0, gap: 0 });
	const [container, setContainer] = useState<HTMLDivElement | null>(null);

	const containerRef = useCallback((el: HTMLDivElement | null) => {
		setContainer(el);
	}, []);

	useEffect(() => {
		if (!container) return;

		let settleTimer: ReturnType<typeof setTimeout> | null = null;

		const commit = () => {
			settleTimer = null;
			const styles = getComputedStyle(container);
			const computedGap = Number.parseFloat(styles.gap) || 0;
			const padX =
				(Number.parseFloat(styles.paddingInlineStart) || 0) + (Number.parseFloat(styles.paddingInlineEnd) || 0);
			const padY =
				(Number.parseFloat(styles.paddingBlockStart) || 0) + (Number.parseFloat(styles.paddingBlockEnd) || 0);
			const width = Math.max(0, container.clientWidth - padX);
			const height = Math.max(0, container.clientHeight - padY);

			// Reject implausible sizes — restart the settle timer and wait for the
			// container to grow into its final layout.
			if (width < MIN_PLAUSIBLE_PX || height < MIN_PLAUSIBLE_PX) {
				settleTimer = setTimeout(commit, SETTLE_MS);
				return;
			}

			setDimensions({ width, height, gap: computedGap });
		};

		// Settle debounce: every observer callback restarts the timer. We only
		// commit a measurement when the container size has been quiet for
		// SETTLE_MS — past the cascading reflows from sibling motion components,
		// AnimatePresence stagger, and any long task triggered by the same render
		// commit that mounted us.
		const observer = new ResizeObserver(() => {
			if (settleTimer !== null) clearTimeout(settleTimer);
			settleTimer = setTimeout(commit, SETTLE_MS);
		});

		observer.observe(container);

		return () => {
			observer.disconnect();
			if (settleTimer !== null) clearTimeout(settleTimer);
		};
	}, [container]);

	const { width, height, gap } = dimensions;
	const snappedW = Math.floor(width / COLS_SNAP_PX) * COLS_SNAP_PX;
	const snappedH = Math.floor(height / COLS_SNAP_PX) * COLS_SNAP_PX;
	const cols = computeCols(snappedW, snappedH, count, gap);
	const rows = Math.ceil(count / cols);

	// `false` until the first valid measurement has been committed. The container
	// element should still be rendered so the ResizeObserver has something to
	// measure — only the children that depend on cols/rows should be gated on
	// this. Once true, stays true for the lifetime of the hook (we never
	// transition back to "not ready" mid-session).
	const isReady = width > 0 && height > 0;

	return {
		containerRef,
		cols,
		rows,
		isReady,
	};
}
