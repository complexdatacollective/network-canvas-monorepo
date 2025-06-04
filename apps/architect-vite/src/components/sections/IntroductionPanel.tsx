import { Field as RichText } from "@codaco/legacy-ui/components/Fields/RichText";
import TextField from "@codaco/legacy-ui/components/Fields/Text";
import { Row, Section } from "~/components/EditorLayout";
import { ValidatedField } from "../Form";
import IssueAnchor from "../IssueAnchor";

type IntroductionPanelProps = {
	interfaceType: string;
};

const IntroductionPanel = ({ interfaceType }: IntroductionPanelProps) => {
	const summaryText =
		interfaceType === "Geospatial"
			? "This panel is shown prior to the interface, and should serve as an introduction to the task."
			: "This panel is shown prior to completion of the forms, and should serve as an introduction to the task.";

	return (
		<Section title="Introduction Panel" summary={<p>{summaryText}</p>}>
			<Row>
				<IssueAnchor fieldName="introductionPanel.title" description="Title (Introduction panel)" />
				<ValidatedField
					name="introductionPanel.title"
					label="Title"
					component={TextField}
					maxLength="50"
					validation={{ required: true }}
				/>
			</Row>
			<Row>
				<IssueAnchor fieldName="introductionPanel.text" description="Text (Introduction panel)" />
				<ValidatedField
					name="introductionPanel.text"
					label="Introduction text"
					component={RichText}
					validation={{ required: true }}
				/>
			</Row>
		</Section>
	);
};

export default IntroductionPanel;