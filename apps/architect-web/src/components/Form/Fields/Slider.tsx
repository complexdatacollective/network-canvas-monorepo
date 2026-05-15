/* eslint-disable react/jsx-props-no-spreading */

import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";
import MarkdownLabel from "./MarkdownLabel";
import Slider from "./Slider/Slider";

type SliderFieldProps = {
	label?: React.ReactNode;
	className?: string;
	hidden?: boolean;
	input: {
		name: string;
		value: string | number | null;
		onBlur: (value: string | number | null) => void;
		onChange: (value: string | number | null) => void;
		onDragStart: () => void;
		onDrop: () => void;
		onFocus: () => void;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	parameters?: {
		minLabel?: string;
		maxLabel?: string;
	};
	options?: Array<{
		value: string | number;
		label: string;
	}> | null;
	fieldLabel?: string | null;
	type: string;
};

const getSliderType = (variableType: string) => {
	switch (variableType) {
		case "ordinal":
			return "LIKERT";
		case "scalar":
			return "VAS";
		default:
			return null;
	}
};

const hasValue = (value: string | number | null): boolean => value !== "";

/**
 * Empty string value should be treated as `null`
 * because redux-forms turns `null` values (e.g.
 * unset values) into empty strings when
 * building the input object...
 */
const getValue = (value: string | number | null) => {
	if (!hasValue(value)) {
		return null;
	}
	return value;
};

const SliderField = ({
	input,
	meta = {},
	label = null,
	parameters = {},
	options = null,
	fieldLabel = null,
	className = "",
	hidden = false,
	type,
}: SliderFieldProps) => {
	const { error, invalid, touched } = meta;
	const hasError = !!(invalid && touched);
	const anyLabel = fieldLabel || label;
	const sliderType = getSliderType(type);

	return (
		<div className="m-0 [&>h4]:m-0" hidden={hidden}>
			{anyLabel && <MarkdownLabel label={anyLabel} />}
			<div
				className={cx(
					hasError && "[&_.form-field]:mb-0 [&_.form-field]:border-2 [&_.form-field]:border-error",
					className,
				)}
				data-name={input.name}
			>
				<Slider options={options} parameters={parameters} type={sliderType} {...input} value={getValue(input.value)} />
				{hasError && (
					<div className="flex items-center bg-error text-foreground py-(--space-sm) px-(--space-xs) [&_svg]:max-h-(--space-md)">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		</div>
	);
};

export default SliderField;
