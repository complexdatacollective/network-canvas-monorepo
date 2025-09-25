import { Row, Section } from "~/components/EditorLayout";
import { Field as RichText } from "~/components/Form/Fields/RichText";
import ValidatedField from "~/components/Form/ValidatedField";
import { getFieldId } from "~/utils/issues";

type PromptTextProps = {
	name?: string;
};

const PromptText = ({ name = "text" }: PromptTextProps) => {
	console.log("PromptText name:", name, getFieldId(name));
	return (
		<Section
			id={getFieldId(name)}
			title="Prompt Text"
			summary={
				<p>
					The prompt text instructs your participant about the task on this stage. Enter the text to use for your prompt
					below.
				</p>
			}
		>
			<Row>
				<ValidatedField
					name={name}
					component={RichText}
					inline
					className="stage-editor-section-prompt__textarea"
					label=""
					placeholder="Enter text for the prompt here..."
					validation={{ required: true, maxLength: 220 }}
				/>
			</Row>
		</Section>
	);
};

export default PromptText;
