import cx from "classnames";
import React, { PureComponent } from "react";
import Icon from "./Icon";

// Safelist for Tailwind CSS - ensures all button color classes are included in build
// bg-neon-coral bg-sea-green bg-slate-blue bg-navy-taupe bg-cyber-grape bg-mustard
// bg-rich-black bg-charcoal bg-platinum bg-platinum-dark bg-sea-serpent
// bg-purple-pizazz bg-paradise-pink bg-cerulean-blue bg-kiwi bg-neon-carrot
// bg-barbie-pink bg-tomato bg-white bg-primary
// text-white text-charcoal
// hover:bg-neon-coral/80 hover:bg-sea-green/80 hover:bg-slate-blue/80 hover:bg-navy-taupe/80
// hover:bg-cyber-grape/80 hover:bg-mustard/80 hover:bg-rich-black/80 hover:bg-charcoal/80
// hover:bg-platinum/80 hover:bg-platinum-dark/80 hover:bg-sea-serpent/80 hover:bg-purple-pizazz/80
// hover:bg-paradise-pink/80 hover:bg-cerulean-blue/80 hover:bg-kiwi/80 hover:bg-neon-carrot/80
// hover:bg-barbie-pink/80 hover:bg-tomato/80 hover:bg-white/80 hover:bg-primary/80

// Color mapping for button variants to Tailwind classes
const getColorClasses = (color?: string) => {
	if (!color) {
		return {
			background: "bg-primary",
			text: "text-white",
			hover: "hover:bg-primary/80",
		};
	}

	const colorMap: Record<string, { background: string; text: string; hover: string }> = {
		"neon-coral": {
			background: "bg-neon-coral",
			text: "text-white",
			hover: "hover:bg-neon-coral/80",
		},
		"sea-green": {
			background: "bg-sea-green",
			text: "text-white",
			hover: "hover:bg-sea-green/80",
		},
		"slate-blue": {
			background: "bg-slate-blue",
			text: "text-white",
			hover: "hover:bg-slate-blue/80",
		},
		"navy-taupe": {
			background: "bg-navy-taupe",
			text: "text-white",
			hover: "hover:bg-navy-taupe/80",
		},
		"cyber-grape": {
			background: "bg-cyber-grape",
			text: "text-white",
			hover: "hover:bg-cyber-grape/80",
		},
		mustard: {
			background: "bg-mustard",
			text: "text-white",
			hover: "hover:bg-mustard/80",
		},
		"rich-black": {
			background: "bg-rich-black",
			text: "text-white",
			hover: "hover:bg-rich-black/80",
		},
		charcoal: {
			background: "bg-charcoal",
			text: "text-white",
			hover: "hover:bg-charcoal/80",
		},
		platinum: {
			background: "bg-platinum",
			text: "text-charcoal",
			hover: "hover:bg-platinum/80",
		},
		"platinum-dark": {
			background: "bg-platinum-dark",
			text: "text-charcoal",
			hover: "hover:bg-platinum-dark/80",
		},
		"sea-serpent": {
			background: "bg-sea-serpent",
			text: "text-white",
			hover: "hover:bg-sea-serpent/80",
		},
		"purple-pizazz": {
			background: "bg-purple-pizazz",
			text: "text-white",
			hover: "hover:bg-purple-pizazz/80",
		},
		"paradise-pink": {
			background: "bg-paradise-pink",
			text: "text-white",
			hover: "hover:bg-paradise-pink/80",
		},
		"cerulean-blue": {
			background: "bg-cerulean-blue",
			text: "text-white",
			hover: "hover:bg-cerulean-blue/80",
		},
		kiwi: {
			background: "bg-kiwi",
			text: "text-white",
			hover: "hover:bg-kiwi/80",
		},
		"neon-carrot": {
			background: "bg-neon-carrot",
			text: "text-white",
			hover: "hover:bg-neon-carrot/80",
		},
		"barbie-pink": {
			background: "bg-barbie-pink",
			text: "text-white",
			hover: "hover:bg-barbie-pink/80",
		},
		tomato: {
			background: "bg-tomato",
			text: "text-white",
			hover: "hover:bg-tomato/80",
		},
		white: {
			background: "bg-white",
			text: "text-charcoal",
			hover: "hover:bg-white/80",
		},
	};

	return colorMap[color] || {
		background: "bg-primary",
		text: "text-white",
		hover: "hover:bg-primary/80",
	};
};

const renderButtonIcon = ({ icon, iconPosition, textColor }: { icon?: string | React.ReactElement; iconPosition?: string; textColor?: string }) => {
	const iconClassNames = cx({
		button__icon: true,
		"button__icon--right": iconPosition === "right",
	}, textColor);

	let iconElement = null;
	if (icon) {
		if (typeof icon === "string") {
			iconElement = <Icon name={icon} className={iconClassNames} />;
		} else {
			iconElement = React.cloneElement(icon, { className: iconClassNames });
		}
	}
	return iconElement;
};

interface ButtonProps {
	content?: string | React.ReactElement;
	children?: React.ReactNode;
	icon?: string | React.ReactElement | object;
	iconPosition?: "left" | "right";
	size?: string;
	color?: string;
	type?: "button" | "submit" | "reset";
	onClick?: () => void;
	disabled?: boolean;
	[key: string]: unknown;
}

class Button extends PureComponent<ButtonProps> {
	render() {
		const {
			color,
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

		const colorClasses = getColorClasses(color);
		const buttonClassNames = cx(
			{
				button: true,
				[`button--${size}`]: !!size,
				"button--has-icon": !!icon,
				"button--icon-pos-right": iconPosition === "right",
			},
			colorClasses.background,
			colorClasses.text,
			colorClasses.hover,
		);

		return (
			<button
				// eslint-disable-next-line react/button-has-type
				type={type}
				className={buttonClassNames}
				onClick={onClick}
				disabled={disabled}
				// eslint-disable-next-line react/jsx-props-no-spreading
				{...rest}
			>
				{renderButtonIcon({ icon, iconPosition, textColor: colorClasses.text })}
				{(content || children) && <span className="button__content">{children || content}</span>}
			</button>
		);
	}
}

export { Button };
export default Button;
