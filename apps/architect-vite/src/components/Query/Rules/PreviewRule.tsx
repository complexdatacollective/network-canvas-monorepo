import { compose, withHandlers } from "react-recompose";
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
			<button
				type="button"
				className="group mx-auto flex min-h-(--space-3xl) w-[95%] cursor-pointer items-center rounded-(--radius) px-(--space-md) py-(--space-sm) hover:bg-surface-accent"
				onClick={onClick}
				aria-label="Edit rule"
			>
				<div className="flex w-full flex-1 items-center text-surface-1-foreground group-hover:text-primary-foreground [&>*]:mx-(--space-sm) [&>*]:max-w-[24rem] [&_.variable-pill]:[zoom:0.8]">
					<RuleText type={type} options={options} />
				</div>
				<button
					type="button"
					className="ml-(--space-sm) flex size-(--space-lg) shrink-0 grow-0 cursor-pointer items-center justify-center overflow-hidden rounded-(--space-lg) border-0 bg-error opacity-0 transition-opacity duration-(--animation-duration-fast) ease-(--animation-easing) group-hover:opacity-100 [&_.icon]:size-(--space-md) [&_.icon_.cls-1]:fill-error-foreground [&_.icon_.cls-2]:fill-error-foreground"
					onClick={handleDelete}
				>
					<Icon name="delete" />
				</button>
			</button>
			{join && <Join value={join} />}
		</>
	);
};

export default compose<PreviewRuleProps, Partial<PreviewRuleProps>>(withDeleteHandler, withDisplayOptions)(PreviewRule);
