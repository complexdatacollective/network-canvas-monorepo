import type React from "react";
import { cx } from "~/utils/cva";

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & {
	color: string;
};

const Badge = ({ color, className, children = null, ...rest }: BadgeProps) => {
	const badgeClasses = cx(
		"inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm",
		color === "white" && "bg-surface-1 text-foreground",
		color === "neon-coral" && "bg-neon-coral text-white",
		color === "sea-green" && "bg-sea-green text-white",
		color === "slate-blue" && "bg-slate-blue text-white",
		color === "navy-taupe" && "bg-navy-taupe text-navy-taupe-foreground",
		color === "cyber-grape" && "bg-cyber-grape text-white",
		color === "mustard" && "bg-mustard text-white",
		color === "platinum" && "bg-platinum text-charcoal",
		color === "sea-serpent" && "bg-sea-serpent text-white",
		color === "paradise-pink" && "bg-paradise-pink text-white",
		color === "cerulean-blue" && "bg-cerulean-blue text-white",
		color === "neon-carrot" && "bg-neon-carrot text-white",
		color === "kiwi" && "bg-kiwi text-white",
		color === "tomato" && "bg-tomato text-white",
		color === "purple-pizazz" && "bg-purple-pizazz text-white",
		color === "slate-blue-dark" && "bg-slate-blue-dark text-white",
		className,
	);

	return (
		<div className={badgeClasses} {...rest}>
			{children}
		</div>
	);
};

export default Badge;
