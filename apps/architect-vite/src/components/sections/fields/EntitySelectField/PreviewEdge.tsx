import cx from "classnames";
import { Icon } from "~/lib/legacy-ui/components";

type PreviewEdgeProps = {
	label: string;
	color: string;
	onClick?: (() => void) | null;
	selected?: boolean;
};

const PreviewEdge = ({ label, color, onClick = null, selected = false }: PreviewEdgeProps) => {
	const content = (
		<>
			<Icon name="links" color={color} />
			{label}
		</>
	);

	const commonClasses = cx(
		"preview-edge",
		{ "preview-edge--selected": selected },
		{ "preview-edge--clickable": onClick },
	);

	if (onClick && !selected) {
		return (
			<button
				type="button"
				className={commonClasses}
				style={{ "--edge-color": `var(--${color})` } as React.CSSProperties}
				onClick={onClick}
				aria-label={`Select edge ${label}`}
			>
				{content}
			</button>
		);
	}

	return (
		<div className={commonClasses} style={{ "--edge-color": `var(--${color})` } as React.CSSProperties}>
			{content}
		</div>
	);
};

export default PreviewEdge;
