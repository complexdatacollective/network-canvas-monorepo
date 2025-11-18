import cx from "classnames";
import { useState } from "react";
import MarkdownLabel from "../MarkdownLabel";

interface HandleProps {
	domain: [number, number];
	handle: {
		id: string;
		value: number;
		percent: number;
	};
	isActive?: boolean;
	isDisabled?: boolean;
	showTooltips?: boolean;
	getHandleProps: (id: string, props?: Record<string, unknown>) => Record<string, unknown>;
	getLabelForValue: (value: number) => string | null;
}

const Handle = ({
	domain: [min, max],
	handle: { id, value, percent },
	isActive = false,
	isDisabled = false,
	showTooltips = false,
	getHandleProps,
	getLabelForValue,
}: HandleProps) => {
	const [mouseOver, setMouseOver] = useState(false);

	const handleMouseEnter = () => setMouseOver(true);
	const handleMouseLeave = () => setMouseOver(false);

	const showTooltip = showTooltips && (mouseOver || isActive) && !isDisabled;
	const handleProps = getHandleProps(id, {
		onMouseEnter: handleMouseEnter,
		onMouseLeave: handleMouseLeave,
	});

	const markerClasses = cx(
		"form-field-slider__marker",
		{ "form-field-slider__marker--is-active": isActive },
		{ "form-field-slider__marker--is-disabled": isDisabled },
	);

	const tooltipClasses = cx("form-field-slider__tooltip", { "form-field-slider__tooltip--is-active": showTooltip });

	const label = getLabelForValue(value);

	return (
		<>
			{showTooltips && (
				<div className={tooltipClasses} style={{ left: `${percent}%` }}>
					<MarkdownLabel inline label={label} className="form-field-slider__tooltip-label" />
				</div>
			)}
			<div className="form-field-slider__handle" style={{ left: `${percent}%` }} {...handleProps} />
			<div
				role="slider"
				aria-label="Slider"
				aria-valuemin={min}
				aria-valuemax={max}
				aria-valuenow={value}
				className={markerClasses}
				style={{ left: `${percent}%` }}
			/>
		</>
	);
};

export default Handle;
