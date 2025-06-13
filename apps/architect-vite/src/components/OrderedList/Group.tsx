import cx from "classnames";
import React from "react";

type GroupProps = {
	children?: React.ReactNode;
};

const Group = ({ children = null }: GroupProps) => <div className={cx("list-group")}>{children}</div>;

export default Group;
