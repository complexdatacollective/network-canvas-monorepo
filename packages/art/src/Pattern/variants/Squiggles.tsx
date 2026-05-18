import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

const renderSquiggles: Renderer = (rng, palette, w, h) => {
	const rowCount = 5 + Math.floor(rng() * 5);
	const colors = [palette.foreground, palette.accent, palette.highlight];
	const stroke = 2 + rng() * 2;
	const rowGap = h / rowCount;
	const paths: React.ReactNode[] = [];
	for (let i = 0; i < rowCount; i++) {
		const baseY = (i + 0.5) * rowGap;
		const amp = Math.min(rowGap * 0.45, 6 + rng() * (rowGap * 0.35));
		const wavelength = 30 + rng() * 50;
		const steps = Math.ceil(w / (wavelength / 2)) + 2;
		let direction = rng() > 0.5 ? 1 : -1;
		const d: string[] = [`M ${-wavelength / 2} ${baseY.toFixed(2)}`];
		for (let s = 0; s < steps; s++) {
			const xMid = s * (wavelength / 2) + wavelength / 4;
			const xEnd = (s + 1) * (wavelength / 2);
			const yMid = baseY + direction * amp;
			d.push(`Q ${xMid.toFixed(2)} ${yMid.toFixed(2)}, ${xEnd.toFixed(2)} ${baseY.toFixed(2)}`);
			direction *= -1;
		}
		const color = colors[i % colors.length] ?? palette.foreground;
		paths.push(<path key={i} d={d.join(" ")} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />);
	}
	return (
		<>
			<rect width={w} height={h} fill={palette.background} />
			{paths}
		</>
	);
};

export const SquigglesPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
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
			{renderSquiggles(rng, palette, width, height)}
		</svg>
	);
};
