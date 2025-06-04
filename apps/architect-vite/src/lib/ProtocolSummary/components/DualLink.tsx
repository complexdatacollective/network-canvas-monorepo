import React from "react";

type DualLinkProps = {
	to: string;
	children?: React.ReactNode;
	className?: string;
};

const DualLink = ({ to, children = null, className = null }: DualLinkProps) => (
	<>
		<a href={to} data-print="only" className={className}>
			{children}
		</a>
	</>
);


export default DualLink;
