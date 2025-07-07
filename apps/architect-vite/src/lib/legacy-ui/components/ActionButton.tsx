import cx from "classnames";
import { noop } from "lodash";
import React from "react";
import Icon from "./Icon";

const renderIcon = ({ icon }: { icon?: string | React.ReactElement }) => {
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

interface ActionButtonProps {
	disabled?: boolean;
	onClick?: () => void;
	icon?: string | React.ReactElement;
	color?: string;
	title?: string;
}

const ActionButton = React.memo(
	({ disabled = false, onClick = noop, icon = null, color = null, title = "Add" }: ActionButtonProps) => {
		const handleClick = () => {
			if (!disabled) {
				onClick();
			}
		};

		const classes = cx({
			"action-button": true,
			"action-button--disabled": disabled,
			"action-button--clickable": onClick !== noop,
			[`action-button--${color}`]: !!color,
		});

		return (
			<button type="button" onClick={handleClick} className={classes} title={title} tabIndex="0" disabled={disabled}>
				<div className="icon-container">{renderIcon({ icon })}</div>
				<div className="plus-button">
					<Icon name="menu-new-session" color="sea-green" />
				</div>
			</button>
		);
	},
);

export default ActionButton;
