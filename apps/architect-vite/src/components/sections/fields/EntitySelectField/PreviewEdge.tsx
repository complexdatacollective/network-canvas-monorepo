import { Icon } from "~/lib/legacy-ui/components";
import { cx } from "~/utils/cva";

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
		// The rounded radius is "arbitrarily large" per the legacy intent — a pill shape
		"bg-surface-1 relative m-[var(--space-sm)] flex flex-row items-center rounded-[12rem] border-4 border-transparent px-[var(--space-md)] py-[var(--space-sm)] transition-colors duration-200",
		"[&_.icon]:mr-[var(--space-sm)]",
		selected && "pointer-events-none border-(--edge-color)",
		onClick && "clickable",
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
