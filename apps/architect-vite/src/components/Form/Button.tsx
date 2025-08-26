import type React from "react";
import cx from "classnames";

type ButtonProps = {
	children?: React.ReactNode;
	className?: string;
	type?: "button" | "submit" | "reset";
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const Button = ({ children = null, className = "", type = "button", ...props }: ButtonProps) => (
	<button className={cx("form-button", className)} type={type} {...props}>
		{children}
	</button>
);

export default Button;
