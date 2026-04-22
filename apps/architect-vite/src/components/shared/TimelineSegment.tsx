type Props = {
	railColor?: string;
	onInsert: () => void;
};

export default function TimelineSegment({ railColor, onInsert }: Props) {
	const hasRail = !!railColor;
	return (
		<div className={`group relative flex w-full items-center justify-center ${hasRail ? "h-[72px]" : "h-10"}`}>
			{hasRail && (
				<div
					aria-hidden
					className="pointer-events-none absolute h-full w-4 rounded-full"
					style={{ background: railColor, opacity: 0.9 }}
				/>
			)}
			<button
				type="button"
				onClick={onInsert}
				aria-label="Insert stage here"
				className="relative z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-white opacity-0 transition-opacity group-hover:opacity-100"
				style={{ boxShadow: "0 4px 12px rgba(22,21,43,0.15)", color: "hsl(240 35% 17%)" }}
			>
				<span className="text-xl font-bold leading-none">+</span>
			</button>
		</div>
	);
}
