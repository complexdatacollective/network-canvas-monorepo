import type { Validation, ValidationName } from "@codaco/protocol-validation";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import type { ComponentType } from "react";
import type { Validator } from "redux-form";
import { v4 } from "uuid";
import ValidatedField from "~/components/Form/ValidatedField";
import OrderedList, { type OrderedListProps } from "~/components/OrderedList/OrderedList";
import { Button } from "~/lib/legacy-ui/components";
import Dialog from "../NewComponents/Dialog";
import { useEditHandlers } from "./useEditHandlers";

type EditComponentProps = FieldType & {
	layoutId: string;
};

const _EditComponent = ({ layoutId, handleCancel, handleUpdate, ...rest }: EditComponentProps) => {
	return (
		<motion.div layoutId={layoutId} className="flex items-center justify-between h-50 w-50 bg-accent p-2 rounded">
			<Button onClick={handleCancel} icon="cancel" color="platinum">
				Cancel
			</Button>
			<Button onClick={handleUpdate} icon="save" color="sea-green">
				Save
			</Button>
		</motion.div>
	);
};

const notEmpty = (value: unknown) =>
	value && Array.isArray(value) && value.length > 0 ? undefined : "You must create at least one item.";

// TODO: Make this a generic that is passed in.
type FieldType = { variable: string; prompt: string }[];

type EditableListProps = {
	sectionTitle: string;
	sectionSummary?: React.ReactNode;
	form: string;
	disabled?: boolean;
	sortMode?: "manual";
	fieldName?: string;
	title?: string | null;
	children?: React.ReactNode;
	previewComponent: ComponentType<FieldType>;
	editComponent: React.ComponentType<
		FieldType[number] & { layoutId: string; handleCancel: () => void; handleUpdate: () => void }
	>;
	validation?: Record<string, Validator> | Record<ValidationName, Validation>;
	// Optional props for customizing hook behavior
	normalize?: (value: unknown) => unknown;
	template?: () => Record<string, unknown>;
};

const EditableList = ({
	fieldName = "prompts",
	children = null,
	validation = { notEmpty },
	// editComponent: EditComponent,
	previewComponent: PreviewComponent,
	normalize = (value) => value, // Function to normalize the value before saving
	template = () => ({ id: v4() }), // Function to provide a template for new items
}: EditableListProps) => {
	const { editIndex, handleTriggerEdit, handleCancelEdit, handleSaveEdit, handleAddNew } = useEditHandlers({
		fieldName,
		normalize,
		template,
	});

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
			<AnimatePresence>
				{editIndex !== null && (
					<motion.div
						key={`edit-component-${editIndex}`}
						layoutId={`${fieldName}-edit-field-${editIndex}`}
						className="absolute top-50 left-50 flex items-center justify-between h-50 w-50 bg-sea-green p-2 rounded"
						transition={{ layout: { duration: 1, type: "spring" } }}
					>
						<Button onClick={handleCancelEdit} color="platinum">
							Cancel
						</Button>
						<Button onClick={handleSaveEdit} color="sea-green">
							Save
						</Button>
					</motion.div>
				)}
			</AnimatePresence>
			<Dialog />
		</>
	);
};

export default EditableList;
