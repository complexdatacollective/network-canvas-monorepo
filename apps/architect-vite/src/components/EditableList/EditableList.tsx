import { Button } from "@codaco/legacy-ui/components";
import { startCase } from "es-toolkit/compat";
import { LayoutGroup } from "motion/react";
import type React from "react";
import { Section } from "~/components/EditorLayout";
import ValidatedField from "~/components/Form/ValidatedField";
import InlineEditScreen from "~/components/InlineEditScreen";
import OrderedList from "~/components/OrderedList";
import { getFieldId } from "~/utils/issues";
import { useEditHandlers } from "./useEditHandlers";

const notEmpty = (value: unknown) =>
	value && Array.isArray(value) && value.length > 0 ? undefined : "You must create at least one item.";

type EditableListProps = {
	sectionTitle: string;
	sectionSummary?: React.ReactNode;
	form: string;
	disabled?: boolean;
	sortMode?: "manual";
	fieldName?: string;
	title?: string | null;
	children?: React.ReactNode;
	previewComponent: React.ComponentType<unknown>;
	editComponent: React.ComponentType<unknown>;
	validation?: Record<string, unknown>;
	editProps?: Record<string, unknown>;
	// Optional props for customizing hook behavior
	normalize?: (value: unknown) => unknown;
	template?: () => Record<string, unknown>;
	itemSelector?: (state: unknown, options: { form: string; editField: string }) => unknown;
	onChange?: (value: unknown) => Promise<unknown>;
};

const EditableList = ({
	sectionTitle,
	sectionSummary = null,
	form,
	disabled = false,
	fieldName = "prompts",
	children = null,
	title = null,
	validation = { notEmpty },
	editComponent: EditComponent,
	previewComponent: PreviewComponent,
	editProps = {},
	normalize,
	template,
	itemSelector,
	onChange,
}: EditableListProps) => {
	const { editField, handleEditField, handleCancelEditField, handleAddNew, handleUpdate } = useEditHandlers({
		form,
		fieldName,
		normalize,
		template,
		itemSelector,
		onChange,
	});

	return (
		<Section disabled={disabled} summary={sectionSummary} title={sectionTitle}>
			<LayoutGroup>
				<div id={getFieldId(`${fieldName}._error`)} data-name={startCase(fieldName)} />
				{children}
				<div className="editable-list">
					<div className="editable-list__items">
						<ValidatedField
							name={fieldName}
							component={OrderedList}
							item={PreviewComponent}
							validation={validation}
							onClickItem={handleEditField}
							editField={editField}
							form={form}
						/>
					</div>
					<Button onClick={handleAddNew} size="small" icon="add">
						Create new
					</Button>
				</div>

				<InlineEditScreen
					show={!!editField}
					title={title}
					onSubmit={handleUpdate}
					onCancel={handleCancelEditField}
					form={form}
				>
					<EditComponent {...editProps} />
				</InlineEditScreen>
			</LayoutGroup>
		</Section>
	);
};

export default EditableList;
