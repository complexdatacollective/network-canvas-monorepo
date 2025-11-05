import { bindActionCreators } from "@reduxjs/toolkit";
import { GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { hash } from "ohash";
import { connect } from "react-redux";
import { compose, defaultProps, withHandlers } from "recompose";
import { change, FieldArray, formValueSelector } from "redux-form";
import NativeSelect from "~/components/Form/Fields/NativeSelect";
import { Button, Icon } from "~/lib/legacy-ui/components";
import { actionCreators as dialogsActions } from "../../ducks/modules/dialogs";
import ValidatedField from "./ValidatedField";

const ItemDelete = (props) => (
	<div
		className="form-fields-multi-select__delete"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		<Icon name="delete" />
	</div>
);

const AddItem = (props) => (
	<Button
		color="primary"
		icon="add"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		Add new
	</Button>
);

const mapStateToItemProps = (state, { field, fields: { name: fieldsName }, meta: { form } }) => ({
	rowValues: formValueSelector(form)(state, field),
	allValues: formValueSelector(form)(state, fieldsName),
	form,
});

const mapDispatchToItemProps = (dispatch, { meta: { form } }) => ({
	openDialog: bindActionCreators(dialogsActions.openDialog, dispatch),
	resetField: (fieldName) => dispatch(change(form, fieldName, null)),
});

const Item = compose(
	connect(mapStateToItemProps, mapDispatchToItemProps),
	withHandlers({
		handleDelete:
			({ fields, openDialog, index }) =>
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
			({ properties, field, resetField }) =>
			(index) => {
				// Reset any fields after this one in the property index
				properties
					.slice(index + 1)
					.forEach(({ fieldName: propertyFieldName }) => resetField(`${field}.${propertyFieldName}`));
			},
	}),
)(({ field, properties, options, rowValues, allValues, handleDelete, handleChange, value }) => {
	const controls = useDragControls();

	return (
		<Reorder.Item className="form-fields-multi-select__rule" value={value} dragListener={false} dragControls={controls}>
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
				<ItemDelete onClick={handleDelete} />
			</div>
		</Reorder.Item>
	);
});

const Items = compose(
	defaultProps({
		maxItems: null,
	}),
)(({ fields, maxItems, ...rest }) => {
	const hasSpace = maxItems === null || fields.length < maxItems;
	const showAdd = hasSpace;

	const items = fields.getAll() || [];

	const handleReorder = (newOrder) => {
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
			<div className="form-fields-multi-select">
				<Reorder.Group className="form-fields-multi-select__rules" onReorder={handleReorder} values={items} axis="y">
					{fields.map((field: string, index: number) => {
						const item = fields.get(index);

						return (
							<Item
								index={index}
								key={field}
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

			{showAdd && <AddItem onClick={() => fields.push({})} />}

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
	<div className="form-fields-multi-select">
		{label && <div className="form-fields-multi-select__label">{label}</div>}
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
