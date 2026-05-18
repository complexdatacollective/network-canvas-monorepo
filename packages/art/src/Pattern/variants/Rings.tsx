import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

export const renderRings: Renderer = (rng, palette, w, h) => {
	const centreCount = 3 + Math.floor(rng() * 4);
	const colors = [palette.foreground, palette.accent, palette.highlight];
	const stroke = 1.5 + rng() * 1.5;
	const circles: React.ReactNode[] = [];
	for (let i = 0; i < centreCount; i++) {
		const cx = rng() * w;
		const cy = rng() * h;
		const maxR = 30 + rng() * (Math.min(w, h) * 0.45);
		const ringCount = 3 + Math.floor(rng() * 3);
		const color = colors[Math.floor(rng() * 3)] ?? palette.foreground;
		for (let r = 0; r < ringCount; r++) {
			const radius = ((r + 1) / ringCount) * maxR;
			const opacity = 1 - r / ringCount;
			circles.push(
				<circle
					key={`${i}-${r}`}
					cx={cx.toFixed(2)}
					cy={cy.toFixed(2)}
					r={radius.toFixed(2)}
					fill="none"
					stroke={color}
					strokeOpacity={opacity.toFixed(3)}
					strokeWidth={stroke}
				/>,
			);
		}
	}
	return (
		<>
			<rect width={w} height={h} fill={palette.background} />
			{circles}
		</>
	);
};

export const RingsPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
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
			{renderRings(rng, palette, width, height)}
		</svg>
	);
};
