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
			"inline-flex gap-2 items-center justify-center grow-0 shrink-0 w-auto border-0 uppercase tracking-wider font-medium",
			// focus state
			"transition-color duration-200 ease-in-out",
			"cursor-pointer",
			"rounded-full",
			"px-6 py-3",
			"tracking-wide font-[500] text-sm",
			// Handle image size
			"[&>svg]:h-[1em]",
			// Disabled states
			"disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
			// Shadow effect (box shadow with 0.4rem offset LR and 0 blur and spread)
			"shadow-[0rem_0.25rem_0_0_var(--shadow-color)] active:translate-y-[0.25rem] active:shadow-none transition-all duration-100 ease-in-out",
			// sizes
			size === "small" && "h-8 px-4 text-xs",
			size === "large" && "h-12 px-8 text-base",
			// colors
			"bg-platinum [--shadow-color:var(--color-charcoal)] text-charcoal",
			color === "neon-coral" &&
				"bg-neon-coral border-neon-coral-dark text-white [--shadow-color:var(--color-neon-coral-dark)]",
			color === "sea-green" &&
				"bg-sea-green border-sea-green-dark text-white [--shadow-color:var(--color-sea-green-dark)]",
			color === "slate-blue" &&
				"bg-slate-blue border-slate-blue-dark text-white  [--shadow-color:var(--color-slate-blue-dark)]",
			color === "navy-taupe" &&
				"bg-navy-taupe border-navy-taupe-dark text-white [--shadow-color:var(--color-navy-taupe-dark)]",
			color === "cyber-grape" &&
				"bg-cyber-grape border-cyber-grape-dark text-white [--shadow-color:var(--color-cyber-grape-dark)]",
			color === "mustard" && "bg-mustard border-mustard-dark text-white [--shadow-color:var(--color-mustard-dark)]",
			color === "rich-black" &&
				"bg-rich-black border-rich-black-dark text-white  [--shadow-color:var(--color-rich-black-dark)]",
			color === "charcoal" &&
				"bg-charcoal border-charcoal-dark text-white  [--shadow-color:var(--color-charcoal-dark)]",
			color === "platinum-dark" &&
				"bg-platinum-dark border-platinum-dark text-charcoal [--shadow-color:var(--color-platinum)]",
			color === "sea-serpent" &&
				"bg-sea-serpent border-sea-serpent-dark text-white [--shadow-color:var(--color-sea-serpent-dark)]",
			color === "purple-pizazz" &&
				"bg-purple-pizazz border-purple-pizazz-dark text-white [--shadow-color:var(--color-purple-pizazz-dark)]",
			color === "paradise-pink" &&
				"bg-paradise-pink border-paradise-pink-dark text-white [--shadow-color:var(--color-paradise-pink-dark)]",
			color === "cerulean-blue" &&
				"bg-cerulean-blue border-cerulean-blue-dark text-white [--shadow-color:var(--color-cerulean-blue-dark)]",
			color === "kiwi" && "bg-kiwi border-kiwi-dark text-white [--shadow-color:var(--color-kiwi-dark)]",
			color === "neon-carrot" &&
				"bg-neon-carrot border-neon-carrot-dark text-white [--shadow-color:var(--color-neon-carrot-dark)]",
			color === "barbie-pink" &&
				"bg-barbie-pink border-barbie-pink-dark text-white [--shadow-color:var(--color-barbie-pink-dark)]",
			color === "tomato" && "bg-tomato border-tomato-dark text-white [--shadow-color:var(--color-tomato-dark)]",
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

export default Button;
