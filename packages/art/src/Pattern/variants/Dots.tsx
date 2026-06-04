import { useMemo } from 'react';

import { rngToPalette } from '../palette';
import { PatternSvg } from '../PatternSvg';
import { seedToRng } from '../seed';
import type { PatternProps, Renderer } from '../types';

const renderDots: Renderer = (rng, palette, w, h) => {
  const cell = 10 + Math.floor(rng() * 22); // 10–32
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const maxRadiusFactor = 0.2 + rng() * 0.35; // 0.2–0.55
  const jitterFactor = rng() * 0.4; // 0–0.4
  const circles: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const r = 0.5 + rng() * (cell * maxRadiusFactor);
      const cx = col * cell + rng() * cell * jitterFactor;
      const cy = row * cell + rng() * cell * jitterFactor;
      circles.push(
        <circle
          key={`${row}-${col}`}
          cx={cx}
          cy={cy}
          r={r}
          fill={palette.foreground}
        />,
      );
    }
  }
  return <>{circles}</>;
};

export const DotsPattern = ({
  seed,
  width = 400,
  height = 250,
  className,
  style,
}: PatternProps) => {
  const { palette, content } = useMemo(() => {
    const rng = seedToRng(seed);
    const generatedPalette = rngToPalette(rng);
    const renderedContent = renderDots(rng, generatedPalette, width, height);
    return { palette: generatedPalette, content: renderedContent };
  }, [seed, width, height]);
  return (
    <PatternSvg
      width={width}
      height={height}
      palette={palette}
      className={className}
      style={style}
    >
      {content}
    </PatternSvg>
  );
};
