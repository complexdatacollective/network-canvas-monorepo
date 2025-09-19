import { useCallback, useEffect, useRef, useState } from "react";
import { change, formValueSelector } from "redux-form";
import { useAppDispatch } from "~/ducks/hooks";

import { useStore } from "react-redux";
import { useFormContext } from "../Editor";

type UseEditHandlersOptions = {
	fieldName: string;
	normalize?: (value: unknown) => unknown;
	template?: () => Record<string, unknown>;
};

// Default functions defined outside component to prevent recreating on every render
const defaultNormalize = (value: unknown) => value;
const defaultTemplate = () => ({});

export const useEditHandlers = ({
	fieldName,
	normalize = defaultNormalize,
	template = defaultTemplate,
}: UseEditHandlersOptions) => {
	const { form } = useFormContext();
	const dispatch = useAppDispatch();
	const store = useStore();

	// Logging to track re-renders
	const renderCount = useRef(0);
	renderCount.current++;
	console.log(`🔄 useEditHandlers render #${renderCount.current}`, {
		fieldName,
		form,
		normalize: normalize.name || "anonymous",
		template: template.name || "anonymous",
	});

	// State management
	const [editIndex, setEditIndex] = useState<number | null>(null);

	// Get items only when needed for operations, not for rendering
	const getItems = useCallback(() => {
		console.log(`🔍 getItems called`);
		// This creates a selector that gets current state without subscribing to changes
		const state = store.getState();
		return formValueSelector(form)(state, fieldName) || [];
	}, [store, form, fieldName]);

	// Log when getItems callback is recreated
	useEffect(() => {
		console.log(`🔄 getItems callback recreated`);
	}, [getItems]);

	// // Get current item being edited
	// const currentItem = useSelector((state: AppState) =>
	// 	editIndex !== null ? formValueSelector(form)(state, `${fieldName}[${editIndex}]`) : null,
	// );

	// const initialValues = currentItem || template();

	const clearEditField = useCallback(() => {
		console.log(`❌ clearEditField called`);
		setEditIndex(null);
	}, []);

	// Event handlers
	const handleTriggerEdit = useCallback((index: number) => {
		console.log(`✏️ handleTriggerEdit called with index:`, index);
		setEditIndex(index);
	}, []);

	const handleAddNew = useCallback(() => {
		console.log(`➕ handleAddNew called`);
		const items = getItems();
		console.log(`📊 Current items length:`, items.length);
		setEditIndex(items.length);
	}, [getItems]);

	const handleSaveEdit = useCallback(
		(value: unknown) => {
			if (editIndex === null) return;

			try {
				const normalizedValue = normalize(value);
				const fieldPath = `${fieldName}[${editIndex}]`;
				dispatch(change(form, fieldPath, normalizedValue));
				clearEditField();
			} catch (error) {
				console.error("Error updating field:", error);
				throw error;
			}
		},
		[editIndex, normalize, dispatch, form, fieldName, clearEditField],
	);

	return {
		editIndex,
		handleTriggerEdit,
		handleCancelEdit: clearEditField,
		handleSaveEdit,
		handleAddNew,
	};
};
