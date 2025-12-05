import { compose, withHandlers, withState } from "recompose";
import { makeGetOptionsWithDefaults } from "./defaultRule";
import { templates } from "./options";

const VARIABLE_RULE = "ALTER/VARIABLE";
const TYPE_RULE = "ALTER/TYPE";

const entityRuleTypes = {
	VARIABLE_RULE,
	TYPE_RULE,
};

const entityRuleTypeOptions = (entityType: string) => [
	{
		label: `Attribute - rule based on the value of this ${entityType} type's attributes.`,
		value: VARIABLE_RULE,
	},
	{
		label: `Presence - based on the presence or absence of this ${entityType} type in the interview network.`,
		value: TYPE_RULE,
	},
];

type WithEntityRuleTypeProps = {
	rule: {
		options?: {
			attribute?: string;
			type?: string;
		};
	};
};

const withEntityRuleType = compose(
	withState<WithEntityRuleTypeProps, string | null, "entityRuleType", "setEntityRuleType">(
		"entityRuleType",
		"setEntityRuleType",
		// If an existing rule, we need to determine the type
		({ rule }: WithEntityRuleTypeProps) => {
			const options = rule?.options || {};
			const { attribute, type } = options;

			if (!type) {
				return null;
			}

			const entityRuleType = attribute ? VARIABLE_RULE : TYPE_RULE;

			return entityRuleType;
		},
	),
	withHandlers({
		handleChangeEntityRuleType:
			({
				setEntityRuleType,
				onChange,
				rule,
			}: {
				setEntityRuleType: (type: string) => void;
				onChange: (rule: Record<string, unknown>) => void;
				rule: Record<string, unknown>;
			}) =>
			(entityRuleType: string) => {
				setEntityRuleType(entityRuleType);

				const ruleTemplate = entityRuleType === TYPE_RULE ? templates.entityTypeRule : templates.entityVariableRule;

				// 'reset' rule options, but keep type
				const ruleOptions = (rule.options || {}) as Record<string, unknown>;
				const options = makeGetOptionsWithDefaults(
					undefined,
					ruleTemplate,
				)({
					type: ruleOptions.type,
				});

				onChange({
					...rule,
					options,
				});
			},
	}),
);

export { withEntityRuleType, entityRuleTypes, entityRuleTypeOptions };
