import React, { useContext } from "react";
import { Join } from "~/components/Query/Rules/PreviewText";
import Rule from "./Rule";
import SummaryContext from "./SummaryContext";

type FilterType = {
	join?: string;
	rules: Array<{
		type: string;
		options: Record<string, unknown>;
	}>;
} | null;

type RulesProps = {
	filter?: FilterType;
};

const Rules = ({ filter = null }: RulesProps) => {
	const { protocol } = useContext(SummaryContext);

	if (!filter) {
		return null;
	}

	const { join, rules } = filter;

	return (
		<div className="protocol-summary-rules">
			{rules.map(({ type, options }, n) => (
				<React.Fragment key={`rule-${type}-${n}`}>
					<div className="protocol-summary-rules__rule">
						<Rule type={type} options={options} codebook={protocol.codebook} />
					</div>
					{n !== rules.length - 1 && join && <Join value={join} />}
				</React.Fragment>
			))}
		</div>
	);
};


export default Rules;
