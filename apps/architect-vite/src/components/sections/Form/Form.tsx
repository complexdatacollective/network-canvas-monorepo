import { compose } from "recompose";
import EditableList from "~/components/EditableList";
import { Section } from "~/components/EditorLayout";
import withDisabledFormTitle from "~/components/enhancers/withDisabledFormTitle";
import withDisabledSubjectRequired from "~/components/enhancers/withDisabledSubjectRequired";
import withSubject from "~/components/enhancers/withSubject";
import TextField from "~/components/Form/Fields/Text";
import ValidatedField from "~/components/Form/ValidatedField";
import FieldFields from "./FieldFields";
import FieldPreview from "./FieldPreview";
import { itemSelector, normalizeField } from "./helpers";
import withFormHandlers from "./withFormHandlers";

type FormProps = {
	handleChangeFields: (fields: Array<Record<string, unknown>>) => void;
	form: string;
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
				label="Form heading text (e.g 'Add a person')"
				component={TextField}
				placeholder="Enter your title here"
				className="stage-editor-section-title"
				validation={{ required: true }}
			/>
		)}
		<EditableList
			label="Form Fields"
			editComponent={FieldFields}
			editProps={{
				type,
				entity,
			}}
			previewComponent={FieldPreview}
			fieldName="form.fields"
			title="Edit Field"
			onChange={handleChangeFields}
			normalize={normalizeField}
			itemSelector={itemSelector(entity, type)}
			form={form}
		/>
	</Section>
);

export default compose(
	withSubject,
	withFormHandlers,
	withDisabledFormTitle,
	withDisabledSubjectRequired,
)(Form as React.ComponentType<unknown>);
