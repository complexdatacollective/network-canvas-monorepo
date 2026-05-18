import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

export const renderTruchet: Renderer = (rng, palette, w, h) => {
	const tile = 24 + Math.floor(rng() * 24);
	const cols = Math.ceil(w / tile) + 1;
	const rows = Math.ceil(h / tile) + 1;
	const stroke = 2 + rng() * 2;
	const colors = [palette.foreground, palette.accent, palette.highlight];
	const paths: React.ReactNode[] = [];
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const x = col * tile;
			const y = row * tile;
			const rotated = rng() > 0.5;
			const color = colors[Math.floor(rng() * 3)] ?? palette.foreground;
			const a = rotated
				? `M ${x} ${y + tile / 2} A ${tile / 2} ${tile / 2} 0 0 1 ${x + tile / 2} ${y}`
				: `M ${x} ${y + tile / 2} A ${tile / 2} ${tile / 2} 0 0 0 ${x + tile / 2} ${y + tile}`;
			const b = rotated
				? `M ${x + tile / 2} ${y + tile} A ${tile / 2} ${tile / 2} 0 0 1 ${x + tile} ${y + tile / 2}`
				: `M ${x + tile / 2} ${y} A ${tile / 2} ${tile / 2} 0 0 0 ${x + tile} ${y + tile / 2}`;
			paths.push(
				<path key={`a-${row}-${col}`} d={a} fill="none" stroke={color} strokeWidth={stroke} />,
				<path key={`b-${row}-${col}`} d={b} fill="none" stroke={color} strokeWidth={stroke} />,
			);
		}
	}
	return (
		<>
			<rect width={w} height={h} fill={palette.background} />
			{paths}
		</>
	);
};

export const TruchetPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
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
			{renderTruchet(rng, palette, width, height)}
		</svg>
	);
};
