import PreviewRule from "./PreviewRule";

type Rule = Record<string, unknown> & {
	id: string;
};

type PreviewRulesProps = {
	join?: string;
	rules: Rule[];
	codebook: Record<string, unknown>;
	onClickRule: (id: string) => void;
	onDeleteRule: (id: string) => void;
};

const PreviewRules = ({ join = null, rules, codebook, onClickRule, onDeleteRule }: PreviewRulesProps) => {
	const getJoin = (index: number) => (rules.length !== 1 && index < rules.length - 1 ? join : null);

	return (
		<div className="rules-preview-rules">
			{rules.length === 0 && <div className="rules-preview-rules__empty">Add rule types from the options below.</div>}
			{rules.length > 0 && (
				<div className="rules-preview-rules__rules">
					{rules.map((rule, index) => (
						<div className="rules-preview-rules__rule" key={rule.id}>
							<PreviewRule
								// eslint-disable-next-line react/jsx-props-no-spreading
								{...rule}
								join={getJoin(index)}
								codebook={codebook}
								onClick={() => onClickRule(rule.id)}
								onDelete={() => onDeleteRule(rule.id)}
							/>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export default PreviewRules;
