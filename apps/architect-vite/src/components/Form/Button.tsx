import cx from "classnames";
import type React from "react";

type ButtonProps = {
	children?: React.ReactNode;
	className?: string;
	type?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const Button = ({ children = null, className = "", type = "button", ...props }: ButtonProps) => (
	<button className={cx("form-button", className)} type={type as "button" | "submit" | "reset"} {...props}>
		{children}
	</button>
);

export default Button;
