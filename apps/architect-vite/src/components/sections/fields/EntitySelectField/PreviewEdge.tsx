import { Icon } from "~/lib/legacy-ui/components";
import { cx } from "~/utils/cva";

type PreviewEdgeProps = {
	label: string;
	color: string;
	onClick?: (() => void) | null;
	selected?: boolean;
	surface?: 1 | 2;
};

const PreviewEdge = ({ label, color, onClick = null, selected = false, surface = 1 }: PreviewEdgeProps) => {
	const content = (
		<>
			<Icon name="links" color={color} />
			{label}
		</>
	);

	const surfaceClasses =
		surface === 2 ? "bg-surface-2 text-surface-2-foreground" : "bg-surface-1 text-surface-1-foreground";

	const baseClasses =
		"relative m-(--space-sm) flex flex-row items-center rounded-full border-4 border-transparent px-(--space-md) py-(--space-sm) transition-[border-color] duration-(--animation-duration-standard) ease-(--animation-easing) [&_.icon]:mr-(--space-sm)";

	if (onClick && !selected) {
		return (
			<button
				type="button"
				className={cx(baseClasses, surfaceClasses, "clickable")}
				style={{ "--edge-color": `var(--${color})` } as React.CSSProperties}
				onClick={onClick}
				aria-label={`Select edge ${label}`}
			>
				{content}
			</button>
		);
	}

	return (
		<div
			className={cx(baseClasses, surfaceClasses, selected && "border-(--edge-color) pointer-events-none")}
			style={{ "--edge-color": `var(--${color})` } as React.CSSProperties}
		>
			{content}
		</div>
	);
};

export default PreviewEdge;
