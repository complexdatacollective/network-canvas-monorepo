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

export function useCircleLayout({ count }: UseCircleLayoutOptions) {
	const [dimensions, setDimensions] = useState({ width: 0, height: 0, gap: 0 });
	const [container, setContainer] = useState<HTMLDivElement | null>(null);

	const containerRef = useCallback((el: HTMLDivElement | null) => {
		setContainer(el);
	}, []);

	useEffect(() => {
		if (!container) return;

		let rafId: number | null = null;

		const measure = () => {
			rafId = null;
			const styles = getComputedStyle(container);
			const computedGap = Number.parseFloat(styles.gap) || 0;
			const padX =
				(Number.parseFloat(styles.paddingInlineStart) || 0) + (Number.parseFloat(styles.paddingInlineEnd) || 0);
			const padY =
				(Number.parseFloat(styles.paddingBlockStart) || 0) + (Number.parseFloat(styles.paddingBlockEnd) || 0);
			setDimensions({
				width: Math.max(0, container.clientWidth - padX),
				height: Math.max(0, container.clientHeight - padY),
				gap: computedGap,
			});
		};

		const observer = new ResizeObserver(() => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(measure);
		});

		observer.observe(container);
		return () => {
			observer.disconnect();
			if (rafId !== null) cancelAnimationFrame(rafId);
		};
	}, [container]);

	const { width, height, gap } = dimensions;
	const snappedW = Math.floor(width / COLS_SNAP_PX) * COLS_SNAP_PX;
	const snappedH = Math.floor(height / COLS_SNAP_PX) * COLS_SNAP_PX;
	const cols = computeCols(snappedW, snappedH, count, gap);
	const rows = Math.ceil(count / cols);

	return {
		containerRef,
		cols,
		rows,
	};
}
