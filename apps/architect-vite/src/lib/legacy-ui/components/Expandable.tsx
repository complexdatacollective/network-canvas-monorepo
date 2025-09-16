import type React from "react";
import cx from "classnames";

type ExpandableProps = {
	open?: boolean;
	className?: string | null;
	children?: React.ReactNode;
};

const Expandable = ({ open = false, children = null, className = null }: ExpandableProps) => {
	const classes = cx(className, "expandable", { "expandable--open": open });

	return <div className={classes}>{children}</div>;
};

export default Expandable;
