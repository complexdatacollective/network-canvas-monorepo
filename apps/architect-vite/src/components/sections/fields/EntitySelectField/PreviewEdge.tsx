import { Icon } from "~/lib/legacy-ui/components";
import { cx } from "~/utils/cva";

type PreviewEdgeProps = {
	label: string;
	color: string;
	onClick?: (() => void) | null;
	selected?: boolean;
};

// `preview-edge` marker is preserved as a styling hook for the unmigrated
// `src/styles/components/rules/preview-rule.css` cascade (overrides background
// to surface-2 when nested under .rules-preview-rule__text). Drop the marker
// when the rules area migrates.
const PreviewEdge = ({ label, color, onClick = null, selected = false }: PreviewEdgeProps) => {
	const content = (
		<>
			<Icon name="links" color={color} />
			{label}
		</>
	);

	const baseClasses =
		"preview-edge relative m-(--space-sm) flex flex-row items-center rounded-full border-4 border-transparent bg-surface-1 px-(--space-md) py-(--space-sm) text-surface-1-foreground transition-[border-color] duration-(--animation-duration-standard) ease-(--animation-easing) [&_.icon]:mr-(--space-sm)";

	if (onClick && !selected) {
		return (
			<button
				type="button"
				className={cx(baseClasses, "clickable")}
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
			className={cx(baseClasses, selected && "border-(--edge-color) pointer-events-none")}
			style={{ "--edge-color": `var(--${color})` } as React.CSSProperties}
		>
			{content}
		</div>
	);
};

export default PreviewEdge;
