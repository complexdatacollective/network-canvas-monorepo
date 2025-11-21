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

type Rule = Record<string, unknown> & {
	id?: string;
	type?: string;
	options?: Record<string, unknown>;
};

type RulesProps = {
	type?: "filter" | "query";
	rules?: Rule[];
	join?: string | null;
	error?: string | null;
	meta?: Record<string, unknown>;
	codebook: Record<string, unknown>;
	draftRule?: Rule | null;
	handleChangeJoin: (value: string) => void;
	handleChangeDraft: (value: Rule) => void;
	handleCancelDraft: () => void;
	handleSaveDraft: () => void;
	handleClickRule: (id: string) => void;
	handleDeleteRule: (id: string) => void;
	handleCreateAlterRule: () => void;
	handleCreateEdgeRule: () => void;
	handleCreateEgoRule: () => void;
	onChange?: (value: unknown) => void;
	openDialog?: (dialog: unknown) => void;
};

const Rules = ({
	type = "filter",
	rules = [],
	join = null,
	error = null,
	meta = {},
	codebook,
	draftRule = null,
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
	const isActive = get(meta, "active", false) as boolean;
	// Default to true as may not be defined if used without redux-form
	const isTouched = get(meta, "touched", true) as boolean;
	const hasError = isTouched && !!error;

	const classes = cx("rules-rules", {
		"rules-rules--is-active": isActive,
		"rules-rules--has-error": hasError,
	});

	return (
		<div className={classes}>
			<EditRule
				codebook={codebook}
				rule={draftRule || undefined}
				onChange={handleChangeDraft}
				onCancel={handleCancelDraft}
				onSave={handleSaveDraft}
			/>

			<div className={cn("rules-rules__preview", "text-foreground")}>
				<h4>Rules</h4>
				<PreviewRules
					rules={rules as Array<Record<string, unknown> & { id: string }>}
					join={join}
					onClickRule={handleClickRule}
					onDeleteRule={handleDeleteRule}
					codebook={codebook}
				/>
				<FieldError show={hasError} error={error || ""} />
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
						component={RadioGroup as React.ComponentType<Record<string, unknown>>}
						options={[
							{ label: "All rules", value: "AND" },
							{ label: "Any rule", value: "OR" },
						]}
						value={join}
						onChange={(_event, value) => handleChangeJoin(value as string)}
					/>
				</div>
			)}
		</div>
	);
};

export default compose<
	RulesProps,
	{
		rules?: Rule[];
		join?: string;
		onChange?: (value: unknown) => void;
		openDialog?: (dialog: unknown) => void;
		codebook?: Record<string, unknown>;
		type?: "filter" | "query";
		error?: string | null;
		meta?: Record<string, unknown>;
	}
>(
	withDraftRule,
	withRulesChangeHandlers,
)(Rules);
