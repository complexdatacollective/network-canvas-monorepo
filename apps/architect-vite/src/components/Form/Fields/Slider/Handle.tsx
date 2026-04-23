import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { sliderThumbVariants } from "~/styles/shared/controlVariants";
import { cva, cx } from "~/utils/cva";
import type { InputState } from "~/utils/getInputState";
import MarkdownLabel from "../MarkdownLabel";

type HandleProps = {
	domain: [number, number];
	handle: {
		id: string;
		value: number;
		percent: number;
	};
	isActive?: boolean;
	state?: InputState;
	isPristine?: boolean;
	showTooltips?: boolean;
	getHandleProps: (id: string, props?: Record<string, unknown>) => Record<string, unknown>;
	getLabelForValue: (value: number) => string | null;
};

const tooltipVariants = cva({
	base: cx(
		"pointer-events-none absolute bottom-1/2 -translate-y-[calc(var(--slider-touch-height)*0.75)]",
		"left-(--slider-thumb-position) -translate-x-[0.05rem]",
		"transition-opacity duration-200",
		"before:absolute before:bottom-0 before:content-['']",
		"before:h-[calc(var(--slider-touch-height)*0.5)] before:w-[calc(var(--slider-touch-height)*0.5)]",
		"before:origin-bottom-left before:-rotate-45 before:bg-surface-accent",
	),
	variants: {
		active: {
			true: "opacity-100",
			false: "opacity-0",
		},
	},
});

const tooltipLabelStyles = cx(
	"absolute -translate-x-1/2 -translate-y-[calc(0.2*var(--slider-touch-height))]",
	"bg-surface-accent text-surface-accent-contrast rounded",
	"flex items-center justify-center",
	"text-sm",
	"w-max max-w-[calc(var(--slider-align-margin)*1.75)]",
	"min-h-[var(--slider-touch-height)]",
	"px-[calc(var(--slider-touch-height)*0.5)] py-2",
);

// A transparent oversized hit area sits on top of the visible thumb so pointer
// drags are easier on touch devices. The visual thumb uses the shared variant.
const handleHitAreaStyles = cx(
	"absolute top-[calc(var(--slider-height)*0.5)] -translate-y-1/2 -translate-x-1/2 left-(--slider-thumb-position)",
	"z-50 h-[var(--slider-touch-height)] w-[var(--slider-touch-height)] cursor-pointer bg-transparent",
);

const Handle = ({
	domain: [min, max],
	handle: { id, value, percent },
	isActive = false,
	state = "normal",
	isPristine = false,
	showTooltips = false,
	getHandleProps,
	getLabelForValue,
}: HandleProps) => {
	const [mouseOver, setMouseOver] = useState(false);

	const handleMouseEnter = () => setMouseOver(true);
	const handleMouseLeave = () => setMouseOver(false);

	const isDisabled = state === "disabled" || state === "readOnly";
	const showTooltip = showTooltips && (mouseOver || isActive) && !isDisabled;
	const handleProps = getHandleProps(id, {
		onMouseEnter: handleMouseEnter,
		onMouseLeave: handleMouseLeave,
	});

	const label = getLabelForValue(value);
	const thumbPosition = { "--slider-thumb-position": `${percent}%` } as CSSProperties;
	const thumbState = isPristine && state === "normal" ? "pristine" : state;

	return (
		<>
			{showTooltips && (
				<div className={tooltipVariants({ active: showTooltip })} style={thumbPosition}>
					<MarkdownLabel inline label={label} className={tooltipLabelStyles} />
				</div>
			)}
			<div className={handleHitAreaStyles} style={thumbPosition} {...handleProps} />
			<motion.div
				role="slider"
				aria-label="Slider"
				aria-valuemin={min}
				aria-valuemax={max}
				aria-valuenow={value}
				className={cx(
					sliderThumbVariants({ state: thumbState, size: "xl" }),
					// Place above tooltip/track at the global UI layer
					"z-40 top-[calc(var(--slider-height)*0.5)]",
				)}
				style={thumbPosition}
				tabIndex={0}
				animate={isActive ? { scale: 1.2 } : { scale: 1 }}
				transition={{ duration: 0.15 }}
			/>
		</>
	);
};

export default Handle;
