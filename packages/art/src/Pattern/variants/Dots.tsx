import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

const renderDots: Renderer = (rng, palette, w, h) => {
	const cell = 12 + Math.floor(rng() * 16);
	const cols = Math.ceil(w / cell) + 1;
	const rows = Math.ceil(h / cell) + 1;
	const colors = [palette.foreground, palette.accent, palette.highlight];
	const circles: React.ReactNode[] = [];
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const r = 1 + rng() * (cell * 0.35);
			const cx = col * cell + rng() * cell * 0.25;
			const cy = row * cell + rng() * cell * 0.25;
			const fill = colors[Math.floor(rng() * 3)] ?? palette.foreground;
			circles.push(<circle key={`${row}-${col}`} cx={cx} cy={cy} r={r} fill={fill} />);
		}
	}
	return (
		<>
			<rect width={w} height={h} fill={palette.background} />
			{circles}
		</>
	);
};

export const DotsPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
	const rng = useMemo(() => seedToRng(seed), [seed]);
	const palette = useMemo(() => rngToPalette(rng), [rng]);
	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="xMidYMid slice"
			className={className}
			style={style}
			role="presentation"
			xmlns="http://www.w3.org/2000/svg"
		>
			{renderDots(rng, palette, width, height)}
		</svg>
	);
};
