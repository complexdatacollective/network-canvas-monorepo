import { Button } from "@codaco/legacy-ui/components";
import cx from "classnames";
import { keys as getKeys, isNull, toPairs } from "es-toolkit/compat";
import React from "react";
import { Field } from "redux-form";
import FieldError from "~/components/Form/FieldError";
import Validation from "./Validation";

const validate = (validations) => {
	const values = toPairs(validations);

	const check = values.reduce((acc, [key, value]) => {
		if (!isNull(value)) {
			return acc;
		}
		return [...acc, key];
	}, []);

	if (check.length === 0) {
		return undefined;
	}

	return `Validations (${check.join(", ")}) must have values`;
};

const format = (value = {}) => toPairs(value);

const getOptionsWithUsedDisabled = (options, used) =>
	options.map((option) => {
		if (!used.includes(option.value)) {
			return option;
		}
		return { ...option, disabled: true };
	});

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

type ValidationOption = {
	label: string;
	value: string;
	disabled?: boolean;
};

type ExistingVariable = {
	name: string;
};

type ValidationsFieldProps = {
	input: {
		value: Array<[string, any]>;
	};
	options?: ValidationOption[];
	existingVariables: Record<string, ExistingVariable>;
	meta: {
		submitFailed: boolean;
		error?: string;
	};
	children?: React.ReactNode;
	onUpdate?: (key: string, value: any, itemKey: string) => void;
	onDelete?: (itemKey: string) => void;
};

const ValidationsField = ({
	input,
	options = [],
	existingVariables,
	meta: { submitFailed, error },
	children = null,
	...rest
}: ValidationsFieldProps) => {
	const fieldClassNames = cx("form-fields-multi-select__field", {
		"form-fields-multi-select__field--has-error": submitFailed && error,
	});

	return (
		<div className={fieldClassNames}>
			<div className="form-fields-multi-select__rules">
				{input.value.map(([key, value]) => (
					<Validation
						key={key}
						itemKey={key}
						itemValue={value}
						options={options}
						existingVariables={existingVariables}
						// eslint-disable-next-line react/jsx-props-no-spreading
						{...rest}
					/>
				))}
				{children}
			</div>
			<FieldError show={!!(submitFailed && error)} error={error} />
		</div>
	);
};

type ValidationsProps = {
	name: string;
	validationOptions?: ValidationOption[];
	value?: Record<string, any>;
	addNew: boolean;
	setAddNew: (value: boolean) => void;
	handleChange: (key: string, value: any, itemKey: string) => void;
	handleDelete: (itemKey: string) => void;
	handleAddNew: (key: string, value: any, itemKey: string) => void;
	existingVariables?: Record<string, ExistingVariable>;
};

const Validations = ({
	name,
	validationOptions = [],
	existingVariables = {},
	value = {},
	addNew,
	setAddNew,
	handleChange,
	handleDelete,
	handleAddNew,
}: ValidationsProps) => {
	const usedOptions = getKeys(value);
	const availableOptions = getOptionsWithUsedDisabled(validationOptions, usedOptions);
	const isFull = usedOptions.length === availableOptions.length;

	return (
		<div className="form-fields-multi-select">
			<Field
				name={name}
				component={ValidationsField}
				format={format}
				options={availableOptions}
				existingVariables={existingVariables}
				onUpdate={handleChange}
				onDelete={handleDelete}
				validate={validate}
			>
				{addNew && (
					<Validation
						onUpdate={handleAddNew}
						onDelete={() => setAddNew(false)}
						options={availableOptions}
						existingVariables={existingVariables}
					/>
				)}
			</Field>

			{!isFull && <AddItem onClick={() => setAddNew(true)} />}
		</div>
	);
};


export default Validations;
