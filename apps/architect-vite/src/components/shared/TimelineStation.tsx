import filterIcon from "~/images/timeline/filter-icon.svg";
import skipLogicIcon from "~/images/timeline/skip-logic-icon.svg";

type Props = {
	label: string;
	index: number;
	color: string;
	iconSrc: string;
	labelPosition: "above" | "below";
	onDelete?: () => void;
	hasFilter?: boolean;
	hasSkipLogic?: boolean;
};

export default function TimelineStation({
	label,
	index,
	color,
	iconSrc,
	labelPosition,
	onDelete,
	hasFilter,
	hasSkipLogic,
}: Props) {
	return (
		<div className="group flex flex-col items-center">
			<div
				className={`font-mono text-[11px] tracking-[0.1em] ${labelPosition === "below" ? "mb-1.5" : "order-3 mt-1.5"}`}
				style={{ color: "hsl(220 4% 44%)" }}
			>
				{String(index + 1).padStart(2, "0")}
			</div>

			<div className="relative flex size-[72px] items-center justify-center rounded-full bg-white">
				<div className="flex size-[56px] items-center justify-center rounded-full" style={{ background: color }}>
					<img src={iconSrc} alt="" className="size-[26px]" style={{ filter: "brightness(0) invert(1)" }} />
				</div>
				{onDelete ? (
					<button
						type="button"
						aria-label="Delete stage"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100 focus:outline-none"
						style={{ background: "hsl(342 77% 51%)" }}
					>
						<span aria-hidden className="text-[11px] leading-none font-bold">
							×
						</span>
					</button>
				) : null}
			</div>

			<div
				className={`mt-2 flex max-w-[16ch] items-center gap-1.5 rounded-full bg-white px-4 py-1.5 ${labelPosition === "above" ? "order-1 mb-2 mt-0" : ""}`}
				style={{ boxShadow: "0 4px 12px rgba(22,21,43,0.10)" }}
			>
				{hasFilter ? <img src={filterIcon} alt="Filter" className="size-4 shrink-0" /> : null}
				{hasSkipLogic ? <img src={skipLogicIcon} alt="Skip logic" className="size-4 shrink-0" /> : null}
				<div
					className="truncate text-center font-heading text-[13px] font-extrabold leading-tight"
					style={{ color: "hsl(240 35% 17%)" }}
				>
					{label}
				</div>
			</div>
		</div>
	);
}
