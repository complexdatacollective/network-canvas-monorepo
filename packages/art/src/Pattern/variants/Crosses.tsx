import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

export const renderCrosses: Renderer = (rng, palette, w, h) => {
	const cell = 24 + Math.floor(rng() * 16);
	const cross = cell * (0.4 + rng() * 0.2);
	const stroke = 2 + rng() * 1.5;
	const cols = Math.ceil(w / cell) + 2;
	const rows = Math.ceil(h / cell) + 2;
	const colors = [palette.foreground, palette.accent, palette.highlight];
	const lines: React.ReactNode[] = [];
	for (let row = 0; row < rows; row++) {
		const yOffset = row * cell;
		const xShift = row % 2 === 0 ? 0 : cell / 2;
		for (let col = 0; col < cols; col++) {
			const cx = col * cell + xShift;
			const cy = yOffset;
			const color = colors[Math.floor(rng() * 3)] ?? palette.foreground;
			const half = cross / 2;
			lines.push(
				<line
					key={`h-${row}-${col}`}
					x1={(cx - half).toFixed(2)}
					y1={cy.toFixed(2)}
					x2={(cx + half).toFixed(2)}
					y2={cy.toFixed(2)}
					stroke={color}
					strokeWidth={stroke}
					strokeLinecap="round"
				/>,
				<line
					key={`v-${row}-${col}`}
					x1={cx.toFixed(2)}
					y1={(cy - half).toFixed(2)}
					x2={cx.toFixed(2)}
					y2={(cy + half).toFixed(2)}
					stroke={color}
					strokeWidth={stroke}
					strokeLinecap="round"
				/>,
			);
		}
	}
	return (
		<>
			<rect width={w} height={h} fill={palette.background} />
			{lines}
		</>
	);
};

export const CrossesPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
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
			{renderCrosses(rng, palette, width, height)}
		</svg>
	);
};
