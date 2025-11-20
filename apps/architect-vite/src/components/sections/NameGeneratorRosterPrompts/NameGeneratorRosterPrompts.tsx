import { compose } from "recompose";
import { Section } from "~/components/EditorLayout";
import EditableList from "../../EditableList";
import withDisabledAssetRequired from "../../enhancers/withDisabledAssetRequired";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withMapFormToProps from "../../enhancers/withMapFormToProps";
import withSubject from "../../enhancers/withSubject";
import { PromptPreview } from "../NameGeneratorPrompts";
import PromptFields from "../NameGeneratorPrompts/PromptFields";

type NameGeneratorRosterPromptsProps = {
	form: string;
	entity?: string;
	type?: string;
	disabled?: boolean;
	dataSource?: string;
};

const NameGeneratorRosterPrompts = ({ form, entity, type, disabled, dataSource }: NameGeneratorRosterPromptsProps) => (
	<Section
		disabled={disabled}
		summary={
			<p>
				Add one or more prompts below to frame the task for the user. You can reorder the prompts using the draggable
				handles on the left hand side.
			</p>
		}
		title="Prompts"
	>
		<EditableList
			editComponent={PromptFields}
			previewComponent={PromptPreview}
			title="Edit Prompt"
			form={form}
			editProps={{ entity, type, dataSource }}
		/>
	</Section>
);

export { NameGeneratorRosterPrompts };

export default compose(
	withSubject,
	withMapFormToProps("dataSource"),
	withDisabledSubjectRequired,
	withDisabledAssetRequired,
)(NameGeneratorRosterPrompts as React.ComponentType<unknown>);
