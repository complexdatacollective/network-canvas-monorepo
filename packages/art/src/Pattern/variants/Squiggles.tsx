import { useMemo } from 'react';

import { rngToPalette } from '../palette';
import { PatternSvg } from '../PatternSvg';
import { seedToRng } from '../seed';
import type { PatternProps, Renderer } from '../types';

const renderSquiggles: Renderer = (rng, palette, w, h) => {
  const rowCount = 3 + Math.floor(rng() * 10); // 3–12
  const stroke = 1 + rng() * 5; // 1–6
  const rowGap = h / rowCount;
  const paths: React.ReactNode[] = [];
  for (let i = 0; i < rowCount; i++) {
    const baseY = (i + 0.5) * rowGap;
    const amp = Math.min(rowGap * 0.45, 4 + rng() * (rowGap * 0.5));
    const wavelength = 20 + rng() * 70;
    const steps = Math.ceil(w / (wavelength / 2)) + 2;
    let direction = rng() > 0.5 ? 1 : -1;
    const d: string[] = [`M ${-wavelength / 2} ${baseY.toFixed(2)}`];
    for (let s = 0; s < steps; s++) {
      const xMid = s * (wavelength / 2) + wavelength / 4;
      const xEnd = (s + 1) * (wavelength / 2);
      const yMid = baseY + direction * amp;
      d.push(
        `Q ${xMid.toFixed(2)} ${yMid.toFixed(2)}, ${xEnd.toFixed(2)} ${baseY.toFixed(2)}`,
      );
      direction *= -1;
    }
    paths.push(
      <path
        key={i}
        d={d.join(' ')}
        fill="none"
        stroke={palette.foreground}
        strokeWidth={stroke}
        strokeLinecap="round"
      />,
    );
  }
  return <>{paths}</>;
};

export const SquigglesPattern = ({
  seed,
  width = 400,
  height = 250,
  className,
  style,
}: PatternProps) => {
  const { palette, content } = useMemo(() => {
    const rng = seedToRng(seed);
    const generatedPalette = rngToPalette(rng);
    const renderedContent = renderSquiggles(
      rng,
      generatedPalette,
      width,
      height,
    );
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
