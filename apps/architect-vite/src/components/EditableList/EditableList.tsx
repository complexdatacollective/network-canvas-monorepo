import { Dialog } from "@base-ui-components/react/dialog";
import type { Validation, ValidationName } from "@codaco/protocol-validation";
import { AnimatePresence } from "motion/react";
import type React from "react";
import type { ComponentType } from "react";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import type { Validator } from "redux-form";
import { formValueSelector } from "redux-form";
import { v4 } from "uuid";
import ValidatedField from "~/components/Form/ValidatedField";
import OrderedList, { type OrderedListProps } from "~/components/OrderedList/OrderedList";
import { Button } from "~/lib/legacy-ui/components";
import { useFormContext } from "../Editor";
import Layout from "../EditorLayout";
import Form from "../InlineEditScreen/Form";
import { DialogBackdrop, DialogPopup } from "../NewComponents/Dialog";
import { useEditHandlers } from "./useEditHandlers";

const notEmpty = (value: unknown) =>
	value && Array.isArray(value) && value.length > 0 ? undefined : "You must create at least one item.";

// TODO: Make this a generic that is passed in.
type FieldType = { variable: string; prompt: string }[];

type EditableListProps = {
	form: string;
	sortMode?: "manual";
	title: string;
	fieldName?: string;
	sortable?: boolean;
	children?: React.ReactNode;
	previewComponent: ComponentType<FieldType>;
	editComponent: React.ComponentType<FieldType[number]> & { form: string };
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
	title,
	editProps = {},
	previewComponent: PreviewComponent,
	onChange,
	normalize = (value) => value, // Function to normalize the value before saving
	template = () => ({ id: v4() }), // Function to provide a template for new items
	sortable = true,
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
		<div className="flex flex-col gap-4 items-start">
			{children}
			<ValidatedField<OrderedListProps>
				name={fieldName}
				component={OrderedList}
				validation={validation}
				componentProps={{
					sortable,
					item: PreviewComponent,
					onClickItem: handleTriggerEdit,
					editIndex: editIndex, // Pass editIndex so it can be used in layout ID
				}}
			/>
			<Button onClick={handleAddNew} icon="add" color="sea-green">
				Create new
			</Button>

			<Dialog.Root open={isOpen} onOpenChange={handleCancelEdit}>
				<AnimatePresence>
					{isOpen && (
						<Dialog.Portal keepMounted>
							<DialogBackdrop onClick={handleCancelEdit} />
							<Form form="editable-list-form" onSubmit={handleSaveEdit} initialValues={initialValuesForEdit}>
								<DialogPopup
									layoutId={`${fieldName}-edit-field-${editIndex}`}
									key="editable-list-dialog"
									header={<h2 className="m-0">{title}</h2>}
									footer={
										<>
											<Dialog.Close
												render={
													<Button onClick={handleCancelEdit} color="platinum">
														Cancel
													</Button>
												}
											/>
											<Button type="submit" color="sea-green">
												Save
											</Button>
										</>
									}
									className="bg-surface-2"
								>
									<Layout>
										<EditComponent
											form="editable-list-form"
											{...(initialValuesForEdit as FieldType[number])}
											{...editProps}
										/>
									</Layout>
								</DialogPopup>
							</Form>
						</Dialog.Portal>
					)}
				</AnimatePresence>
			</Dialog.Root>
		</div>
	);
};
export default EditableList;
