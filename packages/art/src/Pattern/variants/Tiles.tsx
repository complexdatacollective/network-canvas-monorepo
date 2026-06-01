import { useMemo } from 'react';

import { rngToPalette } from '../palette';
import { PatternSvg } from '../PatternSvg';
import { seedToRng } from '../seed';
import type { PatternProps, Renderer } from '../types';

const renderTiles: Renderer = (rng, palette, w, h) => {
  const tile = 18 + Math.floor(rng() * 38); // 18–56
  const triHeight = (tile * Math.sqrt(3)) / 2;
  const cols = Math.ceil(w / tile) + 2;
  const rows = Math.ceil(h / triHeight) + 2;
  const fillProbability = 0.4 + rng() * 0.5; // 0.4–0.9 — some triangles empty
  const outlined = rng() > 0.7;
  const strokeWidth = 1 + rng() * 4;
  const triangles: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    const y0 = row * triHeight;
    const y1 = y0 + triHeight;
    for (let col = 0; col < cols; col++) {
      const x0 = col * tile - (row % 2 === 0 ? 0 : tile / 2);
      const x1 = x0 + tile;
      const xMid = x0 + tile / 2;
      if (rng() < fillProbability) {
        const upProps = outlined
          ? { fill: 'none', stroke: palette.foreground, strokeWidth }
          : { fill: palette.foreground };
        triangles.push(
          <polygon
            key={`u-${row}-${col}`}
            points={`${x0},${y1} ${x1},${y1} ${xMid},${y0}`}
            {...upProps}
          />,
        );
      }
      if (rng() < fillProbability) {
        const xMidNext = x1 + tile / 2;
        const downProps = outlined
          ? { fill: 'none', stroke: palette.foreground, strokeWidth }
          : { fill: palette.foreground };
        triangles.push(
          <polygon
            key={`d-${row}-${col}`}
            points={`${x1},${y1} ${xMidNext},${y0} ${xMid},${y0}`}
            {...downProps}
          />,
        );
      }
    }
  }
  return <>{triangles}</>;
};

export const TilesPattern = ({
  seed,
  width = 400,
  height = 250,
  className,
  style,
}: PatternProps) => {
  const { palette, content } = useMemo(() => {
    const rng = seedToRng(seed);
    const generatedPalette = rngToPalette(rng);
    const renderedContent = renderTiles(rng, generatedPalette, width, height);
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
