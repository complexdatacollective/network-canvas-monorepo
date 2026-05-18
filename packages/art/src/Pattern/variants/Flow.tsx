import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

const renderFlow: Renderer = (rng, palette, w, h) => {
	const lineCount = 5 + Math.floor(rng() * 6);
	const colors = [palette.foreground, palette.accent, palette.highlight];
	const stroke = 1.4 + rng() * 2.2;
	const segments = 6;
	const paths: React.ReactNode[] = [];
	for (let i = 0; i < lineCount; i++) {
		const baseY = ((i + 0.5) / lineCount) * h;
		const amp = 6 + rng() * (h / (lineCount * 2));
		const phase = rng() * Math.PI * 2;
		const wavelength = w / (1 + rng() * 2);
		const stepX = w / segments;
		const points: string[] = [`M ${-stepX} ${baseY + Math.sin(phase) * amp}`];
		for (let s = 0; s <= segments + 1; s++) {
			const x = s * stepX;
			const y = baseY + Math.sin(phase + (x / wavelength) * Math.PI * 2) * amp;
			points.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
		}
		const color = colors[i % colors.length] ?? palette.foreground;
		paths.push(
			<path key={i} d={points.join(" ")} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />,
		);
	}
	return (
		<>
			<rect width={w} height={h} fill={palette.background} />
			{paths}
		</>
	);
};

export const FlowPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
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
			{renderFlow(rng, palette, width, height)}
		</svg>
	);
};
