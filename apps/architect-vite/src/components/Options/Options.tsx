import type { VariableOptions } from "@codaco/protocol-validation";
import cx from "classnames";
import { Reorder } from "motion/react";
import { hash } from "ohash";
import type React from "react";
import { connect } from "react-redux";
import { change, FieldArray } from "redux-form";
import { v4 as uuid } from "uuid";
import FieldError from "~/components/Form/FieldError";
import { Button } from "~/lib/legacy-ui/components";
import Option from "./Option";

export type OptionValue = VariableOptions[number];

const minTwoOptions = (value: unknown) =>
	!value || (Array.isArray(value) && value.length < 2)
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

type OptionsFieldProps = {
	fields: {
		map: (callback: (field: string, index: number) => React.ReactNode) => React.ReactNode[];
		get: (index: number) => OptionValue;
		getAll: () => OptionValue[];
		move: (from: number, to: number) => void;
		push: (value: Partial<OptionValue>) => void;
		remove: (index: number) => void;
		name: string;
	};
	meta: {
		error?: string;
		submitFailed: boolean;
		form: string;
	};
	form?: string;
	fieldsName?: string;
	updateField?: (form: string, fieldName: string, value: string) => void;
};

const mapStateToOptionsFieldProps = (state: unknown, { meta: { form }, fields: { name: fieldsName } }) => ({
	form,
	fieldsName,
});

const mapDispatchToOptionsFieldProps = (dispatch: unknown) => ({
	updateField: (form: string, fieldName: string, value: string) => dispatch(change(form, fieldName, value)),
});

const OptionsFieldComponent = ({
	fields,
	meta: { error, submitFailed },
	form,
	fieldsName,
	updateField,
}: OptionsFieldProps) => {
	const classes = cx("options", { "options--has-error": submitFailed && error });

	// Get all options as an array
	const options = fields.getAll() || [];

	// Ensure all options have stable IDs
	options.forEach((option, index) => {
		if (!option._id && updateField && form && fieldsName) {
			updateField(form, `${fieldsName}[${index}]._id`, uuid());
		}
	});

	const handleReorder = (newOrder: OptionValue[]) => {
		for (let i = 0; i < newOrder.length; i++) {
			const newHash = hash(newOrder[i]);
			const oldHash = hash(options[i]);
			if (newHash !== oldHash) {
				const oldIndex = options.findIndex((opt) => hash(opt) === newHash);
				if (oldIndex !== -1 && oldIndex !== i) {
					fields.move(oldIndex, i);
					break;
				}
			}
		}
	};

	return (
		<div className="form-field-container">
			<div className={classes}>
				<Reorder.Group className="options__options" onReorder={handleReorder} values={options} axis="y">
					{fields.map((field: string, index: number) => {
						const option = fields.get(index);

						return <Option key={option._id} value={option} index={index} field={field} fields={fields} />;
					})}
				</Reorder.Group>

				<FieldError show={submitFailed && !!error} error={error} />
			</div>
			<AddItem onClick={() => fields.push({ _id: uuid() })} />
		</div>
	);
};

export const OptionsField = connect(mapStateToOptionsFieldProps, mapDispatchToOptionsFieldProps)(OptionsFieldComponent);

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
