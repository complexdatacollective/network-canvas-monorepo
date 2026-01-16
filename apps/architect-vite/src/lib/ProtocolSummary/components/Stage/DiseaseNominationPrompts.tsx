import Markdown from "~/components/Form/Fields/Markdown";
import MiniTable from "../MiniTable";
import Variable from "../Variable";

type DiseasePrompt = {
	id: string;
	text: string;
	variable: string;
};

type DiseaseNominationPromptsProps = {
	diseaseNominationStep?: DiseasePrompt[] | null;
};

const DiseaseNominationPrompts = ({ diseaseNominationStep = null }: DiseaseNominationPromptsProps) => {
	if (!diseaseNominationStep || diseaseNominationStep.length === 0) {
		return null;
	}

	return (
		<div className="protocol-summary-stage__prompts">
			<div className="protocol-summary-stage__prompts-content">
				<h2 className="section-heading">Disease Nomination Prompts</h2>
				<ol>
					{diseaseNominationStep.map((prompt) => (
						<li key={prompt.id}>
							<div className="protocol-summary-stage__prompts-item">
								<Markdown label={prompt.text} />
								<MiniTable rotated rows={[["Variable", <Variable key={prompt.variable} id={prompt.variable} />]]} />
							</div>
						</li>
					))}
				</ol>
			</div>
		</div>
	);
};

export default DiseaseNominationPrompts;
