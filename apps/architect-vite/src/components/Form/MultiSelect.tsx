import type { Dispatch } from "@reduxjs/toolkit";
import { bindActionCreators } from "@reduxjs/toolkit";
import { GripVertical, Trash2 } from "lucide-react";
import { motion, Reorder, useDragControls } from "motion/react";
import { hash } from "ohash";
import { connect } from "react-redux";
import { compose, defaultProps, withHandlers } from "recompose";
import type { UnknownAction } from "redux";
import type { WrappedFieldArrayProps } from "redux-form";
import { change, FieldArray, formValueSelector } from "redux-form";
import { v4 as uuid } from "uuid";
import NativeSelect from "~/components/Form/Fields/NativeSelect";
import type { RootState } from "~/ducks/modules/root";
import { Button } from "~/lib/legacy-ui/components";
import { actionCreators as dialogsActions } from "../../ducks/modules/dialogs";
import ValidatedField from "./ValidatedField";

type PropertyField = {
	fieldName: string;
	[key: string]: unknown;
};

type ItemValue = {
	_id?: string;
	[key: string]: unknown;
};

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

type ItemOwnProps = {
	field: string;
	fields: WrappedFieldArrayProps<ItemValue>["fields"];
	meta: { form: string };
};

const mapStateToItemProps = (
	state: RootState,
	{ field, fields: { name: fieldsName }, meta: { form } }: ItemOwnProps,
) => ({
	rowValues: formValueSelector(form)(state, field) as ItemValue | undefined,
	allValues: formValueSelector(form)(state, fieldsName) as ItemValue[] | undefined,
	form,
});

const mapDispatchToItemProps = (dispatch: Dispatch<UnknownAction>, { meta: { form } }: ItemOwnProps) => ({
	openDialog: bindActionCreators(dialogsActions.openDialog, dispatch),
	resetField: (fieldName: string) => dispatch(change(form, fieldName, null) as UnknownAction),
});

type ItemHandlerProps = ItemOwnProps &
	ReturnType<typeof mapStateToItemProps> &
	ReturnType<typeof mapDispatchToItemProps> & {
		index: number;
		properties: PropertyField[];
		options: (
			fieldName: string,
			rowValues: ItemValue | undefined,
			allValues: ItemValue[] | undefined,
		) => Array<Record<string, unknown>>;
	};

const Item = compose(
	connect(mapStateToItemProps, mapDispatchToItemProps),
	withHandlers<ItemHandlerProps, object>({
		handleDelete:
			({ fields, openDialog, index }: ItemHandlerProps) =>
			() => {
				openDialog({
					type: "Warning",
					title: "Remove item",
					message: "Are you sure you want to remove this item?",
					onConfirm: () => {
						fields.remove(index);
					},
					confirmLabel: "Remove item",
				});
			},
		handleChange:
			({ properties, field, resetField }: ItemHandlerProps) =>
			(index: number) => {
				// Reset any fields after this one in the property index
				for (const { fieldName: propertyFieldName } of properties.slice(index + 1)) {
					resetField(`${field}.${propertyFieldName}`);
				}
			},
	}),
)(
	({
		field,
		properties,
		options,
		rowValues,
		allValues,
		handleDelete,
		handleChange,
		value,
	}: ItemHandlerProps & { value: ItemValue; handleDelete: () => void; handleChange: (index: number) => void }) => {
		const controls = useDragControls();

		return (
			<Reorder.Item
				className="group form-fields-multi-select__rule"
				value={value}
				dragListener={false}
				dragControls={controls}
			>
				<div className="form-fields-multi-select__rule-control">
					<div className="form-fields-multi-select__handle" onPointerDown={(e) => controls.start(e)}>
						<GripVertical className="cursor-grab" />
					</div>
				</div>

				<div className="form-fields-multi-select__rule-options">
					{properties.map(({ fieldName, ...rest }, index) => (
						<div className="form-fields-multi-select__rule-option" key={fieldName}>
							<ValidatedField
								component={NativeSelect}
								name={`${field}.${fieldName}`}
								options={options(fieldName, rowValues, allValues)}
								validation={{ required: true }}
								onChange={() => handleChange(index)}
								// eslint-disable-next-line react/jsx-props-no-spreading
								{...rest}
							/>
						</div>
					))}
				</div>
				<div className="form-fields-multi-select__rule-control">
					<motion.div
						layout
						className="opacity-0 transition-all duration-200 cursor-pointer group-hover:opacity-100 hover:bg-tomato rounded-full p-2 grow-0 shrink-0 h-10 aspect-square"
					>
						<Trash2
							onClick={(e) => {
								e.stopPropagation();
								handleDelete();
							}}
						/>
					</motion.div>
				</div>
			</Reorder.Item>
		);
	},
);

