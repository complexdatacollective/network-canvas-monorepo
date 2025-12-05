import type React from "react";
import { cn } from "~/utils/cn";

type TagProps = {
	id: string;
	children?: React.ReactNode;
	color?: string | null;
	onClick?: ((id: string) => void) | null;
	selected?: boolean;
	light?: boolean;
	disabled?: boolean;
};

const Tag = ({
	id,
	children = null,
	color = null,
	onClick = null,
	selected = false,
	light = false,
	disabled = false,
}: TagProps) => {
	const componentClasses = cn(
		"inline-flex py-1 rounded-full items-center justify-center text-xs uppercase tracking-widest font-semibold border-2 border-transparent gap-2 px-2",
		selected && "text-white bg-slate-blue",
		light && "text-dark bg-platinum",
		disabled && !!onClick && "",
		disabled && "opacity-50 cursor-not-allowed",
		onClick && !disabled && "cursor-pointer",
	);

	const dotClasses = cn(
		"w-[15px] h-auto aspect-square rounded-full shrink-0",
		color === "neon-coral" && "bg-neon-coral",
		color === "sea-green" && "bg-sea-green",
		color === "slate-blue" && "bg-slate-blue",
		color === "navy-taupe" && "bg-navy-taupe",
		color === "cyber-grape" && "bg-cyber-grape",
		color === "mustard" && "bg-mustard",
		color === "rich-black" && "bg-rich-black",
		color === "charcoal" && "bg-charcoal",
		color === "platinum" && "bg-platinum",
		color === "sea-serpent" && "bg-sea-serpent",
		color === "purple-pizazz" && "bg-purple-pizazz",
		color === "paradise-pink" && "bg-paradise-pink",
		color === "cerulean-blue" && "bg-cerulean-blue",
		color === "kiwi" && "bg-kiwi",
		color === "neon-carrot" && "bg-neon-carrot",
		color === "barbie-pink" && "bg-barbie-pink",
		color === "tomato" && "bg-tomato",
		color === "white" && "bg-white",
	);

	const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
		if (!disabled && onClick) {
			e.preventDefault();
			onClick(id);
		}
	};

	if (onClick) {
		return (
			<button type="button" className={componentClasses} onClick={handleClick} disabled={disabled}>
				<div className={dotClasses} />
				{children}
			</button>
		);
	}

	return (
		<div className={componentClasses}>
			<div className={dotClasses} />
			{children}
		</div>
	);
};

export default Tag;
