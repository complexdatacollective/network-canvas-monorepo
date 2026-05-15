import type React from "react";

type RowProps = {
	children?: React.ReactNode;
};

const Row = ({ children = null }: RowProps) => <div className="not-last:mb-6">{children}</div>;

export default Row;
