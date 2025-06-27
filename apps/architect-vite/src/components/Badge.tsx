import type React from "react";

type BadgeProps = {
	color?: string | null;
	children?: React.ReactNode;
};

const Badge = ({ color = null, children = null }: BadgeProps) => {
	const style = color ? { backgroundColor: color } : {};

	return (
		<div className="badge" style={style}>
			{children}
		</div>
	);
};

export default Badge;
