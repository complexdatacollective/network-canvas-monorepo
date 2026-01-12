import { compose } from "recompose";
import EditableList from "~/components/EditableList";
import { Row, Section } from "~/components/EditorLayout";
import { Field as RichText } from "~/components/Form/Fields/RichText";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import { ValidatedField } from "../../Form";
import IssueAnchor from "../../IssueAnchor";
import FieldFields from "../Form/FieldFields";
import FieldPreview from "../Form/FieldPreview";
import { itemSelector, normalizeField } from "../Form/helpers";

type NameGenerationStepProps = StageEditorSectionProps & {
	type?: string | null;
	entity?: string | null;
	disabled?: boolean;
};

const NameGenerationStep = ({ form, type, entity, disabled }: NameGenerationStepProps) => (
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
				componentProps={{ label: "Instructions for adding family member details" }}
				validation={{ required: true }}
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
			<EditableList
				editComponent={FieldFields}
				editProps={{ type, entity }}
				previewComponent={FieldPreview}
				fieldName="nameGenerationStep.form.fields"
				title="Edit Field"
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
	withDisabledSubjectRequired,
)(NameGenerationStep);
