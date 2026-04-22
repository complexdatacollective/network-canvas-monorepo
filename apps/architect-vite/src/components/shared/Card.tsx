import type { HTMLAttributes, ReactNode } from "react";

type CardPadding = "sm" | "md" | "lg";

const paddingClass: Record<CardPadding, string> = {
	sm: "p-4",
	md: "p-6",
	lg: "p-8",
};

type Props = {
	padding?: CardPadding;
	children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export default function Card({ padding = "md", children, className = "", style, ...rest }: Props) {
	const composed = `bg-white rounded-2xl ${paddingClass[padding]} ${className}`.trim();
	return (
		<div className={composed} style={{ boxShadow: "0 4px 12px rgba(22,21,43,0.08)", ...style }} {...rest}>
			{children}
		</div>
	);
}
