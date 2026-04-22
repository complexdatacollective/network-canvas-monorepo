import type { ReactNode } from "react";

type Props = {
	children: ReactNode;
	railColor?: string;
};

export default function TimelineRail({ children, railColor }: Props) {
	return (
		<div className="relative w-full overflow-x-auto py-8">
			{railColor && (
				<div
					data-part="rail"
					aria-hidden
					className="pointer-events-none absolute left-0 right-0 top-1/2 h-4 -translate-y-1/2 rounded-full"
					style={{ background: railColor, opacity: 0.9 }}
				/>
			)}
			<div className="relative flex items-center gap-6 px-6">{children}</div>
		</div>
	);
}
