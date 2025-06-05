import { Button } from "@codaco/legacy-ui/components";
import { startCase } from "es-toolkit/compat";
import { LayoutGroup } from "motion/react";
import React from "react";
import { compose } from "recompose";
import { Section } from "~/components/EditorLayout";
import ValidatedField from "~/components/Form/ValidatedField";
import InlineEditScreen from "~/components/InlineEditScreen";
import OrderedList from "~/components/OrderedList";
import { getFieldId, scrollToFirstIssue } from "~/utils/issues";
import withEditHandlers from "./withEditHandlers";

const formName = "editable-list-form";

const sortModes = ["manual"];

const notEmpty = (value) => (value && value.length > 0 ? undefined : "You must create at least one item.");

const handleSubmitFail = (issues) => {
	scrollToFirstIssue(issues);
};


type EditableListProps = {
	sectionTitle: string;
	sectionSummary?: React.ReactNode;
	form: string;
	disabled?: boolean;
	sortMode?: "manual";
	fieldName?: string;
	contentId?: string;
	title?: string;
	children?: React.ReactNode;
	previewComponent: React.ComponentType<any>;
	editComponent: React.ComponentType<any>;
	validation?: Record<string, unknown>;
	editField?: string;
	handleEditField: (field: string) => void;
	handleCancelEditField: () => void;
	handleCompleteEditField?: () => void;
	handleUpdate: (values: any) => void;
	handleAddNew: () => void;
	upsert: (values: any) => void;
	itemCount: any;
	setEditField: (field: string) => void;
	initialValues?: any;
	editProps?: any;
};

const EditableList = ({
	sectionTitle,
	sectionSummary = null,
	editField = null,
	handleEditField,
	handleCancelEditField,
	handleCompleteEditField = () => {},
	handleUpdate,
	disabled = false,
	sortMode = "manual",
	handleAddNew,
	fieldName = "prompts",
	contentId = null,
	children = null,
	upsert,
	title = null,
	validation = { notEmpty },
	itemCount,
	setEditField,
	initialValues = null,
	editComponent: EditComponent,
	previewComponent: PreviewComponent,
	editProps = null,
	...rest
}: EditableListProps) => (
	<Section disabled={disabled} contentId={contentId} summary={sectionSummary} title={sectionTitle}>
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
						form={formName}
						// eslint-disable-next-line react/jsx-props-no-spreading
						// {...rest}
					/>
				</div>
				<Button onClick={handleAddNew} size="small" icon="add">
					Create new
				</Button>
			</div>

			<InlineEditScreen
				show={!!editField}
				initialValues={initialValues}
				title={title}
				onSubmit={handleUpdate}
				onSubmitFail={handleSubmitFail}
				onCancel={handleCancelEditField}
				layoutId={editField}
				form={formName}
				// eslint-disable-next-line react/jsx-props-no-spreading
				{...editProps}
			>
				<EditComponent
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...rest}
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...editProps}
					form={formName}
					initialValues={initialValues}
					fieldId={editField}
				/>
			</InlineEditScreen>
		</LayoutGroup>
	</Section>
);


export { EditableList };

export default compose(withEditHandlers)(EditableList);
