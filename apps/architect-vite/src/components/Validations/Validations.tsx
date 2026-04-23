import type { Variable } from "@codaco/protocol-validation";
import { keys as getKeys, isNull, toPairs } from "es-toolkit/compat";
import type React from "react";
import { Field } from "redux-form";
import { FieldErrors } from "~/components/Form/FieldErrors";
import { Button } from "~/lib/legacy-ui/components";
import { multiSelectContainerStyles, multiSelectRulesStyles } from "~/styles/shared/multiSelectStyles";
import Validation from "./Validation";

const validate = (validations: Record<string, unknown>): string | undefined => {
	const values = toPairs(validations);

	const check = values.reduce((acc: string[], [key, value]) => {
		if (!isNull(value)) {
			return acc;
		}
		acc.push(key);
		return acc;
	}, []);

	if (check.length === 0) {
		return undefined;
	}

	return `Validations (${check.join(", ")}) must have values`;
};

const format = (value: Record<string, unknown> = {}) => toPairs(value);

const getOptionsWithUsedDisabled = (options: ValidationOption[], used: string[]) =>
	options.map((option) => {
		if (!used.includes(option.value)) {
			return option;
		}
		return { ...option, disabled: true };
	});

const AddItem = (props: React.ComponentProps<typeof Button>) => (
	<Button
		color="sea-green"
		icon="add"
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

type ValidationsFieldProps = {
	input: {
		name: string;
		value: Array<[string, string | number | boolean | null]>;
	};
	options?: ValidationOption[];
	existingVariables: Record<string, Pick<Variable, "name" | "type">>;
	meta: {
		submitFailed: boolean;
		error?: string;
	};
	children?: React.ReactNode;
	onUpdate?: (key: string, value: unknown, itemKey: string) => void;
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
	const hasError = Boolean(submitFailed && error);

	return (
		<div>
			<div className={multiSelectRulesStyles} data-invalid={hasError || undefined}>
				{input.value.map(([key, value]) => (
					<Validation
						key={key}
						itemKey={key}
						itemValue={value}
						options={options}
						existingVariables={existingVariables}
						invalid={hasError}
						// eslint-disable-next-line react/jsx-props-no-spreading
						{...rest}
					/>
				))}
				{children}
			</div>
			<FieldErrors id={`${input.name}-error`} name={input.name} errors={error ? [error] : []} show={hasError} />
		</div>
	);
};

type ValidationsProps = {
	name: string;
	validationOptions?: ValidationOption[];
	value?: Record<string, unknown>;
	addNew: boolean;
	setAddNew: (value: boolean) => void;
	handleChange: (key: string, value: unknown, itemKey: string) => void;
	handleDelete: (itemKey: string) => void;
	handleAddNew: (key: string, value: unknown, itemKey: string) => void;
	existingVariables?: Record<string, Pick<Variable, "name" | "type">>;
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
		<div className={multiSelectContainerStyles}>
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
