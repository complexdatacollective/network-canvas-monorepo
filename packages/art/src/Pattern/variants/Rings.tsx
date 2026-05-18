import { useMemo } from "react";
import { PatternSvg } from "../PatternSvg";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

const renderRings: Renderer = (rng, palette, w, h) => {
	const centreCount = 2 + Math.floor(rng() * 8); // 2–9
	const stroke = 0.8 + rng() * 4; // 0.8–4.8
	const circles: React.ReactNode[] = [];
	for (let i = 0; i < centreCount; i++) {
		const cx = rng() * w;
		const cy = rng() * h;
		const maxR = 20 + rng() * (Math.min(w, h) * 0.7); // wider
		const ringCount = 2 + Math.floor(rng() * 6); // 2–7
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
					stroke={palette.foreground}
					strokeOpacity={opacity.toFixed(3)}
					strokeWidth={stroke}
				/>,
			);
		}
	}
	return <>{circles}</>;
};

export const RingsPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
	const rng = useMemo(() => seedToRng(seed), [seed]);
	const palette = useMemo(() => rngToPalette(rng), [rng]);
	return (
		<PatternSvg width={width} height={height} palette={palette} className={className} style={style}>
			{renderRings(rng, palette, width, height)}
		</PatternSvg>
	);
};
