import { Button } from "@codaco/legacy-ui/components";
import cx from "classnames";
import React from "react";
import { compose, defaultProps, withHandlers } from "recompose";
import { FieldArray, FieldArrayRenderProps } from "redux-form";
import FieldError from "~/components/Form/FieldError";
import Option from "./Option";

const minTwoOptions = (value) =>
	!value || value.length < 2
		? "Requires a minimum of two options. If you need fewer options, consider using a boolean variable."
		: undefined;

const AddItem = (props: React.ComponentProps<typeof Button>) => (
	<Button
		color="primary"
		icon="add"
		size="small"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		Add new
	</Button>
);
export const OptionsField = compose(
	defaultProps({
		lockAxis: "y",
		useDragHandle: true,
	}),
	withHandlers({
		onSortEnd:
			({ fields }) =>
			({ oldIndex, newIndex }) =>
				fields.move(oldIndex, newIndex),
	}),
)(({ fields, meta: { error, submitFailed }, ...rest }) => {
	const classes = cx("options", { "options--has-error": submitFailed && error });

	return (
		<div className="form-field-container">
			<div className={classes}>
				<div className="options__options">
					{fields.map((field, index) => (
						<Option
							// eslint-disable-next-line react/jsx-props-no-spreading
							{...rest}
							key={field}
							index={index}
							field={field}
							fields={fields}
						/>
					))}
				</div>

				<FieldError show={submitFailed && error} error={error} />
			</div>
			<AddItem onClick={() => fields.push({})} />
		</div>
	);
});

type OptionsProps = {
	name: string;
	label?: string;
};

const Options = ({ name, label = "", ...rest }: OptionsProps) => (
	<FieldArray
		name={name}
		component={OptionsField}
		validate={minTwoOptions}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...rest}
	/>
);


export default Options;
