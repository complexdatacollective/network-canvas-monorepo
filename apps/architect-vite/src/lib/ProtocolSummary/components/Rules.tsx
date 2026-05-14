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
		<div>
			{rules.map(({ type, options }, index) => {
				const key = `rule-${type}-${JSON.stringify(options)}`;
				return (
					<React.Fragment key={key}>
						<div className="flex w-full grow items-center not-last:mb-(--space-sm)">
							<Rule type={type} options={options} codebook={protocol.codebook} />
						</div>
						{index !== rules.length - 1 && join && <Join value={join} />}
					</React.Fragment>
				);
			})}
		</div>
	);
};

export default Rules;
