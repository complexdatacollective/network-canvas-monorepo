import type { ReactNode } from "react";

type Props = {
	title: string;
	meta?: string;
	children: ReactNode;
};

export const ProtocolCardMock = ({ title, meta = "Modified May 18, 2026", children }: Props) => (
	<div
		style={{
			width: 320,
			height: 200,
			borderRadius: 12,
			overflow: "hidden",
			position: "relative",
			boxShadow: "0 6px 18px -8px rgba(0,0,0,0.25)",
			background: "#fff",
		}}
	>
		<div style={{ position: "absolute", inset: 0 }}>{children}</div>
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				padding: "12px 16px",
				background: "linear-gradient(to top, rgba(255,255,255,0.97) 50%, rgba(255,255,255,0))",
				color: "#1a1330",
			}}
		>
			<div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.2 }}>{title}</div>
			<div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{meta}</div>
		</div>
	</div>
);
