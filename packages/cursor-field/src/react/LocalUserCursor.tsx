import { Cursor } from "motion-plus/react";

export type LocalUserCursorProps = {
	flag: string;
	size: number;
	visible: boolean;
};

export function LocalUserCursor({ flag, size, visible }: LocalUserCursorProps): React.ReactNode {
	if (!visible) return null;

	return (
		<Cursor
			follow
			spring={{ stiffness: 10000, damping: 100, mass: 0.1 }}
			style={{
				position: "fixed",
				pointerEvents: "none",
				zIndex: 10000,
			}}
		>
			<span
				style={{
					fontSize: size,
					lineHeight: 1,
					display: "block",
					transform: "translate(-50%, -50%)",
				}}
			>
				{flag}
			</span>
		</Cursor>
	);
}
