import type React from "react";
import { cx } from "~/utils/cva";

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
