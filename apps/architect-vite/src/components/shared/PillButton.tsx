import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";

export type PillButtonVariant = "primary" | "secondary" | "tertiary";
export type PillButtonSize = "md" | "sm";

type Props = {
	variant: PillButtonVariant;
	size?: PillButtonSize;
	icon?: ReactNode;
	iconPosition?: "left" | "right";
	children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const SEA_GREEN = "hsl(168 100% 39%)";
const SEA_GREEN_DARK = "hsl(168 100% 26%)";
const INK = "hsl(240 35% 17%)";

const baseClass =
	"inline-flex items-center justify-center gap-2.5 rounded-full font-heading font-bold uppercase tracking-[0.15em] cursor-pointer transition-opacity disabled:cursor-not-allowed disabled:opacity-50";

const sizeClass: Record<PillButtonSize, string> = {
	md: "px-7 py-4 text-[12.5px]",
	sm: "px-5 py-2.5 text-[11px]",
};

const PillButton = forwardRef<HTMLButtonElement, Props>(function PillButton(
	{ variant, size = "md", icon, iconPosition = "left", children, className = "", style, ...rest },
	ref,
) {
	const variantStyle =
		variant === "primary"
			? { background: SEA_GREEN, color: "#fff", boxShadow: `0 4px 0 ${SEA_GREEN_DARK}` }
			: variant === "secondary"
				? { background: "#fff", color: INK, boxShadow: "0 2px 8px rgba(22,21,43,0.08)" }
				: { background: "transparent", color: INK };

	const composed = `${baseClass} ${sizeClass[size]} ${className}`.trim();
	const inlineStyle = { ...variantStyle, ...style };

	return (
		<button ref={ref} type="button" className={composed} style={inlineStyle} {...rest}>
			{icon && iconPosition === "left" && <span className="flex items-center">{icon}</span>}
			{children}
			{icon && iconPosition === "right" && <span className="flex items-center">{icon}</span>}
		</button>
	);
});

export default PillButton;
