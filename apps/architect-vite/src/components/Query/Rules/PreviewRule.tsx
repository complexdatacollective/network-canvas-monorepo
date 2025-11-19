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
	join?: string;
	onClick: () => void;
	handleDelete: () => void;
};

const PreviewRule = ({ type, options, join = null, onClick, handleDelete }: PreviewRuleProps) => {
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClick();
		}
	};

	return (
		<>
			<div
				className="rules-preview-rule"
				onClick={onClick}
				onKeyDown={handleKeyDown}
				role="button"
				tabIndex={0}
				aria-label="Edit rule"
			>
				<div className="rules-preview-rule__text">
					<RuleText type={type} options={options} />
				</div>
				<button type="button" className="rules-preview-rule__delete" onClick={handleDelete}>
					<Icon name="delete" />
				</button>
			</div>
			{join && <Join value={join} />}
		</>
	);
};

export default compose(withDeleteHandler, withDisplayOptions)(PreviewRule);
