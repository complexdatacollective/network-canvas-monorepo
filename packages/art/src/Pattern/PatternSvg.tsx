import { type CSSProperties, type ReactNode, useId } from "react";
import type { Palette } from "./types";

type Props = {
	width: number;
	height: number;
	palette: Palette;
	className?: string;
	style?: CSSProperties;
	children: ReactNode;
};

export const PatternSvg = ({ width, height, palette, className, style, children }: Props) => {
	const rawId = useId();
	const gradId = `pat-bg${rawId.replace(/:/g, "")}`;
	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="xMidYMid slice"
			className={className}
			style={style}
			role="presentation"
			xmlns="http://www.w3.org/2000/svg"
		>
			<defs>
				<linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor={palette.backgroundTop} />
					<stop offset="1" stopColor={palette.backgroundBottom} />
				</linearGradient>
			</defs>
			<rect width={width} height={height} fill={`url(#${gradId})`} />
			{children}
		</svg>
	);
};
