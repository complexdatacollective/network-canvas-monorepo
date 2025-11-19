import type { Dispatch } from "@reduxjs/toolkit";
import { connect } from "react-redux";
import { compose, defaultProps, withHandlers } from "recompose";
import { change, formValueSelector } from "redux-form";
import type { UnknownAction } from "redux";
import { v4 as uuid } from "uuid";
import type { RootState } from "~/ducks/modules/root";
import { getRemainingSpace } from "./helpers";

type GridItem = {
	id: string;
	size?: string;
	[key: string]: unknown;
};

type OwnProps = {
	capacity?: number;
	form: string;
	fieldName?: string;
	itemSelector: (state: RootState, props: { form: string; editField?: string }) => GridItem | undefined;
	editField?: string;
	template: () => Partial<GridItem>;
};

type StateProps = {
	itemCount: number;
	hasSpace: boolean;
	items: GridItem[];
	initialValues: GridItem;
	fieldName: string;
};

type DispatchProps = {
	upsert: (fieldId: string, value: GridItem) => void;
};

type HandlerProps = StateProps & DispatchProps & OwnProps & {
	setEditField: (fieldId?: string) => void;
	normalize?: (value: GridItem) => GridItem;
	onChange?: (value: GridItem) => void;
};

const mapStateToProps = (state: RootState, { capacity, form, fieldName = "items", itemSelector, editField, template }: OwnProps): StateProps => {
	const items = (formValueSelector(form)(state, fieldName) as GridItem[] | undefined) || [];
	const itemCount = items ? items.length : 0;
	const item = itemSelector(state, { form, editField });
	const hasSpace = getRemainingSpace(items, capacity) > 0;

	const initialValues = item || { ...template(), id: uuid() };

	return {
		itemCount,
		hasSpace,
		items,
		initialValues: initialValues as GridItem,
		fieldName,
	};
};

const mapDispatchToProps = (dispatch: Dispatch<UnknownAction>, { form }: OwnProps): DispatchProps => ({
	upsert: (fieldId: string, value: GridItem) => dispatch(change(form, fieldId, value) as UnknownAction),
});

const handlers = withHandlers<HandlerProps, {}>({
	handleEditField:
		({ setEditField }: HandlerProps) =>
		(fieldId: string) =>
			setEditField(fieldId),
	handleResetEditField:
		({ setEditField }: HandlerProps) =>
		() =>
			setEditField(),
	handleAddNew:
		({ setEditField, itemCount, fieldName, upsert, template }: HandlerProps) =>
		() => {
			const newItemFieldName = `${fieldName}[${itemCount}]`;
			// Create the new item with a stable UUID
			const newItem = { ...template(), id: uuid() };
			// Add it to the form state immediately
			upsert(newItemFieldName, newItem as GridItem);
			// Then open the editor
			setEditField(newItemFieldName);
		},
	handleUpdate:
		({ upsert, setEditField, editField, normalize, onChange }: HandlerProps) =>
		(value: GridItem) => {
			if (editField) {
				upsert(editField, normalize ? normalize(value) : value);
			}
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
		normalize: (value: GridItem) => value,
		template: () => ({ size: "SMALL" }),
		itemSelector: (state: RootState, { form, editField }: { form: string; editField?: string }) => formValueSelector(form)(state, editField) as GridItem | undefined,
	}),
	connect(mapStateToProps, mapDispatchToProps),
	handlers,
);

export default withEditHandlers;
