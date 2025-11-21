import type React from "react";

type DualLinkProps = {
	to: string;
	children?: React.ReactNode;
	className?: string;
};

const DualLink = ({ to, children = null, className }: DualLinkProps) => (
	<>
		<a href={to} className={className ?? undefined}>
			{children}
		</a>
	</>
);

export default DualLink;
