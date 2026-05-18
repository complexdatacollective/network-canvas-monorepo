import Heading from "@codaco/fresco-ui/typography/Heading";
import type { ReactNode } from "react";

type Props = {
	title: string;
	meta?: string;
	subheadingColor: string;
	children: ReactNode;
};

export const ProtocolCardMock = ({ title, meta = "Modified May 18, 2026", subheadingColor, children }: Props) => (
	<div
		style={{
			width: 320,
			height: 200,
			borderRadius: 12,
			overflow: "hidden",
			position: "relative",
			boxShadow: "0 6px 18px -8px rgba(0,0,0,0.25)",
		}}
	>
		<div style={{ position: "absolute", inset: 0 }}>{children}</div>
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				padding: "14px 18px",
			}}
		>
			<Heading level="h3" margin="none" style={{ color: "white" }}>
				{title}
			</Heading>
			<div style={{ fontSize: 12, marginTop: 4, color: subheadingColor, fontWeight: 600 }}>{meta}</div>
		</div>
	</div>
);
