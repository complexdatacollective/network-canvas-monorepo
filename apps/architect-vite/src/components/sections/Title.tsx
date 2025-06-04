import * as Fields from "@codaco/legacy-ui/components/Fields";
import { Section } from "~/components/EditorLayout";
import { getFieldId } from "../../utils/issues";
import { ValidatedField } from "../Form";

const Title = () => (
	<Section
		title="Page Heading"
		summary={<p>Use the page heading to show a large title element on your information stage.</p>}
	>
		<div id={getFieldId("title")} data-name="Page Heading" />
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