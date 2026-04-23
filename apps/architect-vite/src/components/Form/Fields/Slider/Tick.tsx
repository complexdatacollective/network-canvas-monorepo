import { cx } from "~/utils/cva";
import MarkdownLabel from "../MarkdownLabel";

type TickProps = {
	tick: {
		value: number;
		percent: number;
	};
	getLabelForValue?: (value: number) => string | null;
};

const Tick = ({ tick, getLabelForValue = () => null }: TickProps) => {
	const { value, percent } = tick;
	const label = getLabelForValue(value);

	return (
		<div
			className={cx(
				"absolute top-0 -left-[0.15rem]",
				// Vertical line drawn via ::after so it sits above the tick label anchor
				"after:absolute after:top-0 after:left-0 after:w-0 after:content-['']",
				"after:h-[calc(var(--slider-touch-height)+var(--space-md))]",
				"after:border-l-[0.15rem] after:border-platinum",
				"after:-translate-x-1/2 after:-translate-y-1/2",
			)}
			style={{ left: `${percent}%` }}
		>
			{label && (
				<MarkdownLabel
					inline
					label={label}
					className={cx(
						"absolute top-[var(--space-xl)] -translate-x-1/2",
						"flex justify-center text-center",
						"w-max min-h-[var(--slider-touch-height)] max-w-[calc(var(--slider-align-margin)*1.75)]",
					)}
				/>
			)}
		</div>
	);
};

export default Tick;
