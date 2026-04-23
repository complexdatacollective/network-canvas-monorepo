import { useMemo, useRef } from "react";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import { getInputState } from "~/utils/getInputState";
import Slider from "./Slider/Slider";

type SliderFieldProps = {
	label?: React.ReactNode;
	className?: string;
	hidden?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	hint?: React.ReactNode;
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

// Redux-form turns unset (null) values into empty strings when building the
// input object, so we restore the null sentinel before handing off to Slider.
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
	disabled = false,
	readOnly = false,
	required = false,
	hint,
	type,
}: SliderFieldProps) => {
	const { error, invalid, touched } = meta;
	const idRef = useRef(uuid());
	const id = idRef.current;

	const state = getInputState({ disabled, readOnly, meta });
	const showErrors = Boolean(touched && invalid && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);

	const anyLabel = fieldLabel ?? (typeof label === "string" ? label : undefined);
	const sliderType = getSliderType(type);

	return (
		<BaseField
			id={id}
			name={input.name}
			label={anyLabel}
			hint={hint}
			required={required}
			errors={errors}
			showErrors={showErrors}
			containerProps={hidden ? { hidden: true } : undefined}
		>
			<div data-name={input.name} className={className}>
				<Slider
					options={options}
					parameters={parameters}
					type={sliderType}
					{...input}
					value={getValue(input.value)}
					state={state}
				/>
			</div>
		</BaseField>
	);
};

export default SliderField;
