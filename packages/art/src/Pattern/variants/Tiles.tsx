import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

const renderTiles: Renderer = (rng, palette, w, h) => {
	const tile = 28 + Math.floor(rng() * 20);
	const triHeight = (tile * Math.sqrt(3)) / 2;
	const cols = Math.ceil(w / tile) + 2;
	const rows = Math.ceil(h / triHeight) + 2;
	const colors = [palette.foreground, palette.accent, palette.highlight];
	const triangles: React.ReactNode[] = [];
	for (let row = 0; row < rows; row++) {
		const y0 = row * triHeight;
		const y1 = y0 + triHeight;
		for (let col = 0; col < cols; col++) {
			const x0 = col * tile - (row % 2 === 0 ? 0 : tile / 2);
			const x1 = x0 + tile;
			const xMid = x0 + tile / 2;
			const fillUp = colors[Math.floor(rng() * 3)] ?? palette.foreground;
			triangles.push(
				<polygon key={`u-${row}-${col}`} points={`${x0},${y1} ${x1},${y1} ${xMid},${y0}`} fill={fillUp} />,
			);
			const xMidNext = x1 + tile / 2;
			const fillDown = colors[Math.floor(rng() * 3)] ?? palette.foreground;
			triangles.push(
				<polygon key={`d-${row}-${col}`} points={`${x1},${y1} ${xMidNext},${y0} ${xMid},${y0}`} fill={fillDown} />,
			);
		}
	}
	return (
		<>
			<rect width={w} height={h} fill={palette.background} />
			{triangles}
		</>
	);
};

export const TilesPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
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
			{renderTiles(rng, palette, width, height)}
		</svg>
	);
};
