import cx from "classnames";
import { useRef } from "react";
import { fieldPropTypes } from "redux-form";
import { v4 as uuid } from "uuid";

type TextAreaProps = {
	meta: any;
	label?: string;
	input: any;
} & typeof fieldPropTypes;

const TextArea = ({ meta, label, input }: TextAreaProps) => {
	const id = useRef(uuid());

	const { active, touched, invalid, error } = meta;

	const textareaClasses = cx("form-fields-textarea", {
		"form-fields-textarea--is-focussed": active,
		"form-fields-textarea--has-error": touched && invalid,
	});

	return (
		<label htmlFor={id.current} className={textareaClasses}>
			{label && <div className="form-fields-textarea__label">{label}</div>}
			<div className="form-fields-textarea__edit">
				<textarea
					className={cx("form-fields-textarea__input")}
					id={id.current}
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...input}
				/>
			</div>
			{touched && invalid && <p className="form-fields-markdown__error">{error}</p>}
		</label>
	);
};


export default TextArea;
