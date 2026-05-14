import { cx } from "~/utils/cva";
import type { SliderType } from "./Slider";

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
	getTrackProps: () => Record<string, unknown>;
	isFirst?: boolean;
	isLast?: boolean;
	sliderType?: SliderType;
};

const Track = ({ source, target, getTrackProps, isFirst = false, isLast = false, sliderType = null }: TrackProps) => {
	const isLikertOrVas = sliderType === "LIKERT" || sliderType === "VAS";

	return (
		<div
			className={cx(
				"absolute top-1/2 z-(--z-fx) h-(--space-xl) box-content cursor-pointer -translate-y-1/2",
				isFirst && "pl-(--space-md) -translate-x-(--space-md)",
				isLast && "pr-(--space-md)",
			)}
			style={{
				left: `${source.percent}%`,
				width: `${target.percent - source.percent}%`,
			}}
			{...getTrackProps()}
		>
			<div
				className={cx(
					"absolute top-1/2 left-0 h-(--space-md) w-full -translate-y-1/2 rounded-full bg-platinum",
					isFirst && "left-(--space-md) w-[calc(100%-var(--space-md))] bg-active",
					isLast && "w-[calc(100%-var(--space-md))]",
					isLikertOrVas && "rounded-none",
					isFirst && isLikertOrVas && "bg-platinum",
				)}
			/>
		</div>
	);
};

export default Track;
