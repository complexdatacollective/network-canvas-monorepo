import { compose, withHandlers } from "recompose";
import { v4 as uuid } from "uuid";
import validateRule, { type Rule } from "./validateRule";

type FilterValue = {
	join?: string;
	rules: Rule[];
};

type OwnProps = {
	rules: Rule[];
	join?: string;
	onChange: (value: FilterValue) => void;
	openDialog: (dialog: {
		type: string;
		title: string;
		message?: string;
		canCancel?: boolean;
		onConfirm?: () => void;
	}) => void;
};

type FirstHandlerProps = OwnProps & {
	updateJoin: (join: string) => void;
	updateRule: (rule: Rule) => void;
	deleteRule: (ruleId: string) => void;
};

type SecondHandlerProps = FirstHandlerProps & {
	draftRule: Rule | null;
	resetDraft: () => void;
};

const withRulesChangeHandlers = compose(
	withHandlers<OwnProps, object>({
		updateJoin: (props: OwnProps) => (join: string) =>
			props.onChange({
				join,
				rules: props.rules,
			}),
		updateRule:
			({ rules, join, onChange }: OwnProps) =>
			(rule: Rule) => {
				let updatedRules: Rule[] = [];

				if (!rule.id) {
					updatedRules = [...rules, { ...rule, id: uuid() }];
				} else {
					updatedRules = rules.map((existingRule) => {
						if (existingRule.id === rule.id) {
							return rule;
						}
						return existingRule;
					});
				}

				onChange({
					join,
					rules: updatedRules,
				});
			},
		deleteRule:
			({ join, rules, onChange }: OwnProps) =>
			(ruleId: string) => {
				const updateRules = rules.filter((rule) => rule.id !== ruleId);

				if (updateRules.length < 2) {
					onChange({
						rules: updateRules,
					});

					return;
				}

				onChange({
					join,
					rules: updateRules,
				});
			},
	}),
	withHandlers<SecondHandlerProps, object>({
		handleChangeJoin:
			({ updateJoin }: SecondHandlerProps) =>
			(join: string) =>
				updateJoin(join),
		handleSaveDraft: (props: SecondHandlerProps) => () => {
			const { draftRule, openDialog, updateRule, resetDraft } = props;

			if (!validateRule(draftRule)) {
				openDialog({
					type: "Warning",
					title: "Please complete all fields",
					message:
						"To create your rule, all fields are required. Please complete all fields before clicking save, or use cancel to abandon this rule.",
					canCancel: false,
				});
				return;
			}

			if (draftRule) {
				updateRule(draftRule);
			}
			resetDraft();
		},
		handleDeleteRule:
			({ openDialog, deleteRule }: SecondHandlerProps) =>
			(ruleId: string) =>
				openDialog({
					type: "Confirm",
					title: "Are you sure you want to delete this rule?",
					onConfirm: () => deleteRule(ruleId),
				}),
	}),
);

export default withRulesChangeHandlers;
