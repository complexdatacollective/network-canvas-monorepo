import { useState } from "react";
import { cx } from "~/utils/cva";
import MarkdownLabel from "../MarkdownLabel";

type HandleProps = {
	domain: [number, number];
	handle: {
		id: string;
		value: number;
		percent: number;
	};
	isActive?: boolean;
	isDisabled?: boolean;
	isNotSet?: boolean;
	showTooltips?: boolean;
	getHandleProps: (id: string, props?: Record<string, unknown>) => Record<string, unknown>;
	getLabelForValue: (value: number) => string | null;
};

const Handle = ({
	domain: [min, max],
	handle: { id, value, percent },
	isActive = false,
	isDisabled = false,
	isNotSet = false,
	showTooltips = false,
	getHandleProps,
	getLabelForValue,
}: HandleProps) => {
	const [mouseOver, setMouseOver] = useState(false);

	const handleMouseEnter = () => setMouseOver(true);
	const handleMouseLeave = () => setMouseOver(false);

	const showTooltip = showTooltips && (mouseOver || isActive) && !isDisabled;
	const handleProps = getHandleProps(id, {
		onMouseEnter: handleMouseEnter,
		onMouseLeave: handleMouseLeave,
	});

	const label = getLabelForValue(value);

	return (
		<>
			{showTooltips && (
				<div
					className={cx(
						"absolute bottom-1/2 text-surface-accent-foreground transition-opacity duration-(--animation-duration-fast) ease-(--animation-easing)",
						"translate-x-[-0.05rem] translate-y-[calc(var(--space-xl)*-0.75)]",
						"before:content-[''] before:absolute before:bottom-0 before:block before:h-(--space-md) before:w-(--space-md) before:origin-bottom-left before:-rotate-45 before:bg-surface-accent",
						showTooltip ? "opacity-100" : "opacity-0",
					)}
					style={{ left: `${percent}%` }}
				>
					<MarkdownLabel
						inline
						label={label}
						className="flex items-center justify-center w-max min-h-(--space-xl) max-w-(--space-6xl) bg-surface-accent rounded-(--radius) py-(--space-sm) px-(--space-md) text-xs -translate-x-1/2 translate-y-[calc(var(--space-xl)*-0.2)]"
					/>
				</div>
			)}
			<div
				className="absolute top-(--space-xl) z-(--z-global-ui) size-(--space-xl) cursor-pointer -translate-x-1/2 -translate-y-1/2"
				style={{ left: `${percent}%` }}
				{...handleProps}
			/>
			<div
				role="slider"
				aria-label="Slider"
				aria-valuemin={min}
				aria-valuemax={max}
				aria-valuenow={value}
				className={cx(
					"absolute top-(--space-xl) z-(--z-default) size-(--space-xl) rounded-full border-0 -translate-x-1/2 -translate-y-1/2",
					"transition-[transform,opacity,filter] duration-(--animation-duration-fast)",
					isDisabled ? "bg-charcoal" : "bg-active",
					isActive && "scale-[1.2]",
					isNotSet && !isActive && "opacity-80 saturate-0",
				)}
				style={{ left: `${percent}%` }}
				tabIndex={0}
			/>
		</>
	);
};

export default Handle;
