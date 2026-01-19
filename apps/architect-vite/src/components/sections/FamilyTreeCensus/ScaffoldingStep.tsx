import { Field, FormSection } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import { Toggle } from "~/components/Form/Fields";
import { Field as RichText } from "~/components/Form/Fields/RichText";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import { ValidatedField } from "../../Form";
import IssueAnchor from "../../IssueAnchor";

const ScaffoldingStep = (_props: StageEditorSectionProps) => (
	<Section
		title="Scaffolding Step"
		summary={<p>Configure the initial step where participants build the basic structure of their family tree.</p>}
	>
		<FormSection name="scaffoldingStep">
			<Row>
				<IssueAnchor fieldName="scaffoldingStep.text" description="Scaffolding Step Text" />
				<ValidatedField
					name="text"
					component={RichText}
					componentProps={{ label: "Participant instructions for building the family tree structure" }}
					validation={{ required: true }}
				/>
			</Row>
			<Row>
				<IssueAnchor fieldName="scaffoldingStep.showQuickStartModal" description="Show Quick Start Modal" />
				<h4>Quick Start Modal</h4>
				<Field
					name="showQuickStartModal"
					label="Show a quick start tutorial modal when the stage loads"
					component={Toggle}
				/>
			</Row>
		</FormSection>
	</Section>
);

export default ScaffoldingStep;
