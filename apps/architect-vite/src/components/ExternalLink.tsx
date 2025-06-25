import type React from "react";

export const openExternalLink = (href: string) => {
	window.open(href, '_blank', 'noopener,noreferrer');
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
