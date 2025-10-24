import type { VariableOptions } from "@codaco/protocol-validation";
import cx from "classnames";
import { AnimatePresence, Reorder } from "motion/react";
import { hash } from "ohash";
import type React from "react";
import { FieldArray } from "redux-form";
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
	};
	meta: {
		error?: string;
		submitFailed: boolean;
	};
};

export const OptionsField = ({ fields, meta: { error, submitFailed } }: OptionsFieldProps) => {
	const classes = cx("options", { "options--has-error": submitFailed && error });

	// Get all options as an array
	const options = fields.getAll() || [];

	const handleReorder = (newOrder: OptionValue[]) => {
		for (let newIndex = 0; newIndex < newOrder.length; newIndex++) {
			const item = newOrder[newIndex];
			const oldIndex = options.findIndex((opt) => hash(opt) === hash(item));

			if (oldIndex !== newIndex) {
				fields.move(oldIndex, newIndex);
				break;
			}
		}
	};

	return (
		<div className="form-field-container">
			<div className={classes}>
				<Reorder.Group className="options__options" onReorder={handleReorder} values={options} axis="y">
					<AnimatePresence initial={false}>
						{fields.map((field: string, index: number) => {
							const option = fields.get(index);
							const key = hash(option);

							return <Option key={key} value={option} index={index} field={field} fields={fields} />;
						})}
					</AnimatePresence>
				</Reorder.Group>

				<FieldError show={submitFailed && !!error} error={error} />
			</div>
			<AddItem onClick={() => fields.push({})} />
		</div>
	);
};

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
