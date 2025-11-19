import { isArray, isNil, keys, pick } from "lodash";
import { withHandlers } from "recompose";
import { makeGetOptionsWithDefaults } from "./defaultRule";
import { operatorsWithOptionCount } from "./options";

const RULE_ORDER = ["type", "attribute", "operator", "value"];

const withRuleChangeHandlers = withHandlers({
	handleRuleChange: ({ onChange, rule, variableType }: { onChange: (rule: Record<string, unknown>) => void; rule: Record<string, unknown>; variableType: string }) => {
		const getOptionsWithDefaults = makeGetOptionsWithDefaults(keys((rule.options as Record<string, unknown>)), variableType);

		return (_event: unknown, value: unknown, _oldValue: unknown, name: string) => {
			const resetFromIndex = RULE_ORDER.indexOf(name) + 1;
			const keep = RULE_ORDER.slice(0, resetFromIndex);

			// merge in updated option, and discard following (dependent) properties
			const options = pick(
				{
					...(rule.options as Record<string, unknown>),
					[name]: value,
				},
				keep,
			);

			// ensure reset values have defaults
			const optionsWithDefaults = getOptionsWithDefaults(options);

			const operatorNeedsOptionCount =
				operatorsWithOptionCount.has(optionsWithDefaults.operator as string) && isArray(optionsWithDefaults.value);
			const countFriendlyValue = !isNil(optionsWithDefaults.value) ? optionsWithDefaults.value : "";

			onChange({
				...rule,
				options: {
					...optionsWithDefaults,
					value: operatorNeedsOptionCount ? "" : countFriendlyValue,
				},
			});
		};
	},
});

export default withRuleChangeHandlers;
