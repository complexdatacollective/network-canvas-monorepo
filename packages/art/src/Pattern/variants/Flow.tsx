import { useMemo } from 'react';

import { rngToPalette } from '../palette';
import { PatternSvg } from '../PatternSvg';
import { seedToRng } from '../seed';
import type { PatternProps, Renderer } from '../types';

const renderFlow: Renderer = (rng, palette, w, h) => {
  const lineCount = 4 + Math.floor(rng() * 10); // 4–13
  const stroke = 0.8 + rng() * 4.5; // 0.8–5.3
  const segments = 6 + Math.floor(rng() * 8); // 6–13
  const paths: React.ReactNode[] = [];
  for (let i = 0; i < lineCount; i++) {
    const baseY = ((i + 0.5) / lineCount) * h;
    const ampFactor = 0.4 + rng() * 0.5; // 0.4–0.9
    const amp = 6 + rng() * (h / lineCount) * ampFactor;
    const phase = rng() * Math.PI * 2;
    const wavelength = w / (1 + rng() * 3); // wider range
    const stepX = w / segments;
    const points: string[] = [`M ${-stepX} ${baseY + Math.sin(phase) * amp}`];
    for (let s = 0; s <= segments + 1; s++) {
      const x = s * stepX;
      const y = baseY + Math.sin(phase + (x / wavelength) * Math.PI * 2) * amp;
      points.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    paths.push(
      <path
        key={i}
        d={points.join(' ')}
        fill="none"
        stroke={palette.foreground}
        strokeWidth={stroke}
        strokeLinecap="round"
      />,
    );
  }
  return <>{paths}</>;
};

export const FlowPattern = ({
  seed,
  width = 400,
  height = 250,
  className,
  style,
}: PatternProps) => {
  const { palette, content } = useMemo(() => {
    const rng = seedToRng(seed);
    const generatedPalette = rngToPalette(rng);
    const renderedContent = renderFlow(rng, generatedPalette, width, height);
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
