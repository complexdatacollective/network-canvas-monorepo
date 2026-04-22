import type { ReactNode } from "react";

type Props = {
	children: ReactNode;
	railColor?: string;
};

export default function TimelineRail({ children, railColor }: Props) {
	return (
		<div className="relative w-full py-8">
			{railColor && (
				<div
					data-part="rail"
					aria-hidden
					className="pointer-events-none absolute bottom-0 left-1/2 top-0 w-4 -translate-x-1/2 rounded-full"
					style={{ background: railColor, opacity: 0.9 }}
				/>
			)}
			<div className="relative flex flex-col items-center gap-6 px-6">{children}</div>
		</div>
	);
}
