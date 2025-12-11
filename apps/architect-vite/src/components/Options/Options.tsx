import type { VariableOptions } from "@codaco/protocol-validation";
import cx from "classnames";
import { Reorder } from "motion/react";
import type React from "react";
import { useCallback, useMemo, useRef } from "react";
import { FieldArray } from "redux-form";
import FieldError from "~/components/Form/FieldError";
import { Button } from "~/lib/legacy-ui/components";
import Option from "./Option";

export type OptionValue = VariableOptions[number];

type InternalItem<T> = {
	_internalId: string;
	data: T;
};

const minTwoOptions = (value: unknown) =>
	!value || (Array.isArray(value) && value.length < 2)
		? "Requires a minimum of two options. If you need fewer options, consider using a boolean variable."
		: undefined;

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
};

const OptionsFieldComponent = ({ fields, meta: { error, submitFailed } }: OptionsFieldProps) => {
	const classes = cx("options", {
		"options--has-error": submitFailed && error,
	});

	// Track internal IDs for items without their own id
	const idMapRef = useRef<WeakMap<object, string>>(new WeakMap());

	// Get all options as an array
	const options = fields.getAll() || [];

	// Get or generate an internal ID for an item
	const getInternalId = useCallback((item: OptionValue): string => {
		// If item has its own id, use it
		if ("id" in item && item.id !== undefined) {
			return String(item.id);
		}
		// Otherwise, get or generate an internal id
		let internalId = idMapRef.current.get(item);
		if (!internalId) {
			internalId = crypto.randomUUID();
			idMapRef.current.set(item, internalId);
		}
		return internalId;
	}, []);

	// Convert value array to internal items with guaranteed IDs
	const internalItems = useMemo((): InternalItem<OptionValue>[] => {
		return options.map((item) => ({
			_internalId: getInternalId(item),
			data: item,
		}));
	}, [options, getInternalId]);

	const handleReorder = (newOrder: InternalItem<OptionValue>[]) => {
		// Find the first item that moved and update the fields accordingly
		for (let i = 0; i < newOrder.length; i++) {
			const newItem = newOrder[i];
			const currentItem = internalItems[i];
			if (newItem && currentItem && newItem._internalId !== currentItem._internalId) {
				const oldIndex = internalItems.findIndex((item) => item._internalId === newItem._internalId);
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
				<Reorder.Group className="options__options" onReorder={handleReorder} values={internalItems} axis="y">
					{internalItems.map((internalItem, index) => {
						const field = `${fields.name}[${index}]`;
						return (
							<Option
								key={internalItem._internalId}
								internalItem={internalItem}
								index={index}
								field={field}
								fields={fields}
							/>
						);
					})}
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
	<FieldArray name={name} component={OptionsFieldComponent} validate={minTwoOptions} {...rest} />
);

export default Options;
