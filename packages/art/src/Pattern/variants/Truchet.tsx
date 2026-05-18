import { useMemo } from 'react';

import { rngToPalette } from '../palette';
import { PatternSvg } from '../PatternSvg';
import { seedToRng } from '../seed';
import type { PatternProps, Renderer } from '../types';

const renderTruchet: Renderer = (rng, palette, w, h) => {
  const tile = 18 + Math.floor(rng() * 40); // 18–58
  const cols = Math.ceil(w / tile) + 1;
  const rows = Math.ceil(h / tile) + 1;
  const stroke = 1 + rng() * 5; // 1–6
  const paths: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * tile;
      const y = row * tile;
      const rotated = rng() > 0.5;
      const a = rotated
        ? `M ${x} ${y + tile / 2} A ${tile / 2} ${tile / 2} 0 0 1 ${x + tile / 2} ${y}`
        : `M ${x} ${y + tile / 2} A ${tile / 2} ${tile / 2} 0 0 0 ${x + tile / 2} ${y + tile}`;
      const b = rotated
        ? `M ${x + tile / 2} ${y + tile} A ${tile / 2} ${tile / 2} 0 0 1 ${x + tile} ${y + tile / 2}`
        : `M ${x + tile / 2} ${y} A ${tile / 2} ${tile / 2} 0 0 0 ${x + tile} ${y + tile / 2}`;
      paths.push(
        <path
          key={`a-${row}-${col}`}
          d={a}
          fill="none"
          stroke={palette.foreground}
          strokeWidth={stroke}
        />,
        <path
          key={`b-${row}-${col}`}
          d={b}
          fill="none"
          stroke={palette.foreground}
          strokeWidth={stroke}
        />,
      );
    }
  }
  return <>{paths}</>;
};

export const TruchetPattern = ({
  seed,
  width = 400,
  height = 250,
  className,
  style,
}: PatternProps) => {
  const { palette, content } = useMemo(() => {
    const rng = seedToRng(seed);
    const palette = rngToPalette(rng);
    const content = renderTruchet(rng, palette, width, height);
    return { palette, content };
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
