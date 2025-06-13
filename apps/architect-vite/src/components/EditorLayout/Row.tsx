import React from "react";
import cx from "classnames";

type RowProps = {
	disabled?: boolean;
	children?: React.ReactNode;
};

const Row = ({ disabled = false, children = null }: RowProps) => {
	const rowClasses = cx("stage-editor-row", { "stage-editor-row--disabled": disabled });

	return <div className={rowClasses}>{children}</div>;
};

export default Row;