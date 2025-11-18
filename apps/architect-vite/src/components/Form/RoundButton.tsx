import cx from "classnames";
import type React from "react";
import { Icon } from "~/lib/legacy-ui/components";

type RoundButtonProps = {
	icon?: string | null;
	content?: string | null;
	size?: "small" | "default" | "large";
	className?: string;
	type?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const RoundButton = ({
	icon = null,
	content = null,
	size = "default",
	className = "",
	type = "button",
	...props
}: RoundButtonProps) => (
	<button
		className={cx("form-round-button", className, { [`form-round-button--${size}`]: !!size })}
		type={type as "button" | "submit" | "reset"}
		{...props}
	>
		{(icon && <Icon name={icon} />) || content}
	</button>
);

export default RoundButton;
