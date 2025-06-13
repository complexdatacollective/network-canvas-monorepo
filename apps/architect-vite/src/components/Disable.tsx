import React from "react";
import cx from "classnames";

type DisableProps = {
	disabled?: boolean;
	children?: React.ReactNode;
	className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const Disable = ({ disabled = true, className = "", children = null, ...rest }: DisableProps) => (
	<div
		className={cx("disable", { "disable--disabled": disabled }, className)}
		{...rest}
	>
		<div className="disable__capture">{children}</div>
	</div>
);

export default Disable;