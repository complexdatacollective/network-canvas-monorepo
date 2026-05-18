import { useMemo } from 'react';

import { rngToPalette } from '../palette';
import { PatternSvg } from '../PatternSvg';
import { seedToRng } from '../seed';
import type { PatternProps, Renderer } from '../types';

const renderCrosses: Renderer = (rng, palette, w, h) => {
  const cell = 16 + Math.floor(rng() * 32); // 16–48
  const crossSize = cell * (0.3 + rng() * 0.4); // 0.3–0.7 of cell
  const stroke = 1 + rng() * 4; // 1–5
  const rotated = rng() > 0.5;
  const cols = Math.ceil(w / cell) + 2;
  const rows = Math.ceil(h / cell) + 2;
  const lines: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    const yOffset = row * cell;
    const xShift = row % 2 === 0 ? 0 : cell / 2;
    for (let col = 0; col < cols; col++) {
      const cx = col * cell + xShift;
      const cy = yOffset;
      const half = crossSize / 2;
      // 0deg crosses (+): horizontal + vertical lines through (cx, cy)
      // 45deg crosses (x): two diagonal lines through (cx, cy)
      const a = rotated
        ? { x1: cx - half, y1: cy - half, x2: cx + half, y2: cy + half }
        : { x1: cx - half, y1: cy, x2: cx + half, y2: cy };
      const b = rotated
        ? { x1: cx - half, y1: cy + half, x2: cx + half, y2: cy - half }
        : { x1: cx, y1: cy - half, x2: cx, y2: cy + half };
      lines.push(
        <line
          key={`a-${row}-${col}`}
          x1={a.x1.toFixed(2)}
          y1={a.y1.toFixed(2)}
          x2={a.x2.toFixed(2)}
          y2={a.y2.toFixed(2)}
          stroke={palette.foreground}
          strokeWidth={stroke}
          strokeLinecap="round"
        />,
        <line
          key={`b-${row}-${col}`}
          x1={b.x1.toFixed(2)}
          y1={b.y1.toFixed(2)}
          x2={b.x2.toFixed(2)}
          y2={b.y2.toFixed(2)}
          stroke={palette.foreground}
          strokeWidth={stroke}
          strokeLinecap="round"
        />,
      );
    }
  }
  return <>{lines}</>;
};

export const CrossesPattern = ({
  seed,
  width = 400,
  height = 250,
  className,
  style,
}: PatternProps) => {
  const { palette, content } = useMemo(() => {
    const rng = seedToRng(seed);
    const palette = rngToPalette(rng);
    const content = renderCrosses(rng, palette, width, height);
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
