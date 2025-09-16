import { compose, defaultProps, withState } from "recompose";
import { Section } from "~/components/EditorLayout";
import InlineEditScreen from "~/components/InlineEditScreen";
import { Button } from "~/lib/legacy-ui/components";
import { getFieldId, scrollToFirstIssue } from "../../utils/issues";
import ValidatedFieldArray from "../Form/ValidatedFieldArray";
import Grid from "./Grid";
import withEditHandlers from "./withEditHandlers";

type GridManagerProps = {
	form: string;
	disabled?: boolean;
	fieldName: string;
	contentId?: string | null;
	title?: string | null;
	children?: React.ReactNode;
	previewComponent: React.ComponentType<any>;
	editComponent: React.ComponentType<any>;
	validation?: Record<string, any>;
	editField?: string | null;
	handleEditField: (field: string) => void;
	handleAddNew: () => void;
	handleUpdate: (values: any) => void;
	handleResetEditField: () => void;
	hasSpace: boolean;
	capacity: number;
	initialValues?: any;
	itemCount: number;
	itemSelector: (state: any, props: any) => any;
	items: any[];
	normalize: (item: any) => any;
	setEditField: (field: string | null) => void;
	template?: any;
	upsert: (item: any) => void;
} & Record<string, any>;

const formName = "editable-list-form";

const notEmpty = (value: any) => (value && value.length > 0 ? undefined : "You must create at least one item");

const handleSubmitFail = (issues: any) => {
	scrollToFirstIssue(issues);
};

const GridManager = ({
	editField = null,
	disabled = false,
	contentId = null,
	children = null,
	validation = { notEmpty },
	handleEditField,
	handleAddNew,
	handleUpdate,
	handleResetEditField,
	hasSpace,
	title = null,
	fieldName,
	capacity,
	initialValues = null,
	editComponent: EditComponent,
	previewComponent,
	itemCount,
	itemSelector,
	items,
	normalize,
	setEditField,
	template = null,
	upsert,
	...rest
}: GridManagerProps) => (
	<Section
		title="Items"
		summary={
			<p>
				Add up to four content blocks (depending on size) below. You can resize a content block by dragging the bottom
				right corner.
			</p>
		}
		disabled={disabled}
		contentId={contentId}
	>
		<div id={getFieldId(`${fieldName}._error`)} data-name={fieldName} />
		{children}
		<div className="grid-manager">
			<div className="grid-manager__items">
				<ValidatedFieldArray
					name={fieldName}
					component={Grid}
					previewComponent={previewComponent}
					validation={validation}
					onEditItem={handleEditField}
					editField={editField}
					capacity={capacity}
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...rest}
				/>
			</div>
			{hasSpace && (
				<div className="grid-manager__add">
					<Button onClick={handleAddNew} icon="add">
						Add new item
					</Button>
				</div>
			)}
		</div>
		<InlineEditScreen
			show={!!editField}
			initialValues={initialValues}
			flipId={editField}
			title={title}
			onSubmit={handleUpdate}
			onSubmitFail={handleSubmitFail}
			onCancel={handleResetEditField}
			form={formName}
		>
			<EditComponent
				// eslint-disable-next-line react/jsx-props-no-spreading
				{...rest}
				form={formName}
				fieldId={editField}
				onComplete={handleResetEditField}
			/>
		</InlineEditScreen>
	</Section>
);

const withDefaultFieldName = defaultProps({
	fieldName: "items",
});

const withEditingState = withState("editField", "setEditField", null);

export { GridManager };

export default compose(withDefaultFieldName, withEditingState, withEditHandlers)(GridManager);
