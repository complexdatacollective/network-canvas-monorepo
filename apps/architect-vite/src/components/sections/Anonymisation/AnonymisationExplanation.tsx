import { Row, Section } from "~/components/EditorLayout";
import { RichText, Text } from "~/components/Form/Fields";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import { ValidatedField } from "../../Form";
import IssueAnchor from "../../IssueAnchor";

const AnonymisationExplanation = (_props: StageEditorSectionProps) => (
	<Section
		title="Task Explanation"
		summary={<p>Use this section to explain the anonymisation process to your participants.</p>}
	>
		<Row>
			<IssueAnchor fieldName="explanationText.title" description="Title (Anonymisation explanation panel)" />
			<ValidatedField
				label="Title"
				name="explanationText.title"
				component={Text}
				placeholder="This interview uses enhanced privacy protection"
				validation={{ required: true }}
				maxLength="50"
			/>
		</Row>
		<Row>
			<IssueAnchor fieldName="explanationText.body" description="Body (Anonymisation explanation panel)" />
			<ValidatedField
				label="Body"
				name="explanationText.body"
				component={RichText}
				placeholder="Enter your passphrase below, and click the 'continue' button."
				validation={{ required: true }}
			/>
		</Row>
	</Section>
);

export default AnonymisationExplanation;
