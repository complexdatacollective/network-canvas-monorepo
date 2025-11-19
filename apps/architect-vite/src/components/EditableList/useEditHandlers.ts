import { useCallback, useState } from "react";
import { useStore } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { useAppDispatch } from "~/ducks/hooks";
import { useFormContext } from "../Editor";

type UseEditHandlersOptions = {
	fieldName: string;
	onChange?: (value: unknown) => Promise<unknown> | unknown;
	normalize?: (value: unknown) => unknown;
	template?: () => Record<string, unknown>;
};

// Default functions defined outside component to prevent recreating on every render
const defaultNormalize = (value: unknown) => value;
const defaultTemplate = () => ({});

export const useEditHandlers = ({
	fieldName,
	onChange,
	normalize = defaultNormalize,
	template = defaultTemplate,
}: UseEditHandlersOptions) => {
	const { form } = useFormContext();
	const dispatch = useAppDispatch();
	const store = useStore();

	// State management
	const [editIndex, setEditIndex] = useState<number | null>(null);

	// Get items only when needed for operations, not for rendering
	const getItems = useCallback(() => {
		// This creates a selector that gets current state without subscribing to changes
		const state = store.getState();
		return formValueSelector(form)(state, fieldName) || [];
	}, [form, fieldName, store]);

	// // Get current item being edited
	// const currentItem = useSelector((state: AppState) =>
	// 	editIndex !== null ? formValueSelector(form)(state, `${fieldName}[${editIndex}]`) : null,
	// );

	// const initialValues = currentItem || template();

	const clearEditField = useCallback(() => {
		setEditIndex(null);
	}, []);

	// Event handlers
	const handleTriggerEdit = useCallback((index: number) => {
		setEditIndex(index);
	}, []);

	const handleAddNew = useCallback(() => {
		const items = getItems();
		setEditIndex(items.length);
	}, [getItems]);

	const handleSaveEdit = useCallback(
		async (value: unknown) => {
			if (editIndex === null) return;
			let valueToSave = value;
			if (onChange) {
				const result = await onChange(value);
				if (result !== undefined) {
					valueToSave = result;
				}
			}

			const normalizedValue = normalize(valueToSave);

			const fieldPath = `${fieldName}[${editIndex}]`;
			dispatch(change(form, fieldPath, normalizedValue));
			clearEditField();
		},
		[editIndex, onChange, normalize, dispatch, form, fieldName, clearEditField],
	);

	return {
		editIndex,
		handleTriggerEdit,
		handleCancelEdit: clearEditField,
		handleSaveEdit,
		handleAddNew,
	};
};
