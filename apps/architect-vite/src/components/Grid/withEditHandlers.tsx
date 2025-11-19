import { connect } from "react-redux";
import { compose, defaultProps, withHandlers } from "recompose";
import { change, formValueSelector } from "redux-form";
import { v4 as uuid } from "uuid";
import { getRemainingSpace } from "./helpers";

const mapStateToProps = (state, { capacity, form, fieldName = "items", itemSelector, editField, template }) => {
	const items = formValueSelector(form)(state, fieldName) || [];
	const itemCount = items ? items.length : 0;
	const item = itemSelector(state, { form, editField });
	const hasSpace = getRemainingSpace(items, capacity) > 0;

	const initialValues = item || { ...template(), id: uuid() };

	return {
		itemCount,
		hasSpace,
		items,
		initialValues,
		fieldName,
	};
};

const mapDispatchToProps = (dispatch, { form }) => ({
	upsert: (fieldId, value) => dispatch(change(form, fieldId, value)),
});

const handlers = withHandlers({
	handleEditField:
		({ setEditField }) =>
		(fieldId) =>
			setEditField(fieldId),
	handleResetEditField:
		({ setEditField }) =>
		() =>
			setEditField(),
	handleAddNew:
		({ setEditField, itemCount, fieldName, upsert, template }) =>
		() => {
			const newItemFieldName = `${fieldName}[${itemCount}]`;
			// Create the new item with a stable UUID
			const newItem = { ...template(), id: uuid() };
			// Add it to the form state immediately
			upsert(newItemFieldName, newItem);
			// Then open the editor
			setEditField(newItemFieldName);
		},
	handleUpdate:
		({ upsert, setEditField, editField, normalize, onChange }) =>
		(value) => {
			upsert(editField, normalize(value));
			if (onChange) {
				onChange(value);
			}
			setImmediate(() => {
				setEditField();
			});
		},
});

const withEditHandlers = compose(
	defaultProps({
		normalize: (value) => value,
		template: () => ({ size: "SMALL" }),
		itemSelector: (state, { form, editField }) => formValueSelector(form)(state, editField),
	}),
	connect(mapStateToProps, mapDispatchToProps),
	handlers,
);

export default withEditHandlers;
