import type { NodeShape } from "~/components/Node/Node";
import Node from "~/components/Node/Node";
import { cx } from "~/utils/cva";

const SHAPES: Array<{ value: NodeShape; label: string }> = [
	{ value: "circle", label: "Circle" },
	{ value: "square", label: "Square" },
	{ value: "diamond", label: "Diamond" },
];

type ShapePickerProps = {
	input: {
		value: string;
		onChange: (value: string) => void;
	};
	meta: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	small?: boolean;
	nodeColor?: string;
};

const ShapePicker = ({
	input,
	meta: { error, invalid, touched },
	small,
	nodeColor = "node-color-seq-1",
}: ShapePickerProps) => {
	const nodeSize = small ? "xxs" : "xs";
	const showError = invalid && touched && error;

	return (
		<div className="block w-full">
			<div className="flex flex-wrap gap-[var(--space-sm)]">
				{SHAPES.map(({ value, label }) => (
					<button
						key={value}
						type="button"
						className={cx(
							"bg-surface-1 flex cursor-pointer flex-col items-center gap-[var(--space-xs)] rounded border-2 border-transparent p-[var(--space-sm)] transition-colors duration-200",
							input.value === value && "border-neon-coral",
						)}
						onClick={() => input.onChange(value)}
						aria-label={`Select shape ${label}`}
						aria-pressed={input.value === value}
					>
						<Node label="" shape={value} color={nodeColor} size={nodeSize} />
						{!small && <span className="text-text text-sm">{label}</span>}
					</button>
				))}
			</div>
			{showError && (
				<p className="bg-destructive text-destructive-contrast mt-[var(--space-sm)] rounded-sm px-[var(--space-xs)] py-[var(--space-xs)] text-sm">
					{error}
				</p>
			)}
		</div>
	);
};

export default ShapePicker;
