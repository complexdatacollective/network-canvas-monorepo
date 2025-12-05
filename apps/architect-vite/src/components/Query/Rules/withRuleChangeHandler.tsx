import { isArray, isNil, keys, pick } from "lodash";
import { withHandlers } from "recompose";
import { makeGetOptionsWithDefaults } from "./defaultRule";
import { operatorsWithOptionCount } from "./options";

const RULE_ORDER = ["type", "attribute", "operator", "value"];

type WithRuleChangeHandlerProps = {
	onChange: (rule: Record<string, unknown>) => void;
	rule: Record<string, unknown>;
	variableType?: string;
};

const withRuleChangeHandlers = withHandlers<WithRuleChangeHandlerProps, object>({
	handleRuleChange:
		({ onChange, rule, variableType }: WithRuleChangeHandlerProps) =>
		(_event: unknown, value: unknown, _oldValue: unknown, name: string | null) => {
			const ruleOptions = (rule.options || {}) as Record<string, unknown>;
			const getOptionsWithDefaults = makeGetOptionsWithDefaults(variableType, keys(ruleOptions));

			const resetFromIndex = RULE_ORDER.indexOf(name || "") + 1;
			const keep = RULE_ORDER.slice(0, resetFromIndex);

			// merge in updated option, and discard following (dependent) properties
			const options = pick(
				{
					...ruleOptions,
					...(name ? { [name]: value } : {}),
				},
				keep,
			);

			// ensure reset values have defaults
			const optionsWithDefaults = getOptionsWithDefaults(options);

			const operatorNeedsOptionCount =
				typeof optionsWithDefaults.operator === "string" &&
				operatorsWithOptionCount.has(optionsWithDefaults.operator) &&
				isArray(optionsWithDefaults.value);
			const countFriendlyValue = !isNil(optionsWithDefaults.value) ? optionsWithDefaults.value : "";

			onChange({
				...rule,
				options: {
					...optionsWithDefaults,
					value: operatorNeedsOptionCount ? "" : countFriendlyValue,
				},
			});
		},
});

export default withRuleChangeHandlers;
