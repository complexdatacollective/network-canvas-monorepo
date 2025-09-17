import type { Validation, ValidationName } from "@codaco/protocol-validation";
import type React from "react";
import type { ComponentType } from "react";
import { defaultProps } from "recompose";
import type { Validator } from "redux-form";
import { v4 } from "uuid";
import ValidatedField from "~/components/Form/ValidatedField";
import OrderedList, { type OrderedListProps } from "~/components/OrderedList/OrderedList";
import { Button } from "~/lib/legacy-ui/components";
import { useFormContext } from "../Editor";
import Dialog from "../NewComponents/Dialog";
import { useEditHandlers } from "./useEditHandlers";

const notEmpty = (value: unknown) =>
	value && Array.isArray(value) && value.length > 0 ? undefined : "You must create at least one item.";

// TODO: Make this a generic that is passed in.
type FieldType = { variable: string; prompt: string }[];

const withDefaultFieldName = defaultProps({
	fieldName: "prompts",
});

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
	validation?: Record<string, Validator> | Record<ValidationName, Validation>;
	// Optional props for customizing hook behavior
	normalize?: (value: unknown) => unknown;
	template?: () => Record<string, unknown>;
	initialValues?: Record<string, unknown>;
	editField?: string;
};

const EditableList = ({
	fieldName = "prompts",
	children = null,
	validation = { notEmpty },
	editComponent: EditComponent,
	previewComponent: PreviewComponent,
	normalize = (value) => value, // Function to normalize the value before saving
	template = () => ({ id: v4() }), // Function to provide a template for new items
	initialValues,
	editField,
	title,
}: EditableListProps) => {
	const { form } = useFormContext();
	const { editIndex, handleTriggerEdit, handleCancelEdit, handleSaveEdit, handleAddNew } = useEditHandlers({
		fieldName,
		normalize,
		template,
	});

	const isOpen = editIndex !== null;

	console.log("initialValues", initialValues);

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
			<Dialog
				open={isOpen}
				onOpenChange={(open) => !open && handleCancelEdit()}
				title={title}
				onConfirm={() => handleSaveEdit({})} // todo: implement saving form data
				onCancel={handleCancelEdit}
				confirmText="Save"
			>
				<EditComponent form={form} initialValues={initialValues} fieldId={editField} />
			</Dialog>
		</>
	);
};
export default EditableList;
