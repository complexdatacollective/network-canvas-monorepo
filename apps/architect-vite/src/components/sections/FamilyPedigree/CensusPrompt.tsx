import { Row, Section } from "~/components/EditorLayout";
import { Field as RichText } from "~/components/Form/Fields/RichText";
import ValidatedField from "~/components/Form/ValidatedField";
import IssueAnchor from "~/components/IssueAnchor";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";

const CensusPrompt = (_props: StageEditorSectionProps) => (
	<Section
		title="Census Prompt"
		summary={<p>Configure the prompt shown to participants during the family building phase.</p>}
	>
		<Row>
			<IssueAnchor fieldName="censusPrompt" description="Census Prompt" />
			<ValidatedField
				name="censusPrompt"
				component={RichText}
				componentProps={{ label: "Prompt for building the family tree" }}
				validation={{ required: true }}
			/>
		</Row>
	</Section>
);

export default CensusPrompt;
