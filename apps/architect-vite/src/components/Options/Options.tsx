import cx from "classnames";
import type React from "react";
import { compose, defaultProps, withHandlers } from "recompose";
import { FieldArray } from "redux-form";
import FieldError from "~/components/Form/FieldError";
import { Button } from "~/lib/legacy-ui/components";
import Option from "./Option";

const minTwoOptions = (value) =>
	!value || value.length < 2
		? "Requires a minimum of two options. If you need fewer options, consider using a boolean variable."
		: undefined;

const AddItem = (props: React.ComponentProps<typeof Button>) => (
	<Button
		color="primary"
		icon="add"
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
					{fields.map((field, index) => {
						const option = fields.get(index);

						return (
							<Option
								// eslint-disable-next-line react/jsx-props-no-spreading
								{...rest}
								key={option.value}
								index={index}
								field={field}
								fields={fields}
							/>
						);
					})}
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
