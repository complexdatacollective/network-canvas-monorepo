type Props = {
	label: string;
	index: number;
	color: string;
	iconSrc: string;
	labelPosition: "above" | "below";
};

export default function TimelineStation({ label, index, color, iconSrc, labelPosition }: Props) {
	return (
		<div className="flex flex-col items-center">
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
			</div>

			<div
				className={`mt-2 max-w-[16ch] rounded-full bg-white px-4 py-1.5 ${labelPosition === "above" ? "order-1 mb-2 mt-0" : ""}`}
				style={{ boxShadow: "0 4px 12px rgba(22,21,43,0.10)" }}
			>
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
