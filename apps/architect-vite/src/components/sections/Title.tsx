import { Section } from "~/components/EditorLayout";
import * as Fields from "~/components/Form/Fields";
import { ValidatedField } from "../Form";
import IssueAnchor from "../IssueAnchor";

const Title = () => (
	<Section
		title="Page Heading"
		summary={<p>Use the page heading to show a large title element on your information stage.</p>}
	>
		<IssueAnchor fieldName="title" description="Page Heading" />
		<ValidatedField
			name="title"
			component={Fields.Text}
			placeholder="Enter your title here..."
			className="stage-editor-section-title"
			validation={{ required: true }}
		/>
	</Section>
);

export default Title;
