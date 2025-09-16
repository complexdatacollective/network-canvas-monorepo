import { bindActionCreators } from "@reduxjs/toolkit";
import { connect } from "react-redux";
import { compose, defaultProps, withHandlers, withProps } from "recompose";
import { change, FieldArray, formValueSelector } from "redux-form";
import NativeSelect from "~/components/Form/Fields/NativeSelect";
import { Button, Icon } from "~/lib/legacy-ui/components";
import { actionCreators as dialogsActions } from "../../ducks/modules/dialogs";
import ValidatedField from "./ValidatedField";

const ItemHandle = () => (
	<div className="form-fields-multi-select__handle">
		<Icon name="move" />
	</div>
);

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
)(({ field, properties, options, rowValues, allValues, handleDelete, handleChange }) => (
	<div className="form-fields-multi-select__rule">
		<div className="form-fields-multi-select__rule-control">
			<ItemHandle />
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
	</div>
));

const Items = compose(
	defaultProps({
		lockAxis: "y",
		useDragHandle: true,
		maxItems: null,
	}),
	withProps(({ fields }) => ({
		onSortEnd: ({ oldIndex, newIndex }) => fields.move(oldIndex, newIndex),
	})),
)(({ fields, maxItems, ...rest }) => {
	const hasSpace = maxItems === null || fields.length < maxItems;
	const showAdd = hasSpace;

	return (
		<>
			<div className="form-fields-multi-select">
				<div className="form-fields-multi-select__rules">
					{fields.map((field, index) => (
						<Item
							index={index}
							key={field}
							field={field}
							fields={fields}
							// eslint-disable-next-line react/jsx-props-no-spreading
							{...rest}
						/>
					))}
				</div>
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
