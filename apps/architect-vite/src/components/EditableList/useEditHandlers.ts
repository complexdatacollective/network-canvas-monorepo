import { useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { v4 as uuid } from "uuid";
import { timelineActionCreators } from "~/ducks/middleware/timeline";
import { getLocus } from "~/selectors/timeline";

interface UseEditHandlersOptions {
	form: string;
	fieldName: string;
	normalize?: (value: any) => any;
	template?: () => any;
	itemSelector?: (state: any, options: { form: string; editField: string }) => any;
	onChange?: (value: any) => Promise<any>;
}

interface EditState {
	editField: string | null;
	locus: any;
}

export const useEditHandlers = ({
	form,
	fieldName,
	normalize = (value) => value,
	template = () => ({}),
	itemSelector,
	onChange,
}: UseEditHandlersOptions) => {
	const dispatch = useDispatch();

	// State management
	const [editState, setEditState] = useState<EditState>({
		editField: null,
		locus: null,
	});

	// Selectors
	const items = useSelector((state: any) => formValueSelector(form)(state, fieldName));
	const itemCount = items ? items.length : 0;
	const locus = useSelector(getLocus);

	// Get current item being edited
	const defaultItemSelector = useCallback(
		(state: any, { form, editField }: { form: string; editField: string }) => formValueSelector(form)(state, editField),
		[],
	);

	const currentItemSelector = itemSelector || defaultItemSelector;
	const currentItem = useSelector((state: any) =>
		editState.editField ? currentItemSelector(state, { form, editField: editState.editField }) : null,
	);

	const initialValues = currentItem || { ...template(), id: uuid() };

	// Action creators
	const upsert = useCallback((fieldId: string, value: any) => dispatch(change(form, fieldId, value)), [dispatch, form]);

	const jump = useCallback((targetLocus: any) => dispatch(timelineActionCreators.jump(targetLocus)), [dispatch]);

	// State handlers
	const setEditField = useCallback(
		(fieldId: string) => {
			setEditState({
				editField: fieldId,
				locus,
			});
		},
		[locus],
	);

	const clearEditField = useCallback(() => {
		setEditState({
			editField: null,
			locus: null,
		});
	}, []);

	const resetEditField = useCallback(() => {
		if (editState.locus) {
			jump(editState.locus);
		}
		setEditState({
			editField: null,
			locus: null,
		});
	}, [editState.locus, jump]);

	// Event handlers
	const handleEditField = useCallback((fieldId: string) => setEditField(fieldId), [setEditField]);

	const handleCancelEditField = useCallback(() => resetEditField(), [resetEditField]);

	const handleAddNew = useCallback(() => {
		const newItemFieldName = `${fieldName}[${itemCount}]`;
		setEditField(newItemFieldName);
	}, [fieldName, itemCount, setEditField]);

	const handleUpdate = useCallback(
		async (value: any) => {
			if (!editState.editField) return;

			try {
				// Using onChange allows us to do some intermediate processing if necessary
				const newValue = onChange ? await onChange(value) : value;
				const normalizedValue = normalize(newValue);

				upsert(editState.editField, normalizedValue);
				clearEditField();
			} catch (error) {
				console.error("Error updating field:", error);
				throw error;
			}
		},
		[editState.editField, onChange, normalize, upsert, clearEditField],
	);

	return {
		// State
		editField: editState.editField,
		locus: editState.locus,
		itemCount,
		initialValues,

		// Handlers
		handleEditField,
		handleCancelEditField,
		handleAddNew,
		handleUpdate,

		// Low-level actions (if needed for advanced use cases)
		setEditField,
		clearEditField,
		resetEditField,
		upsert,
		jump,
	};
};
