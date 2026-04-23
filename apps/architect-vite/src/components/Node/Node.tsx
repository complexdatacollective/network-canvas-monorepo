import { Loader2 } from "lucide-react";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { type ButtonHTMLAttributes, type CSSProperties, forwardRef, useEffect } from "react";
import { useNodeInteractions } from "~/hooks/useNodeInteractions";
import usePrevious from "~/hooks/usePrevious";
import { composeEventHandlers } from "~/utils/composeEventHandlers";
import { cva, type VariantProps } from "~/utils/cva";

const NodeShapes = ["circle", "square", "diamond"] as const;

export type NodeShape = (typeof NodeShapes)[number];

const nodeVariants = cva({
	base: [
		"relative inline-flex items-center justify-center outline-offset-6 focus-visible:outline-2 focus-visible:outline-offset-4",
		"aspect-square",
		"text-white",
		"[--base-hsl:var(--node-color-seq-1)] [--base:hsl(var(--base-hsl))] [--dark:hsl(var(--base-hsl)/0.85)]",
		"bg-[linear-gradient(145deg,var(--base)_0%,var(--base)_50%,var(--dark)_50%,var(--dark)_100%)]",
	],
	variants: {
		size: {
			xxs: "size-8",
			xs: "size-14",
			sm: "size-20",
			md: "size-28",
			lg: "size-36",
		},
		shape: {
			circle: "rounded-full",
			square: "rounded",
			diamond: "rotate-45 rounded",
		},
		color: {
			"node-color-seq-1": "[--base-hsl:var(--node-color-seq-1)]",
			"node-color-seq-2": "[--base-hsl:var(--node-color-seq-2)]",
			"node-color-seq-3": "[--base-hsl:var(--node-color-seq-3)]",
			"node-color-seq-4": "[--base-hsl:var(--node-color-seq-4)]",
			"node-color-seq-5": "[--base-hsl:var(--node-color-seq-5)]",
			"node-color-seq-6": "[--base-hsl:var(--node-color-seq-6)]",
			"node-color-seq-7": "[--base-hsl:var(--node-color-seq-7)]",
			"node-color-seq-8": "[--base-hsl:var(--node-color-seq-8)]",
		},
		disabled: {
			true: "pointer-events-none saturate-50",
			false: "",
		},
	},
	compoundVariants: [
		{ shape: "square", size: "xxs", class: "rounded-[8px]" },
		{ shape: "square", size: "xs", class: "rounded-[16px]" },
		{ shape: "square", size: "sm", class: "rounded-[24px]" },
		{ shape: "square", size: "lg", class: "rounded-[34px]" },
		{ shape: "diamond", size: "xxs", class: "rounded-[8px]" },
		{ shape: "diamond", size: "xs", class: "rounded-[16px]" },
		{ shape: "diamond", size: "sm", class: "rounded-[24px]" },
		{ shape: "diamond", size: "lg", class: "rounded-[34px]" },
	],
	defaultVariants: {
		size: "md",
		shape: "circle",
		color: "node-color-seq-1",
		disabled: false,
	},
});

