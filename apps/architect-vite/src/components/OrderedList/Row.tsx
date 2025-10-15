import type React from "react";

type RowProps = {
	children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

const Row = ({ children = null, ...rest }: RowProps) => (
	<div
		className="list-row"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...rest}
	>
		{children}
	</div>
);

export default Row;
