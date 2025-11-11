import { Field, FormSection } from "redux-form";
import { Section } from "~/components/EditorLayout";
import * as Fields from "~/components/Form/Fields";
import IssueAnchor from "../IssueAnchor";

const NarrativeBehaviours = () => (
	<Section title="Narrative Behaviours">
		<FormSection name="behaviours">
			<IssueAnchor fieldName="freeDraw" description="Free draw" />
			<h4>Free-draw</h4>
			<Field name="freeDraw" label="Allow drawing on the canvas" component={Fields.Toggle} />

			<IssueAnchor fieldName="allowRepositioning" description="Allow repositioning" />
			<h4>Allow repositioning</h4>
			<Field name="allowRepositioning" label="Allow nodes to be repositioned" component={Fields.Toggle} />
		</FormSection>
	</Section>
);

export default NarrativeBehaviours;
