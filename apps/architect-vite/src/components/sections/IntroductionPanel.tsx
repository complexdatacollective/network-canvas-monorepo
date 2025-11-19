import { Row, Section } from "~/components/EditorLayout";
import { Field as RichText } from "~/components/Form/Fields/RichText";
import TextField from "~/components/Form/Fields/Text";
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
					component={TextField}
					componentProps={{ label: "Title", maxLength: "50" }}
					validation={{ required: true }}
				/>
			</Row>
			<Row>
				<IssueAnchor fieldName="introductionPanel.text" description="Text (Introduction panel)" />
				<ValidatedField
					name="introductionPanel.text"
					component={RichText}
					componentProps={{ label: "Introduction text" }}
					validation={{ required: true }}
				/>
			</Row>
		</Section>
	);
};

export default IntroductionPanel;
