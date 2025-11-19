/* eslint-disable react/jsx-props-no-spreading */

import cx from "classnames";
import { useRef } from "react";
import { v4 as uuid } from "uuid";
import MarkdownLabel from "./MarkdownLabel";

interface ToggleButtonProps {
	label?: string | null;
	className?: string;
	disabled?: boolean;
	input: {
		value: unknown;
		[key: string]: unknown;
	};
	color?: string;
	fieldLabel?: string | null;
	[key: string]: unknown;
}

const ToggleButton = ({
	label = null,
	className = "",
	input,
	disabled = false,
	color = "cat-color-seq-1",
	fieldLabel = null,
	...rest
}: ToggleButtonProps) => {
	const id = useRef(uuid());

	const componentClasses = cx("form-field-togglebutton", `form-field-togglebutton-${color}`, className, {
		"form-field-togglebutton--disabled": disabled,
	});

	return (
		<label className={componentClasses} htmlFor={id.current}>
			<div>
				<input
					className="form-field-togglebutton__input"
					id={id.current}
					checked={!!input.value}
					{...input}
					{...rest}
					type="checkbox"
				/>
				<div className="form-field-togglebutton__checkbox">
					<MarkdownLabel inline label={label} />
				</div>
			</div>
		</label>
	);
};

export default ToggleButton;
