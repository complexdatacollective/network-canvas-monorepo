import { compose, withHandlers, withState } from "recompose";
import { getDefaultOptions } from "./defaultRule";
import { templates } from "./options";
import type { Rule, RuleOptions } from "./validateRule";

const generateRule = (type: string, options: RuleOptions = {}): Rule => ({
	type,
	options: { operator: undefined, ...options },
});

type OwnProps = {
	rules: Rule[];
};

type StateProps = {
	draftRule: Rule | null;
	setDraftRule: (rule: Rule | null) => void;
};

type FirstHandlerProps = StateProps & OwnProps;

type SecondHandlerProps = FirstHandlerProps & {
	resetDraft: () => void;
	startDraft: (ruleId: string) => void;
	createDraft: (type: string, options?: RuleOptions) => void;
};

const withDraftRule = compose<OwnProps, OwnProps>(
	withState("draftRule", "setDraftRule", null),
	withHandlers<FirstHandlerProps, {}>({
		resetDraft:
			({ setDraftRule }: FirstHandlerProps) =>
			() =>
				setDraftRule(null),
		startDraft:
			({ setDraftRule, rules }: FirstHandlerProps) =>
			(ruleId: string) => {
				const rule = rules.find(({ id }) => id === ruleId);
				setDraftRule(rule || null);
			},
		createDraft:
			({ setDraftRule }: FirstHandlerProps) =>
			(type: string, options?: RuleOptions) =>
				setDraftRule(generateRule(type, options)),
	}),
	withHandlers<SecondHandlerProps, {}>({
		handleCreateAlterRule:
			({ createDraft }: SecondHandlerProps) =>
			() =>
				createDraft("alter", getDefaultOptions(templates.alterTypeRule)),
		handleCreateEdgeRule:
			({ createDraft }: SecondHandlerProps) =>
			() =>
				createDraft("edge", getDefaultOptions(templates.edgeTypeRule)),
		handleCreateEgoRule:
			({ createDraft }: SecondHandlerProps) =>
			() =>
				createDraft("ego", getDefaultOptions(templates.egoRule)),
		handleClickRule:
			({ startDraft }: SecondHandlerProps) =>
			(ruleId: string) =>
				startDraft(ruleId),
		handleChangeDraft:
			({ setDraftRule }: SecondHandlerProps) =>
			(rule: Rule) =>
				setDraftRule(rule),
		handleCancelDraft:
			({ resetDraft }: SecondHandlerProps) =>
			() =>
				resetDraft(),
	}),
);

export default withDraftRule;
