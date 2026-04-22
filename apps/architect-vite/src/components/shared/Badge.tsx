import type { ReactNode } from "react";

type Props = {
	color: string;
	background?: string;
	children: ReactNode;
};

export default function Badge({ color, background, children }: Props) {
	return (
		<span
			className="rounded-full px-2.5 py-[3px] text-[11px] font-bold uppercase tracking-[0.15em]"
			style={{
				background: background ?? `color-mix(in srgb, ${color} 18%, transparent)`,
				color,
			}}
		>
			{children}
		</span>
	);
}
