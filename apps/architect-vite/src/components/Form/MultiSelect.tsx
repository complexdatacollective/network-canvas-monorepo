import type { Dispatch } from "@reduxjs/toolkit";
import { bindActionCreators } from "@reduxjs/toolkit";
import { GripVertical, Trash2 } from "lucide-react";
import { motion, Reorder, useDragControls } from "motion/react";
import { useRef } from "react";
import { connect } from "react-redux";
import { withHandlers } from "recompose";
import type { UnknownAction } from "redux";
import type { WrappedFieldArrayProps } from "redux-form";
import { change, FieldArray, formValueSelector } from "redux-form";
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
	[key: string]: unknown;
};

type InternalItem<T> = {
	_internalId: string;
	data: T;
};

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

type ItemHandlers = {
	handleDelete: () => void;
	handleChange: (index: number) => void;
};

type ItemComponentProps = ItemHandlerProps & {
	internalItem: InternalItem<ItemValue>;
} & ItemHandlers;

const ItemComponent: React.FC<ItemComponentProps> = ({
	field,
	properties,
	options,
	rowValues,
	allValues,
	handleDelete,
	handleChange,
	internalItem,
}) => {
	const controls = useDragControls();

	return (
		<Reorder.Item
			className="group form-fields-multi-select__rule"
			value={internalItem}
			dragListener={false}
			dragControls={controls}
		>
			<div className="form-fields-multi-select__rule-control">
				<div className="form-fields-multi-select__handle" onPointerDown={(e) => controls.start(e)}>
					<GripVertical className="cursor-grab" />
				</div>
			</div>

			<div className="form-fields-multi-select__rule-options">
				{properties.map(({ fieldName, component, ...rest }, index) => {
					const selectOptions = options(fieldName, rowValues, allValues);
					const FieldComponent = component ?? NativeSelect;
					const componentProps = component ? rest : { options: selectOptions, ...rest };
					return (
						<div className="form-fields-multi-select__rule-option" key={fieldName}>
							<ValidatedField
								component={FieldComponent as React.ComponentType<Record<string, unknown>>}
								name={`${field}.${fieldName}`}
								componentProps={componentProps}
								validation={{ required: true }}
								onChange={() => handleChange(index)}
							/>
						</div>
					);
				})}
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
};

const ItemWithHandlers = withHandlers<ItemHandlerProps, ItemHandlers>({
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
})(ItemComponent);

type ItemExportProps = ItemOwnProps & {
	index: number;
	properties: PropertyField[];
	options: (
		fieldName: string,
		rowValues: ItemValue | undefined,
		allValues: ItemValue[] | undefined,
	) => Array<Record<string, unknown>>;
	internalItem: InternalItem<ItemValue>;
};

const Item = connect(
	mapStateToItemProps,
	mapDispatchToItemProps,
)(ItemWithHandlers) as unknown as React.ComponentType<ItemExportProps>;

type ItemsOwnProps = {
	meta: { form: string };
	fields: WrappedFieldArrayProps<ItemValue>["fields"];
};

type ItemsProps = ItemsOwnProps & {
	maxItems?: number | null;
	properties: PropertyField[];
	options: (
		fieldName: string,
		rowValues: ItemValue | undefined,
		allValues: ItemValue[] | undefined,
	) => Array<Record<string, unknown>>;
};

type ItemsComponentProps = WrappedFieldArrayProps<ItemValue> & ItemsProps;

const ItemsComponent: React.FC<ItemsComponentProps> = ({ fields, maxItems = null, ...rest }) => {
	const hasSpace = maxItems === null || fields.length < (maxItems ?? 0);
	const showAdd = hasSpace;

	const items = (fields.getAll() as ItemValue[]) || [];

	// Track stable wrapper objects - Reorder.Group needs stable references to track items
	// Pattern from Options.tsx
	const internalItemsRef = useRef<InternalItem<ItemValue>[]>([]);

	// Sync internalItemsRef with current items, maintaining stable references
	// Handle additions - add new wrappers for new items
	while (internalItemsRef.current.length < items.length) {
		internalItemsRef.current.push({
			_internalId: crypto.randomUUID(),
			data: {} as ItemValue,
		});
	}

	// Handle deletions - find which specific item was removed
	if (internalItemsRef.current.length > items.length) {
		const currentDataSet = new Set(items);
		const indexToRemove = internalItemsRef.current.findIndex((wrapper) => !currentDataSet.has(wrapper.data));
		if (indexToRemove !== -1) {
			internalItemsRef.current.splice(indexToRemove, 1);
		} else {
			// Fallback: truncate from end if we can't find the removed item
			internalItemsRef.current.length = items.length;
		}
	}

	// Update data references (stable wrapper objects, fresh data)
	for (let i = 0; i < items.length; i++) {
		const wrapper = internalItemsRef.current[i];
		const item = items[i];
		if (wrapper && item) {
			wrapper.data = item;
		}
	}

	// Use the stable reference array
	const internalItems = internalItemsRef.current;

	const handleReorder = (newOrder: InternalItem<ItemValue>[]) => {
		for (let i = 0; i < newOrder.length; i++) {
			const newItem = newOrder[i];
			const currentItem = internalItems[i];
			if (newItem && currentItem && newItem._internalId !== currentItem._internalId) {
				const oldIndex = internalItems.findIndex((item) => item._internalId === newItem._internalId);
				if (oldIndex !== -1 && oldIndex !== i) {
					// Reorder internalItemsRef to match the new visual order BEFORE calling fields.move
					const [movedItem] = internalItemsRef.current.splice(oldIndex, 1);
					if (movedItem) {
						internalItemsRef.current.splice(i, 0, movedItem);
					}
					fields.move(oldIndex, i);
					break;
				}
			}
		}
	};

	return (
		<>
			<div className="form-fields-multi-select w-full">
				<Reorder.Group
					className="form-fields-multi-select__rules"
					onReorder={handleReorder}
					values={internalItems}
					axis="y"
				>
					{internalItems.map((internalItem, index) => {
						const field = `${fields.name}[${index}]`;

						return (
							<Item
								index={index}
								key={internalItem._internalId}
								field={field}
								fields={fields}
								internalItem={internalItem}
								// eslint-disable-next-line react/jsx-props-no-spreading
								{...rest}
							/>
						);
					})}
				</Reorder.Group>
			</div>

			{showAdd && <AddItem onClick={() => fields.push({})} />}

			{!showAdd && fields.length === 0 && (
				<p>
					<em>No properties available.</em>
				</p>
			)}
		</>
	);
};

const Items = ItemsComponent as unknown as React.ComponentType<WrappedFieldArrayProps<ItemValue> & ItemsProps>;

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
			component={Items as unknown as React.ComponentType<WrappedFieldArrayProps<ItemValue> & Record<string, unknown>>}
			properties={properties}
			options={options}
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...rest}
		/>
	</div>
);

export default MultiSelect;
