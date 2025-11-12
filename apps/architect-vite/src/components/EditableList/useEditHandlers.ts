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
	inlineEditing?: boolean;
};

// Default functions defined outside component to prevent recreating on every render
const defaultNormalize = (value: unknown) => value;
const defaultTemplate = () => ({});

export const useEditHandlers = ({
	fieldName,
	onChange,
	normalize = defaultNormalize,
	template = defaultTemplate,
	inlineEditing = false,
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
		if (inlineEditing) {
			// In inline mode, directly add the new item without opening dialog
			const newItem = template();
			const newValues = [...items, newItem];
			dispatch(change(form, fieldName, newValues));
		} else {
			// In dialog mode, open the edit dialog for a new item
			setEditIndex(items.length);
		}
	}, [getItems, inlineEditing, template, dispatch, form, fieldName]);

	const handleSaveEdit = useCallback(
		async (value: unknown) => {
			if (editIndex === null) return;

			try {
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
			} catch (error) {
				console.error("Error updating field:", error);
				throw error;
			}
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
