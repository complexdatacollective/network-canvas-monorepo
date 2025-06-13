import cx from "classnames";
import React, { PureComponent } from "react";
import Icon from "./Icon";

const renderButtonIcon = ({ icon, iconPosition }: { icon?: string | React.ReactElement; iconPosition?: string }) => {
	const iconClassNames = cx({
		button__icon: true,
		"button__icon--right": iconPosition === "right",
	});

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
	[key: string]: any;
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

		const buttonClassNames = cx({
			button: true,
			[`button--${color}`]: !!color,
			[`button--${size}`]: !!size,
			"button--has-icon": !!icon,
			"button--icon-pos-right": iconPosition === "right",
		});

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
				{renderButtonIcon({ icon, iconPosition })}
				{(content || children) && <span className="button__content">{children || content}</span>}
			</button>
		);
	}
}

export default Button;
