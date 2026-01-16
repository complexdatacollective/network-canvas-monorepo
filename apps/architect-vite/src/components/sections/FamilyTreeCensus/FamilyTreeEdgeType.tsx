import { get } from "es-toolkit/compat";
import { Row, Section } from "~/components/EditorLayout";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import { ValidatedField } from "../../Form";
import IssueAnchor from "../../IssueAnchor";
import EntitySelectField from "../fields/EntitySelectField/EntitySelectField";

const FamilyTreeEdgeType = (_props: StageEditorSectionProps) => (
	<Section
		title="Family Edge Type"
		summary={<p>Select the edge type that will represent family relationships between nodes.</p>}
	>
		<Row>
			<IssueAnchor fieldName="edgeType" description="Edge Type" />
			<ValidatedField
				name="edgeType"
				entityType="edge"
				component={EntitySelectField}
				parse={(value) => ({ type: value, entity: "edge" })}
				format={(value) => get(value, "type")}
				validation={{ required: true }}
			/>
		</Row>
	</Section>
);

export default FamilyTreeEdgeType;
