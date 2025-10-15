/* eslint-disable react/jsx-props-no-spreading */

import cx from "classnames";
import MarkdownLabel from "./MarkdownLabel";
import Boolean from "~/lib/legacy-ui/components/Boolean/Boolean";
import Icon from "~/lib/legacy-ui/components/Icon";

interface BooleanOption {
	label: string | (() => string);
	value: boolean | string | number;
	classes?: string;
	icon?: () => React.ReactNode;
	negative?: boolean;
}

interface BooleanFieldProps {
	label?: string | null;
	fieldLabel?: string | null;
	noReset?: boolean;
	className?: string;
	input: {
		name: string;
		value: unknown;
		onChange: (value: unknown) => void;
	};
	disabled?: boolean;
	options?: BooleanOption[];
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
}

const BooleanField = ({
	label = null,
	fieldLabel = null,
	noReset = false,
	className = "",
	input,
	disabled = false,
	options = [
		{ label: "Yes", value: true },
		{ label: "No", value: false, negative: true },
	],
	meta = {},
}: BooleanFieldProps) => {
	const { error, invalid, touched } = meta;
	const componentClasses = cx(
		"form-field-container form-field-boolean",
		className,
		{
			"form-field-boolean--disabled": disabled,
		},
		{
			"form-field-boolean--has-error": invalid && touched && error,
		},
	);

	const anyLabel = fieldLabel || label;

	return (
		<div className={componentClasses} name={input.name}>
			{anyLabel && <MarkdownLabel label={anyLabel} />}
			<div className="form-field-boolean__control">
				<Boolean options={options} value={input.value} onChange={input.onChange} noReset={noReset} />
				{invalid && touched && (
					<div className="form-field-boolean__error">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		</div>
	);
};

export default BooleanField;
