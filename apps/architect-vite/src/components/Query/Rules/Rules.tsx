import cx from "classnames";
import { get } from "es-toolkit/compat";
import { compose } from "recompose";
import DetachedField from "~/components/DetachedField";
import FieldError from "~/components/Form/FieldError";
import RadioGroup from "~/components/Form/Fields/RadioGroup";
import Button from "~/lib/legacy-ui/components/Button";
import { cn } from "~/utils/cn";
import EditRule from "./EditRule";
import PreviewRules from "./PreviewRules";
import withDraftRule from "./withDraftRule";
import withRulesChangeHandlers from "./withRulesChangeHandlers";

type Rule = Record<string, unknown>;

type RulesProps = {
	type?: "filter" | "query";
	rules?: Rule[];
	join?: string;
	error?: string;
	meta?: Record<string, unknown>;
	codebook: Record<string, unknown>;
	draftRule?: Record<string, unknown>;
	handleChangeJoin: (value: string) => void;
	handleChangeDraft: (value: Record<string, unknown>) => void;
	handleCancelDraft: () => void;
	handleSaveDraft: () => void;
	handleClickRule: (rule: Rule) => void;
	handleDeleteRule: (index: number) => void;
	handleCreateAlterRule: () => void;
	handleCreateEdgeRule: () => void;
	handleCreateEgoRule: () => void;
};

const Rules = ({
	type = "filter",
	rules = [],
	join = null,
	error = null,
	meta = {},
	codebook,
	draftRule = {},
	handleChangeJoin,
	handleChangeDraft,
	handleCancelDraft,
	handleSaveDraft,
	handleClickRule,
	handleDeleteRule,
	handleCreateAlterRule,
	handleCreateEdgeRule,
	handleCreateEgoRule,
}: RulesProps) => {
	const isActive = get(meta, "active", false);
	// Default to true as may not be defined if used without redux-form
	const isTouched = get(meta, "touched", true);
	const hasError = isTouched && !!error;

	const classes = cx("rules-rules", {
		"rules-rules--is-active": isActive,
		"rules-rules--has-error": hasError,
	});

	return (
		<div className={classes}>
			<EditRule
				codebook={codebook}
				rule={draftRule}
				onChange={handleChangeDraft}
				onCancel={handleCancelDraft}
				onSave={handleSaveDraft}
			/>

			<div className={cn("rules-rules__preview", "text-foreground")}>
				<h4>Rules</h4>
				<PreviewRules
					rules={rules}
					join={join}
					onClickRule={handleClickRule}
					onDeleteRule={handleDeleteRule}
					codebook={codebook}
				/>
				<FieldError show={hasError} error={error} />
			</div>

			<div className="rules-rules__add-new">
				<Button type="button" color="sea-serpent" onClick={handleCreateAlterRule}>
					Add alter rule
				</Button>
				<Button type="button" color="paradise-pink" onClick={handleCreateEdgeRule}>
					Add edge rule
				</Button>
				{type === "query" && (
					<Button type="button" color="neon-carrot" onClick={handleCreateEgoRule}>
						Add ego rule
					</Button>
				)}
			</div>

			{rules.length > 1 && (
				<div className="rules-rules__join">
					<h4>Must match</h4>
					<DetachedField
						component={RadioGroup}
						options={[
							{ label: "All rules", value: "AND" },
							{ label: "Any rule", value: "OR" },
						]}
						value={join}
						onChange={handleChangeJoin}
					/>
				</div>
			)}
		</div>
	);
};

export { Rules };

export default compose(withDraftRule, withRulesChangeHandlers)(Rules);
