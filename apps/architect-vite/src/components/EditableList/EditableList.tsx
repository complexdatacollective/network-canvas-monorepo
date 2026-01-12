import type { Validation } from "@codaco/protocol-validation";
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
import { MarkdownLabel } from "../Form/Fields";
import Form from "../InlineEditScreen/Form";
import Dialog from "../NewComponents/Dialog";
import { useEditHandlers } from "./useEditHandlers";

const notEmpty = (value: unknown) =>
	value && Array.isArray(value) && value.length > 0 ? undefined : "You must create at least one item.";

type EditableListProps = {
	label?: string;
	form: string;
	sortMode?: "manual";
	title: string;
	fieldName?: string;
	sortable?: boolean;
	children?: React.ReactNode;
	// biome-ignore lint/suspicious/noExplicitAny: too complex to type for now
	previewComponent: ComponentType<any>;
	// biome-ignore lint/suspicious/noExplicitAny: too complex to type for now
	editComponent: ComponentType<any>;
	editProps?: Record<string, unknown>;
	validation?: Record<string, Validator> | Partial<Validation>;
	// Optional props for customizing hook behavior
	onChange?: (value: unknown) => Promise<unknown> | unknown;
	normalize?: (value: unknown) => unknown;
	template?: () => Record<string, unknown>;
	itemSelector?: (state: Record<string, unknown>, params: { form: string; editField: string }) => unknown;
};

const EditableList = ({
	label,
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
	const currentItemValues = useSelector((state: Record<string, unknown>) => {
		if (editIndex === null) return null;

		const editFieldPath = `${fieldName}[${editIndex}]`;

		if (itemSelector) {
			return itemSelector(state, { form, editField: editFieldPath }) as Record<string, unknown>;
		}

		const selector = formValueSelector(form);
		return selector(state, `${fieldName}[${editIndex}]`) as Record<string, unknown>;
	});

	// Memoize template result to prevent form reinitialization
	// Note: `id` is automatically added to all items if not provided by the template
	const templateValues = useMemo(() => {
		const customTemplate = template();
		return {
			...customTemplate,
			id: customTemplate.id ?? v4(),
		};
	}, [template, editIndex]);
	const initialValuesForEdit = currentItemValues || templateValues;

	return (
		<div className="flex flex-col gap-4 items-start">
			{label && (
				<h4>
					<MarkdownLabel label={label} />
				</h4>
			)}
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

			<Dialog
				open={isOpen}
				onOpenChange={handleCancelEdit}
				layoutId={`${fieldName}-edit-field-${editIndex}`}
				/* This hack is needed to make sure Base-UI's dialog works with framer-motion's layoutId animations */
				initial={{ opacity: 0.9999 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0.9999 }}
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
						<Button type="submit" form="editable-list-form" color="sea-green">
							Save
						</Button>
					</>
				}
				className="bg-surface-2"
			>
				<Form
					form="editable-list-form"
					id="editable-list-form"
					onSubmit={handleSaveEdit}
					initialValues={initialValuesForEdit}
				>
					<Layout>
						<EditComponent
							{...(initialValuesForEdit as Record<string, unknown>)}
							{...editProps}
							form="editable-list-form"
						/>
					</Layout>
				</Form>
			</Dialog>
		</div>
	);
};
export default EditableList;
