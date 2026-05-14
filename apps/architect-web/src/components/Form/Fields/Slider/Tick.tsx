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
			className="absolute top-0 after:content-[''] after:absolute after:left-0 after:top-0 after:w-0 after:h-(--space-2xl) after:border-l-2 after:border-platinum after:-translate-x-1/2 after:-translate-y-1/2"
			style={{ left: `${percent}%` }}
		>
			{label && (
				<MarkdownLabel
					inline
					label={label}
					className="absolute top-(--space-xl) -translate-x-1/2 flex justify-center w-max min-h-(--space-xl) max-w-(--space-6xl) text-center"
				/>
			)}
		</div>
	);
};

export default Tick;