type ItemsOwnProps = {
	meta: { form: string };
	fields: WrappedFieldArrayProps<ItemValue>["fields"];
};

const mapStateToItemsProps = (_state: RootState, { meta: { form }, fields: { name: fieldsName } }: ItemsOwnProps) => ({
	form,
	fieldsName,
});

const mapDispatchToItemsProps = (dispatch: Dispatch<UnknownAction>) => ({
	updateField: (form: string, fieldName: string, value: string) =>
		dispatch(change(form, fieldName, value) as UnknownAction),
});

type ItemsProps = ItemsOwnProps &
	ReturnType<typeof mapStateToItemsProps> &
	ReturnType<typeof mapDispatchToItemsProps> & {
		maxItems?: number | null;
		properties: PropertyField[];
		options: (
			fieldName: string,
			rowValues: ItemValue | undefined,
			allValues: ItemValue[] | undefined,
		) => Array<Record<string, unknown>>;
	};

const Items = compose(
	defaultProps({
		maxItems: null,
	}),
	connect(mapStateToItemsProps, mapDispatchToItemsProps),
)(({ fields, maxItems, form, fieldsName, updateField, ...rest }: ItemsProps) => {
	const hasSpace = maxItems === null || fields.length < maxItems;
	const showAdd = hasSpace;

	const items = (fields.getAll() as ItemValue[]) || [];

	// Ensure all items have stable IDs
	items.forEach((item, index) => {
		if (!item._id) {
			updateField(form, `${fieldsName}[${index}]._id`, uuid());
		}
	});

	const handleReorder = (newOrder: ItemValue[]) => {
		for (let i = 0; i < newOrder.length; i++) {
			const newHash = hash(newOrder[i]);
			const oldHash = hash(items[i]);
			if (newHash !== oldHash) {
				const oldIndex = items.findIndex((item) => hash(item) === newHash);
				if (oldIndex !== -1 && oldIndex !== i) {
					fields.move(oldIndex, i);
					break;
				}
			}
		}
	};

	return (
		<>
			<div className="form-fields-multi-select w-full">
				<Reorder.Group className="form-fields-multi-select__rules" onReorder={handleReorder} values={items} axis="y">
					{fields.map((field: string, index: number) => {
						const item = fields.get(index);

						return (
							<Item
								index={index}
								key={item._id}
								field={field}
								fields={fields}
								value={item}
								// eslint-disable-next-line react/jsx-props-no-spreading
								{...rest}
							/>
						);
					})}
				</Reorder.Group>
			</div>

			{showAdd && <AddItem onClick={() => fields.push({ _id: uuid() })} />}

			{!showAdd && fields.length === 0 && (
				<p>
					<em>No properties available.</em>
				</p>
			)}
		</>
	);
});

type MultiSelectProps = {
	name: string;
	properties: Array<Record<string, unknown>>;
	options: (fieldName: string, rowValues: unknown, allValues: unknown) => Array<Record<string, unknown>>;
	label?: string;
	maxItems?: number | null;
};

const MultiSelect = ({ name, properties, options, label = "", ...rest }: MultiSelectProps) => (
	<div className="form-fields-multi-select w-full">
		{label && <h4>{label}</h4>}
		<FieldArray
			name={name}
			component={Items}
			properties={properties}
			options={options}
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...rest}
		/>
	</div>
);

export default MultiSelect;
