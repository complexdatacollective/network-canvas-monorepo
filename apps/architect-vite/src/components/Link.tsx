import type React from "react";

type LinkProps = {
	onClick?: (() => void) | null;
	children: React.ReactNode;
};

const Link = ({ children, onClick = null }: LinkProps) => (
	<div className="link" onClick={onClick || undefined}>
		{children}
	</div>
);

export default Link;
