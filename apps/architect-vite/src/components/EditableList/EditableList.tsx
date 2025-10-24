import type { Validation, ValidationName } from "@codaco/protocol-validation";
import type React from "react";
import type { ComponentType } from "react";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { defaultProps } from "recompose";
import type { Validator } from "redux-form";
import { formValueSelector } from "redux-form";
import { v4 } from "uuid";
import ValidatedField from "~/components/Form/ValidatedField";
import OrderedList, { type OrderedListProps } from "~/components/OrderedList/OrderedList";
import { Button } from "~/lib/legacy-ui/components";
import { useFormContext } from "../Editor";
import InlineEditScreen from "../InlineEditScreen/InlineEditScreen";
import { useEditHandlers } from "./useEditHandlers";

const notEmpty = (value: unknown) =>
	value && Array.isArray(value) && value.length > 0 ? undefined : "You must create at least one item.";

// TODO: Make this a generic that is passed in.
type FieldType = { variable: string; prompt: string }[];

const _withDefaultFieldName = defaultProps({
	fieldName: "prompts",
});

const formName = "editable-list-form";

type EditableListProps = {
	sectionTitle: string;
	sectionSummary?: React.ReactNode;
	form: string;
	disabled?: boolean;
	sortMode?: "manual";
	fieldName?: string;
	title: string;
	children?: React.ReactNode;
	previewComponent: ComponentType<FieldType>;
	editComponent: React.ComponentType<
		FieldType[number] & { layoutId: string; handleCancel: () => void; handleUpdate: () => void }
	>;
	editProps?: Record<string, unknown>;
	validation?: Record<string, Validator> | Record<ValidationName, Validation>;
	// Optional props for customizing hook behavior
	onChange?: (value: unknown) => Promise<unknown> | unknown;
	normalize?: (value: unknown) => unknown;
	template?: () => Record<string, unknown>;
	itemSelector?: (state: unknown, params: { form: string; editField: string }) => unknown;
};

const EditableList = ({
	fieldName = "prompts",
	children = null,
	validation = { notEmpty },
	editComponent: EditComponent,
	editProps = {},
	previewComponent: PreviewComponent,
	onChange,
	normalize = (value) => value, // Function to normalize the value before saving
	template = () => ({ id: v4() }), // Function to provide a template for new items
	title,
	itemSelector,
}: EditableListProps) => {
	const { form } = useFormContext();
	const { editIndex, handleTriggerEdit, handleCancelEdit, handleSaveEdit, handleAddNew } = useEditHandlers({
		fieldName,
		onChange,
		normalize,
		template,
	});

	const isOpen = editIndex !== null;

	// Get current item values for editing & enrich with codebook data using itemSelector
	const currentItemValues = useSelector((state: unknown) => {
		if (editIndex === null) return null;

		const editFieldPath = `${fieldName}[${editIndex}]`;

		if (itemSelector) {
			return itemSelector(state, { form, editField: editFieldPath });
		}

		const selector = formValueSelector(form);
		return selector(state, `${fieldName}[${editIndex}]`);
	});

	// Memoize template result to prevent form reinitialization
	const templateValues = useMemo(() => template(), [editIndex]);
	const initialValuesForEdit = currentItemValues || templateValues;

	return (
		<>
			{children}
			<ValidatedField<OrderedListProps>
				name={fieldName}
				component={OrderedList}
				validation={validation}
				componentProps={{
					item: PreviewComponent,
					onClickItem: handleTriggerEdit,
					editIndex: editIndex, // Pass editIndex so OrderedList can hide the editing item
				}}
			/>
			<Button onClick={handleAddNew} icon="add">
				Create new
			</Button>
			<InlineEditScreen
				show={isOpen}
				form={formName}
				title={title}
				onSubmit={handleSaveEdit}
				onCancel={handleCancelEdit}
				initialValues={initialValuesForEdit}
			>
				<EditComponent form={formName} entity={editProps?.entity} type={editProps?.type} />
			</InlineEditScreen>
		</>
	);
};
export default EditableList;
