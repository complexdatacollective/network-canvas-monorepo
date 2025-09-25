import Markdown from "~/components/Form/Fields/Markdown";

type IntroductionPanelProps = {
	introductionPanel?: {
		title: string;
		text: string;
	} | null;
};

const IntroductionPanel = ({ introductionPanel = null }: IntroductionPanelProps) => {
	if (!introductionPanel) {
		return null;
	}

	return (
		<div className="protocol-summary-stage__introduction-panel">
			<div className="protocol-summary-stage__introduction-panel-content">
				<h2 className="section-heading">Introduction Panel</h2>
				<h1>{introductionPanel.title}</h1>
				<Markdown label={introductionPanel.text} />
			</div>
		</div>
	);
};

export default IntroductionPanel;
