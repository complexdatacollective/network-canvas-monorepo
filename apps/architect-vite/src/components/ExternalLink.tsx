import React from "react";

const { shell } = window.require("electron");

export const openExternalLink = (href: string) => {
	shell.openExternal(href);
};

type ExternalLinkProps = {
	children: React.ReactNode;
	href: string;
};

const ExternalLink = ({ children, href }: ExternalLinkProps) => {
	const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
		event.preventDefault();
		openExternalLink(href);
	};

	return (
		<a href={href} onClick={handleClick}>
			{children}
		</a>
	);
};

export default ExternalLink;