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
	// `cls-3`/`cls-4` target paths inside the legacy info icon SVG.
	info: "bg-info/25 text-navy-taupe [&_.cls-3]:fill-white [&_.cls-4]:fill-platinum",
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
					{/* Inline size beats `.icon[name="info"]` in legacy-ui icons.css (5rem). */}
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
