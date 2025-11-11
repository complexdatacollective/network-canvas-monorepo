import React, { PureComponent } from "react";
import { cn } from "~/utils/cn";
import Icon from "./Icon";

const renderButtonIcon = ({ icon }: { icon?: string | React.ReactElement }) => {
	let iconElement = null;
	if (icon) {
		if (typeof icon === "string") {
			iconElement = <Icon name={icon} />;
		} else {
			iconElement = React.cloneElement(icon);
		}
	}
	return iconElement;
};

type ButtonProps = {
	content?: string | React.ReactElement;
	icon?: string | React.ReactElement;
	iconPosition?: "left" | "right";
	size?: "small" | "large";
	color?:
		| "sea-green"
		| "neon-coral"
		| "slate-blue"
		| "navy-taupe"
		| "cyber-grape"
		| "mustard"
		| "rich-black"
		| "charcoal"
		| "platinum"
		| "platinum-dark"
		| "sea-serpent"
		| "purple-pizazz"
		| "paradise-pink"
		| "cerulean-blue"
		| "kiwi"
		| "neon-carrot"
		| "barbie-pink"
		| "tomato";
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

class Button extends PureComponent<ButtonProps> {
	render() {
		const {
			color = "platinum",
			size,
			children,
			content = "",
			onClick = () => {},
			icon = "",
			type = "button",
			iconPosition = "left",
			disabled = false,
			...rest
		} = this.props;

		const buttonClasses = cn(
			"inline-flex gap-2 items-center justify-center grow-0 shrink-0 w-auto",
			// focus state
			"focus:outline-none focus:ring-2 focus:ring-offset-2",
			"transition-color duration-200 ease-in-out",
			"cursor-pointer",
			"rounded-xl",
			"h-10 px-6 py-2",
			"tracking-wide font-[500] text-sm",
			// Handle image size
			"[&>svg]:h-full",
			// Disabled states
			"disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
			// sizes
			size === "small" && "h-8 px-4 text-xs",
			size === "large" && "h-12 px-8 text-base",
			// colors
			"bg-platinum border border-border hover:bg-platinum-dark",
			color === "neon-coral" && "bg-neon-coral border-neon-coral-dark text-white hover:bg-neon-coral-dark",
			color === "sea-green" && "bg-sea-green border-sea-green-dark text-white hover:bg-sea-green-dark",
			color === "slate-blue" && "bg-slate-blue border-slate-blue-dark text-white hover:bg-slate-blue-dark",
			color === "navy-taupe" && "bg-navy-taupe border-navy-taupe-dark text-white hover:bg-navy-taupe-dark",
			color === "cyber-grape" && "bg-cyber-grape border-cyber-grape-dark text-white hover:bg-cyber-grape-dark",
			color === "mustard" && "bg-mustard border-mustard-dark text-white hover:bg-mustard-dark",
			color === "rich-black" && "bg-rich-black border-rich-black-dark text-white hover:bg-rich-black-dark",
			color === "charcoal" && "bg-charcoal border-charcoal-dark text-white hover:bg-charcoal-dark",
			color === "platinum" && "bg-platinum border-platinum-dark text-charcoal hover:bg-platinum-dark",
			color === "platinum-dark" && "bg-platinum-dark border-platinum-dark text-charcoal hover:bg-platinum",
			color === "sea-serpent" && "bg-sea-serpent border-sea-serpent-dark text-white hover:bg-sea-serpent-dark",
			color === "purple-pizazz" && "bg-purple-pizazz border-purple-pizazz-dark text-white hover:bg-purple-pizazz-dark",
			color === "paradise-pink" && "bg-paradise-pink border-paradise-pink-dark text-white hover:bg-paradise-pink-dark",
			color === "cerulean-blue" && "bg-cerulean-blue border-cerulean-blue-dark text-white hover:bg-cerulean-blue-dark",
			color === "kiwi" && "bg-kiwi border-kiwi-dark text-white hover:bg-kiwi-dark",
			color === "neon-carrot" && "bg-neon-carrot border-neon-carrot-dark text-white hover:bg-neon-carrot-dark",
			color === "barbie-pink" && "bg-barbie-pink border-barbie-pink-dark text-white hover:bg-barbie-pink-dark",
			color === "tomato" && "bg-tomato border-tomato-dark text-white hover:bg-tomato-dark",
			// Icon position
			icon && iconPosition === "left" && "flex-row",
			icon && iconPosition === "right" && "flex-row-reverse",
		);

		return (
			<button type={type} className={buttonClasses} onClick={onClick} disabled={disabled} {...rest}>
				{renderButtonIcon({ icon })}
				{content || children}
			</button>
		);
	}
}

export { Button };
export default Button;
