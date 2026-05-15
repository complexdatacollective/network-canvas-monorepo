import { motion, useAnimation } from "motion/react";
import type React from "react";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";

type TipProps = {
	type?: "info" | "warning" | "error";
	icon?: boolean;
	children?: React.ReactNode;
};

const typeClasses: Record<NonNullable<TipProps["type"]>, string> = {
	// Swap the info icon's "speech bubble" tones for a lighter pair so the icon
	// reads against the tinted Tip background. See info.svg.react.tsx.
	info: "bg-info/25 text-navy-taupe [--info-fill-primary:var(--color-white)] [--info-fill-shadow:var(--color-platinum)]",
	warning: "bg-warning/10",
	error: "bg-error/10",
};

const Tip = ({ type = "info", icon = true, children = null }: TipProps) => {
	const animation = useAnimation();

	return (
		<div
			className={cx(
				"flex items-center w-full my-(--space-lg) py-(--space-xs) px-(--space-xl) gap-(--space-md) rounded bg-surface-2 text-sm",
				typeClasses[type],
			)}
		>
			{icon && (
				<motion.div
					className="shrink-0"
					animate={animation}
					style={{
						transformOrigin: "center",
					}}
					onViewportEnter={() =>
						animation.start({
							rotate: [-15, 10, -7, 0],
							scale: [1, 1.2, 1],
							transition: {
								delay: 0.5,
							},
						})
					}
				>
					{/* Inline size beats the default 5rem `.icon[name="info"]` rule in tailwind.css. */}
					<Icon
						name={type}
						style={{
							width: "var(--space-xl)",
							height: "var(--space-xl)",
						}}
					/>
				</motion.div>
			)}
			<div>{children}</div>
		</div>
	);
};

export default Tip;
