import type { ReactNode } from "react";

type Props = {
	left: ReactNode;
	right: ReactNode;
	narrowPreviewOpen?: boolean;
	onNarrowPreviewToggle?: () => void;
};

export default function SplitPane({ left, right, narrowPreviewOpen = false, onNarrowPreviewToggle }: Props) {
	return (
		<div className="flex h-full w-full flex-col lg:flex-row">
			{onNarrowPreviewToggle && (
				<button
					type="button"
					onClick={onNarrowPreviewToggle}
					aria-expanded={narrowPreviewOpen}
					className="flex items-center justify-between px-4 py-2 text-left font-heading text-xs font-bold uppercase tracking-[0.15em] lg:hidden"
					style={{ background: "rgba(255,255,255,0.6)" }}
				>
					<span>Preview</span>
					<span aria-hidden>{narrowPreviewOpen ? "▾" : "▸"}</span>
				</button>
			)}

			<div className={`${narrowPreviewOpen ? "h-[50dvh]" : "h-0"} overflow-hidden lg:h-auto lg:basis-2/5 xl:basis-1/2`}>
				{left}
			</div>

			<div className="flex-1 overflow-auto lg:basis-3/5 xl:basis-1/2">{right}</div>
		</div>
	);
}
