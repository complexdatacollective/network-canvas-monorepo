import MarkdownLabel from "../MarkdownLabel";

interface TickProps {
  tick: {
    value: number;
    percent: number;
  };
  getLabelForValue?: (value: number) => string | null;
}

const Tick = ({ 
  tick, 
  getLabelForValue = () => null 
}: TickProps) => {
	const { value, percent } = tick;
	const label = getLabelForValue(value);

	return (
		<div
			className="form-field-slider__tick"
			style={{
				position: "absolute",
				left: `${percent}%`,
			}}
		>
			{label && <MarkdownLabel inline label={label} className="form-field-slider__tick-label" />}
		</div>
	);
};

export default Tick;