const labelVariants = cva({
	base: "overflow-hidden text-center hyphens-auto whitespace-pre-line px-2 leading-5! text-wrap break-words",
	variants: {
		size: {
			xxs: "text-xs",
			xs: "text-xs",
			sm: "text-sm",
			md: "text-base",
			lg: "text-lg",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

function mergeRefs<T>(...refs: Array<React.Ref<T> | React.RefObject<T | null> | undefined>) {
	return (node: T | null) => {
		for (const ref of refs) {
			if (typeof ref === "function") {
				ref(node);
			} else if (ref && "current" in ref) {
				(ref as React.MutableRefObject<T | null>).current = node;
			}
		}
	};
}

function truncateNodeLabel(label: string, maxLength = 35): string {
	if (label.length <= maxLength) return label;
	return `${label.substring(0, maxLength - 4)}\u{AD}...`;
}

type UINodeProps = {
	label?: string;
	ariaLabel?: string;
	loading?: boolean;
	selected?: boolean;
	linking?: boolean;
	highlighted?: boolean;
	color?: string | null;
	onPointerDown?: (e: React.PointerEvent) => void;
	onPointerUp?: (e: React.PointerEvent) => void;
} & Omit<VariantProps<typeof nodeVariants>, "color"> &
	Omit<
		ButtonHTMLAttributes<HTMLButtonElement>,
		| "color"
		| "onPointerDown"
		| "onPointerUp"
		| "onDrag"
		| "onDragStart"
		| "onDragEnd"
		| "onAnimationStart"
		| "onAnimationEnd"
	>;

const Node = forwardRef<HTMLButtonElement, UINodeProps>((props, ref) => {
	const {
		label = "",
		ariaLabel,
		color,
		shape,
		selected = false,
		linking = false,
		highlighted = false,
		loading = false,
		disabled = false,
		size = "md",
		className,
		style,
		onPointerDown: externalPointerDown,
		onPointerUp: externalPointerUp,
		onKeyDown: externalKeyDown,
		onKeyUp: externalKeyUp,
		onClick,
		...buttonProps
	} = props;

	const labelWithEllipsis = truncateNodeLabel(label);
	const isDiamond = shape === "diamond";

	const hasClickHandler = !!onClick;

	const cursor: CSSProperties["cursor"] = disabled
		? "not-allowed"
		: (style?.cursor ?? (hasClickHandler ? "pointer" : "default"));

	const { scope, nodeProps } = useNodeInteractions({
		hasClickHandler,
		disabled,
	});

	const [stateScope, animate] = useAnimate();

	const prevSelected = usePrevious(selected);
	const prevHighlighted = usePrevious(highlighted);

	useEffect(() => {
		if (!stateScope.current) return;

		const isActive = selected || highlighted;
		const wasActive = prevSelected === true || prevHighlighted === true;

		if (isActive && !wasActive) {
			void animate(
				stateScope.current,
				{
					boxShadow: [
						"0 0 0 0 var(--color-selected)",
						"0 0 0 0.5em var(--color-selected)",
						"0 0 0 0.3em var(--color-selected)",
					],
				},
				{
					duration: 0.4,
					ease: [0.34, 1.56, 0.64, 1],
				},
			);
		} else if (!isActive && wasActive) {
			void animate(stateScope.current, { boxShadow: "0 0 0 0 transparent" }, { duration: 0.15 });
		}
	}, [selected, highlighted, prevSelected, prevHighlighted, stateScope, animate]);

	const nodeContent = (
		<>
			{loading && <Loader2 className="animate-spin" size={24} />}
			{!loading && label && <span className={labelVariants({ size })}>{labelWithEllipsis}</span>}
		</>
	);

	return (
		<motion.button
			{...buttonProps}
			ref={mergeRefs(ref, scope, stateScope)}
			type="button"
			disabled={disabled}
			aria-label={ariaLabel ?? (label || undefined)}
			aria-pressed={hasClickHandler ? selected : undefined}
			className={nodeVariants({
				size,
				shape,
				color: color as VariantProps<typeof nodeVariants>["color"],
				disabled,
				className,
			})}
			style={{
				...nodeProps.style,
				...style,
				cursor,
			}}
			data-node-selected={selected || undefined}
			data-node-linking={linking || undefined}
			data-node-highlighted={highlighted || undefined}
			onPointerDown={composeEventHandlers(nodeProps.onPointerDown, externalPointerDown)}
			onPointerUp={composeEventHandlers(nodeProps.onPointerUp, externalPointerUp)}
			onPointerCancel={nodeProps.onPointerCancel}
			onPointerLeave={nodeProps.onPointerLeave}
			onKeyDown={composeEventHandlers(externalKeyDown, nodeProps.onKeyDown)}
			onKeyUp={composeEventHandlers(externalKeyUp, nodeProps.onKeyUp)}
			onClick={onClick}
		>
			<AnimatePresence>
				{linking && (
					<motion.span
						className="pointer-events-none absolute inset-0 rounded-[inherit]"
						initial={{
							boxShadow: "0 0 0 0.08em var(--color-selected)",
							opacity: 0.6,
						}}
						animate={{
							boxShadow: ["0 0 0 0.08em var(--color-selected)", "0 0 0 0.7em var(--color-selected)"],
						}}
						exit={{ opacity: 0, boxShadow: "0 0 0 0 var(--color-selected)" }}
						transition={{
							boxShadow: {
								duration: 0.4,
								repeat: Number.POSITIVE_INFINITY,
								repeatType: "reverse",
								ease: [0.2, 0, 0.6, 1],
							},
						}}
						aria-hidden
					/>
				)}
			</AnimatePresence>
			{isDiamond ? <span className="-rotate-45">{nodeContent}</span> : nodeContent}
			{props.children}
		</motion.button>
	);
});

Node.displayName = "Node";

export default Node;
