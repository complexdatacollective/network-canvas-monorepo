import { useCallback, useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { useAppDispatch } from "~/ducks/hooks";

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

	// Get items from Redux state
	const items = useSelector((state) => formValueSelector(form)(state, fieldName)) || [];

	// Get items only when needed for operations, not for rendering
	const getItems = useCallback(() => {
		console.log(`🔍 getItems called`);
		return items;
	}, [items]);

	// Log when getItems callback is recreated
	useEffect(() => {
		console.log(`🔄 getItems callback recreated`);
	}, [getItems]);

	// Get current item being edited
	const getCurrentItem = useCallback(() => {
		if (editIndex === null) return null;
		// If we're adding new (index equals array length), return template
		if (editIndex >= items.length) {
			return template();
		}
		// Otherwise return the existing item
		return items[editIndex] || template();
	}, [items, editIndex, template]);

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
		currentItem: getCurrentItem(),
		handleTriggerEdit,
		handleCancelEdit: clearEditField,
		handleSaveEdit,
		handleAddNew,
	};
};
