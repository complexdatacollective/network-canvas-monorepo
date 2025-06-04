import cx from "classnames";
import Icon from "../../Icon";
import Slider from "./Slider";
import MarkdownLabel from "../MarkdownLabel";

interface SliderFieldProps {
  label?: React.ReactNode;
  className?: string;
  hidden?: boolean;
  input: {
    name: string;
    value: string | number | null;
    onBlur: (value: any) => void;
    onChange: (value: any) => void;
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
}

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

	const formFieldClasses = cx(className, "form-field-slider", { "form-field-slider--has-error": invalid && touched });

	const anyLabel = fieldLabel || label;
	const sliderType = getSliderType(type);

	return (
		<div className="form-field-container" hidden={hidden}>
			{anyLabel && <MarkdownLabel label={anyLabel} />}
			<div className={formFieldClasses} data-name={input.name}>
				<Slider
					options={options}
					parameters={parameters}
					type={sliderType}
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...input}
					value={getValue(input.value)}
				/>
				{invalid && touched && (
					<div className="form-field-slider__error">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		</div>
	);
};

export default SliderField;