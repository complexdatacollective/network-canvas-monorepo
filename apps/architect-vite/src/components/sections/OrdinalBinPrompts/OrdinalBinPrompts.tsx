import { compose } from "recompose";
import EditableList from "~/components/EditableList";
import withDisabledSubjectRequired from "~/components/enhancers/withDisabledSubjectRequired";
import withSubject from "~/components/enhancers/withSubject";
import { itemSelector } from "~/components/sections/CategoricalBinPrompts/helpers";
import withPromptChangeHandler from "~/components/sections/CategoricalBinPrompts/withPromptChangeHandler";
import { PromptPreview } from "~/components/sections/NameGeneratorPrompts";
import PromptFields from "./PromptFields";

const template = () => ({ color: "ord-color-seq-1" });

interface OrdinalBinPromptsProps {
	handleChangePrompt: (data: any) => void;
	entity?: string | null;
	type?: string | null;
	[key: string]: any;
}

const OrdinalBinPrompts = ({ handleChangePrompt, entity = null, type = null, ...props }: OrdinalBinPromptsProps) => (
	<EditableList
		sectionTitle="Prompts"
		sectionSummary={
			<p>
				Add one or more prompts below to frame the task for the user. You can reorder the prompts using the draggable
				handles on the left hand side.
			</p>
		}
		previewComponent={PromptPreview}
		editComponent={PromptFields}
		title="Edit Prompt"
		template={template}
		onChange={handleChangePrompt}
		itemSelector={itemSelector(entity, type)}
		entity={entity}
		type={type}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	/>
);


export { OrdinalBinPrompts };

export default compose(withSubject, withDisabledSubjectRequired, withPromptChangeHandler)(OrdinalBinPrompts);
