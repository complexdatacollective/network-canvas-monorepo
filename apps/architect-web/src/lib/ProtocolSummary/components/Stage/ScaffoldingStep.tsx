import Markdown from "~/components/Form/Fields/Markdown";
import MiniTable from "../MiniTable";

type ScaffoldingStepProps = {
	scaffoldingStep?: {
		text: string;
		showQuickStartModal: boolean;
	} | null;
};

const ScaffoldingStep = ({ scaffoldingStep = null }: ScaffoldingStepProps) => {
	if (!scaffoldingStep) {
		return null;
	}

	return (
		<>
			<h4>Scaffolding Step Instructions</h4>
			<Markdown label={scaffoldingStep.text} />
			<MiniTable rotated rows={[["Show Quick Start Modal", scaffoldingStep.showQuickStartModal ? "Yes" : "No"]]} />
		</>
	);
};

export default ScaffoldingStep;
