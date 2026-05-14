import cx from "classnames";
import type React from "react";

type RowProps = {
	disabled?: boolean;
	children?: React.ReactNode;
};

const Row = ({ disabled = false, children = null }: RowProps) => {
	const rowClasses = cx("not-last:mb-6", {
		"stage-editor-row--disabled": disabled,
	});

	return <div className={rowClasses}>{children}</div>;
};

export default Row;
