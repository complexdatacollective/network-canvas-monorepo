import { compose, withState } from "recompose";
import type { WrappedFieldArrayProps } from "redux-form";
import { Section } from "~/components/EditorLayout";
import { Button } from "~/lib/legacy-ui/components";
import ValidatedFieldArray from "../Form/ValidatedFieldArray";
import InlineEditScreen from "../InlineEditScreen/InlineEditScreen";
import IssueAnchor from "../IssueAnchor";
import Grid from "./Grid";
import withEditHandlers from "./withEditHandlers";

const formName = "editable-list-form";

type GridManagerProps = {
	form: string;
	disabled?: boolean;
	fieldName: string;
	contentId?: string | null;
	title?: string | null;
	children?: React.ReactNode;
	// biome-ignore lint/suspicious/noExplicitAny: too hard to type right now
	previewComponent: React.ComponentType<any>;
	// biome-ignore lint/suspicious/noExplicitAny: too hard to type right now
	editComponent: React.ComponentType<any>;
	validation?: Record<string, unknown>;
	editField?: string | null;
	handleEditField: (field: string) => void;
	handleAddNew: () => void;
	handleUpdate: (values: Record<string, unknown>) => void;
	handleResetEditField: () => void;
	hasSpace: boolean;
	capacity: number;
	initialValues?: Record<string, unknown> | null;
	itemCount: number;
	itemSelector: (state: unknown, props: unknown) => unknown;
	items: Array<Record<string, unknown>>;
	normalize: (item: Record<string, unknown>) => Record<string, unknown>;
	setEditField: (field: string | null) => void;
	template?: Record<string, unknown> | null;
	upsert: (item: Record<string, unknown>) => void;
} & Record<string, unknown>;

const notEmpty = (value: unknown) =>
	value && Array.isArray(value) && value.length > 0 ? undefined : "You must create at least one item";

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
	fieldName = "items",
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
		id={contentId}
	>
		<IssueAnchor fieldName={`${fieldName}._error`} description={fieldName} />
		{children}
		<div className="grid-manager">
			<div className="grid-manager__items">
				<ValidatedFieldArray
					name={fieldName}
					component={Grid as unknown as React.ComponentType<WrappedFieldArrayProps<unknown>>}
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
					<Button onClick={handleAddNew} icon="add" color="sea-green">
						Add new item
					</Button>
				</div>
			)}
		</div>
		<InlineEditScreen
			show={!!editField}
			form={formName}
			title={title}
			onSubmit={handleUpdate as (values: unknown) => void}
			onCancel={handleResetEditField}
			initialValues={initialValues ?? undefined}
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

const withEditingState = withState("editField", "setEditField", null);

// Export the composed component with proper typing
// The outer props are what consumers of GridManager pass in (excluding HOC-provided props)
// The inner props are the full GridManagerProps that the component receives
type OuterProps = Omit<
	GridManagerProps,
	| "editField"
	| "setEditField"
	| "handleEditField"
	| "handleAddNew"
	| "handleUpdate"
	| "handleResetEditField"
	| "hasSpace"
	| "initialValues"
	| "itemCount"
	| "items"
	| "upsert"
> & {
	form: string;
	itemSelector?: (state: unknown, props: unknown) => unknown;
	normalize?: (item: Record<string, unknown>) => Record<string, unknown>;
	template?: Record<string, unknown>;
};

export default compose<GridManagerProps, OuterProps>(withEditingState, withEditHandlers)(GridManager);
