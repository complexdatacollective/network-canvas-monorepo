import { Section } from "~/components/EditorLayout";
import { Text } from "~/components/Form/Fields";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import { ValidatedField } from "../Form";
import IssueAnchor from "../IssueAnchor";

const Title = (_props: StageEditorSectionProps) => (
	<Section
		title="Page Heading"
		summary={<p>Use the page heading to show a large title element on your information stage.</p>}
	>
		<IssueAnchor fieldName="title" description="Page Heading" />
		<ValidatedField
			name="title"
			component={Text}
			placeholder="Enter your title here..."
			className="stage-editor-section-title"
			validation={{ required: true }}
		/>
	</Section>
);

export default Title;
