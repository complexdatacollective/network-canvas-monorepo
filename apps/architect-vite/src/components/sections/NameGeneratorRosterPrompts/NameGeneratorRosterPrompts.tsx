import { compose } from "recompose";
import EditableList from "../../EditableList";
import withSubject from "../../enhancers/withSubject";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withDisabledAssetRequired from "../../enhancers/withDisabledAssetRequired";
import { PromptPreview } from "../NameGeneratorPrompts";
import PromptFields from "../NameGeneratorPrompts/PromptFields";
import withMapFormToProps from "../../enhancers/withMapFormToProps";

type NameGeneratorRosterPromptsProps = {
	form: string;
	entity?: string;
	type?: string;
	disabled?: boolean;
	dataSource?: string;
};

const NameGeneratorRosterPrompts = ({ form, entity, type, disabled, dataSource }: NameGeneratorRosterPromptsProps) => (
	<EditableList
		sectionTitle="Prompts"
		editComponent={PromptFields}
		previewComponent={PromptPreview}
		title="Edit Prompt"
		sectionSummary={
			<p>
				Add one or more prompts below to frame the task for the user. You can reorder the prompts using the draggable
				handles on the left hand side.
			</p>
		}
		form={form}
		disabled={disabled}
		editProps={{ entity, type, dataSource }}
	/>
);

export { NameGeneratorRosterPrompts };

export default compose(
	withSubject,
	withMapFormToProps("dataSource"),
	withDisabledSubjectRequired,
	withDisabledAssetRequired,
)(NameGeneratorRosterPrompts);
