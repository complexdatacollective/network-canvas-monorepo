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
		<div className="protocol-summary-stage__scaffolding-step">
			<div className="protocol-summary-stage__scaffolding-step-content">
				<h4>Scaffolding Step Instructions</h4>
				<Markdown label={scaffoldingStep.text} />
				<MiniTable rotated rows={[["Show Quick Start Modal", scaffoldingStep.showQuickStartModal ? "Yes" : "No"]]} />
			</div>
		</div>
	);
};

export default ScaffoldingStep;
