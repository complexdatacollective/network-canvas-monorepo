import React, { useRef } from "react";
import cx from "classnames";
import { v4 as uuid } from "uuid";

type SwitchProps = {
	label?: string | null;
	disabled?: boolean;
	on?: boolean;
	className?: string | null;
	onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

const Switch = ({ 
	label = null, 
	on = false, 
	disabled = false, 
	className = null, 
	onChange = () => {} 
}: SwitchProps) => {
	const id = useRef(uuid());

	const classes = cx("switch", className, { "switch--on": on });

	return (
		<label className={classes} htmlFor={id.current} title={label || undefined}>
			<input
				className="switch__input"
				id={id.current}
				checked={on}
				disabled={disabled}
				type="checkbox"
				value="true"
				onChange={onChange}
			/>
			<div className="switch__button" />
			<div className="switch__label">{label}</div>
		</label>
	);
};

export default Switch;