import type { CSSProperties } from "react";
import { cx } from "~/utils/cva";

type TrackProps = {
	source: {
		id: string;
		value: number;
		percent: number;
	};
	target: {
		id: string;
		value: number;
		percent: number;
	};
	isFilled?: boolean;
	getTrackProps: () => Record<string, unknown>;
};

// Each Track segment sits between two handles. The first segment (before the
// only handle on a single-value slider) is the "filled" portion.
const Track = ({ source, target, isFilled = false, getTrackProps }: TrackProps) => {
	const style: CSSProperties = {
		left: `${source.percent}%`,
		width: `${target.percent - source.percent}%`,
	};

	return (
		<div
			className={cx(
				"absolute top-1/2 z-10 box-content -translate-y-1/2 cursor-pointer",
				"h-[var(--slider-touch-height)]",
				"first:pl-[calc(var(--slider-touch-height)*0.5)] first:-translate-x-[calc(var(--slider-touch-height)*0.5)] first:-translate-y-1/2",
				"last:pr-[calc(var(--slider-touch-height)*0.5)]",
			)}
			style={style}
			{...getTrackProps()}
		>
			<div
				className={cx(
					"absolute top-1/2 left-0 w-full -translate-y-1/2",
					"h-[calc(var(--slider-touch-height)*0.5)] rounded-[calc(var(--slider-touch-height)*0.5)]",
					isFilled ? "bg-sea-green" : "bg-platinum",
					// When the slider is VAS/Likert the parent removes rounding via data attr
					"group-data-[flat-track]:rounded-none",
					"first:left-[calc(var(--slider-touch-height)*0.5)] first:w-[calc(100%-calc(var(--slider-touch-height)*0.5))]",
					"last:w-[calc(100%-calc(var(--slider-touch-height)*0.5))]",
					// For VAS/Likert, the "filled" first track should use the unfilled color
					"group-data-[flat-track]:first:bg-platinum",
				)}
			/>
		</div>
	);
};

export default Track;
