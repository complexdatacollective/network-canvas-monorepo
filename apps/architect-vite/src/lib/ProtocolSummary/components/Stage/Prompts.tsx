/* eslint-disable react/jsx-props-no-spreading */

import Prompt from "./Prompt";

export type PromptType = {
	id?: string;
	text: string;
	[key: string]: unknown;
};

type PromptsProps = {
	prompts?: PromptType[] | null;
};

const Prompts = ({ prompts = null }: PromptsProps) => {
	if (!prompts) {
		return null;
	}

	return (
		<div className="protocol-summary-stage__prompts">
			<div className="protocol-summary-stage__prompts-content">
				<h2 className="section-heading">Prompts</h2>
				<ol>
					{prompts.map((prompt) => (
						<li key={prompt.id}>
							<Prompt {...prompt} />
						</li>
					))}
				</ol>
			</div>
		</div>
	);
};

export default Prompts;
