import { compose } from "recompose";
import EditableList from "~/components/EditableList";
import { Section } from "~/components/EditorLayout";
import withDisabledFormTitle from "~/components/enhancers/withDisabledFormTitle";
import withDisabledSubjectRequired from "~/components/enhancers/withDisabledSubjectRequired";
import withSubject from "~/components/enhancers/withSubject";
import TextField from "~/components/Form/Fields/Text";
import ValidatedField from "~/components/Form/ValidatedField";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import FieldFields from "./FieldFields";
import FieldPreview from "./FieldPreview";
import { itemSelector, normalizeField } from "./helpers";
import withFormHandlers from "./withFormHandlers";

type FormProps = StageEditorSectionProps & {
	handleChangeFields: (fields: Array<Record<string, unknown>>) => void;
	disabled?: boolean;
	disableFormTitle?: boolean;
	type?: string | null;
	entity?: string | null;
};

const Form = ({
	handleChangeFields,
	form,
	disabled = false,
	type = null,
	entity = null,
	disableFormTitle = false,
}: FormProps) => (
	<Section
		disabled={disabled}
		group
		title="Form"
		summary={
			<p>
				Add one or more fields to your form to collect attributes about each node the participant creates. Use the drag
				handle on the left of each prompt adjust its order.
			</p>
		}
	>
		{!disableFormTitle && (
			<ValidatedField
				name="form.title"
				component={TextField}
				validation={{ required: true }}
				componentProps={{
					label: "Form heading text (e.g 'Add a person')",
					placeholder: "Enter your title here",
					className: "stage-editor-section-title",
				}}
			/>
		)}
		<EditableList
			label="Form Fields"
			editComponent={FieldFields}
			editProps={{
				type,
				entity,
			}}
			previewComponent={FieldPreview as React.ComponentType<Record<string, unknown>>}
			fieldName="form.fields"
			title="Edit Field"
			onChange={(value: unknown) => handleChangeFields(value as Array<Record<string, unknown>>)}
			normalize={(value: unknown) => normalizeField(value as Record<string, unknown>)}
			itemSelector={
				itemSelector(entity, type) as (
					state: Record<string, unknown>,
					params: { form: string; editField: string },
				) => unknown
			}
			form={form}
		/>
	</Section>
);

export default compose(
	withSubject,
	withFormHandlers,
	withDisabledFormTitle,
	withDisabledSubjectRequired,
)(Form) as unknown as React.ComponentType<StageEditorSectionProps>;
