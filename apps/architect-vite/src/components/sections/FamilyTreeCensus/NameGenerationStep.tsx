import { compose } from "recompose";
import EditableList from "~/components/EditableList";
import { Row, Section } from "~/components/EditorLayout";
import { Field as RichText } from "~/components/Form/Fields/RichText";
import TextField from "~/components/Form/Fields/Text";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import Tip from "~/components/Tip";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import { ValidatedField } from "../../Form";
import IssueAnchor from "../../IssueAnchor";
import FieldFields from "../Form/FieldFields";
import FieldPreview from "../Form/FieldPreview";
import { itemSelector, normalizeField } from "../Form/helpers";
import withFormHandlers from "../Form/withFormHandlers";

type NameGenerationStepProps = StageEditorSectionProps & {
	type?: string | null;
	entity?: string | null;
	disabled?: boolean;
	handleChangeFields: (fields: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const NameGenerationStep = ({ form, type, entity, disabled, handleChangeFields }: NameGenerationStepProps) => (
	<Section
		disabled={disabled}
		title="Name Generation Step"
		summary={<p>Configure the step where participants add names and details for each family member.</p>}
	>
		<Row>
			<IssueAnchor fieldName="nameGenerationStep.text" description="Name Generation Step Text" />
			<ValidatedField
				name="nameGenerationStep.text"
				component={RichText}
				componentProps={{ label: "Participant instructions for adding family member details" }}
				validation={{ required: true }}
			/>
		</Row>
		<Row>
			<IssueAnchor fieldName="nameGenerationStep.form.title" description="Form Title" />
			<ValidatedField
				name="nameGenerationStep.form.title"
				component={TextField}
				validation={{ required: true }}
				componentProps={{
					label: "Form heading text (e.g. 'Add personal information')",
					placeholder: "Enter your form title here",
				}}
			/>
		</Row>
		<Section
			title="Form Fields"
			summary={
				<p>
					Add fields to collect information about each family member. These fields will be shown when participants add
					or edit family members.
				</p>
			}
			layout="vertical"
		>
			<Tip>
				Add a variable called &quot;name&quot; here, unless you have a good reason not to. Interviewer will then
				automatically use this variable as the label for the node in the interview.
			</Tip>
			<EditableList
				editComponent={FieldFields}
				editProps={{ type, entity }}
				previewComponent={FieldPreview}
				fieldName="nameGenerationStep.form.fields"
				title="Edit Field"
				onChange={(value: unknown) => handleChangeFields(value as Record<string, unknown>)}
				normalize={(value: unknown) => normalizeField(value as Record<string, unknown>)}
				itemSelector={
					itemSelector(entity ?? null, type ?? null) as (
						state: Record<string, unknown>,
						params: { form: string; editField: string },
					) => unknown
				}
				form={form}
			/>
		</Section>
	</Section>
);

export default compose<NameGenerationStepProps, StageEditorSectionProps>(
	withSubject,
	withFormHandlers,
	withDisabledSubjectRequired,
)(NameGenerationStep);
