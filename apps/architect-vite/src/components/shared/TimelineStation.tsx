import filterIcon from "~/images/timeline/filter-icon.svg";
import skipLogicIcon from "~/images/timeline/skip-logic-icon.svg";

type Props = {
	label: string;
	subLabel: string;
	index: number;
	color: string;
	iconSrc: string;
	labelPosition: "left" | "right";
	incomingRailColor?: string;
	onDelete?: () => void;
	hasFilter?: boolean;
	hasSkipLogic?: boolean;
};

export default function TimelineStation({
	label,
	subLabel,
	index,
	color,
	iconSrc,
	labelPosition,
	incomingRailColor,
	onDelete,
	hasFilter,
	hasSkipLogic,
}: Props) {
	const labelPill = (
		<div
			className="flex max-w-[280px] flex-col rounded-full bg-white px-6 py-3"
			style={{ boxShadow: "0 8px 20px rgba(22,21,43,0.10)" }}
		>
			<div className="flex items-center gap-2">
				{hasFilter && <img src={filterIcon} alt="Filter" className="size-4" />}
				{hasSkipLogic && <img src={skipLogicIcon} alt="Skip logic" className="size-4" />}
				<div
					className="truncate font-heading text-[19px] font-extrabold leading-tight tracking-tight"
					style={{ color: "hsl(240 35% 17%)" }}
				>
					{label}
				</div>
			</div>
			<div className="mt-[3px] text-[12px] font-bold uppercase leading-none tracking-[0.16em]" style={{ color }}>
				{subLabel}
			</div>
		</div>
	);

	const indexBadge = (
		<div className="font-mono text-[12px] tracking-[0.1em]" style={{ color: "hsl(220 4% 44%)" }}>
			{String(index + 1).padStart(2, "0")}
		</div>
	);

	const stationCircle = (
		<div className="relative flex size-[80px] shrink-0 items-center justify-center rounded-full bg-white">
			<div className="flex size-[64px] items-center justify-center rounded-full" style={{ background: color }}>
				<img src={iconSrc} alt="" className="size-[26px]" style={{ filter: "brightness(0) invert(1)" }} />
			</div>
			{onDelete && (
				<button
					type="button"
					aria-label="Delete stage"
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
					className="absolute -right-1 -top-1 flex size-6 cursor-pointer items-center justify-center rounded-full text-sm font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
					style={{ background: "hsl(342 77% 51%)" }}
				>
					×
				</button>
			)}
		</div>
	);

	return (
		<div className="flex w-full flex-col items-center">
			{incomingRailColor && (
				<div aria-hidden className="h-10 w-4" style={{ background: incomingRailColor, opacity: 0.9 }} />
			)}
			<div className="group flex w-full items-center justify-center gap-4">
				{labelPosition === "left" ? (
					<>
						<div className="flex flex-1 justify-end">{labelPill}</div>
						{indexBadge}
						{stationCircle}
						<div className="flex-1" />
					</>
				) : (
					<>
						<div className="flex-1" />
						{stationCircle}
						{indexBadge}
						<div className="flex flex-1 justify-start">{labelPill}</div>
					</>
				)}
			</div>
		</div>
	);
}
