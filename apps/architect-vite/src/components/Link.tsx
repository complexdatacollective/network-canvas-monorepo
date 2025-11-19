import type React from "react";

type LinkProps = {
	onClick?: (() => void) | null;
	children: React.ReactNode;
};

const Link = ({ children, onClick = null }: LinkProps) => {
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (onClick && (e.key === "Enter" || e.key === " ")) {
			e.preventDefault();
			onClick();
		}
	};

	return (
		<div
			className="link"
			onClick={onClick || undefined}
			onKeyDown={handleKeyDown}
			role={onClick ? "button" : undefined}
			tabIndex={onClick ? 0 : undefined}
		>
			{children}
		</div>
	);
};

export default Link;
