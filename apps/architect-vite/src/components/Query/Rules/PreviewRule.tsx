import { compose, withHandlers } from "recompose";
import { Icon } from "~/lib/legacy-ui/components";
import RuleText, { Join } from "./PreviewText";
import withDisplayOptions from "./withDisplayOptions";

const withDeleteHandler = withHandlers({
	handleDelete: (props: { onDelete: () => void }) => (e: React.MouseEvent) => {
		e.stopPropagation();

		props.onDelete();
	},
});

type PreviewRuleProps = {
	type: string;
	options: Record<string, unknown>;
	join?: string | null;
	onClick: () => void;
	handleDelete: () => void;
	onDelete?: () => void;
	codebook?: Record<string, unknown>;
};

const PreviewRule = ({ type, options, join = null, onClick, handleDelete }: PreviewRuleProps) => {
	return (
		<>
			<button type="button" className="rules-preview-rule" onClick={onClick} aria-label="Edit rule">
				<div className="rules-preview-rule__text">
					<RuleText type={type} options={options} />
				</div>
				<button type="button" className="rules-preview-rule__delete" onClick={handleDelete}>
					<Icon name="delete" />
				</button>
			</button>
			{join && <Join value={join} />}
		</>
	);
};

export default compose<PreviewRuleProps, Partial<PreviewRuleProps>>(withDeleteHandler, withDisplayOptions)(PreviewRule);
