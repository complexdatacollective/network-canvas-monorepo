import { cx } from '@codaco/fresco-ui/utils/cva';

import { outline } from './motion';

type Point = readonly [number, number];

const ARROW_PATH = 'M0 0 L0 30 L8 23 L14 36 L21 33 L15 21 L26 21 Z';

// A pointer whose tip sits at `tip`, with a colored name tag behind it.
export function Cursor({
  tip,
  fill,
  opacity,
}: {
  tip: Point;
  fill: string;
  opacity: number;
}) {
  return (
    <g
      transform={`translate(${tip[0]} ${tip[1]}) scale(1.15)`}
      opacity={opacity}
    >
      <rect
        x={20}
        y={36}
        width={38}
        height={20}
        rx={10}
        className={cx(fill, outline)}
        strokeWidth={3}
      />
      <path
        d={ARROW_PATH}
        className={cx(fill, outline)}
        strokeWidth={4}
        strokeLinejoin="round"
      />
    </g>
  );
}

// A ring that spreads and fades from `at` as `progress` runs from 0 to 1.
export function ClickRing({
  at,
  progress,
  stroke,
}: {
  at: Point;
  progress: number;
  stroke: string;
}) {
  if (progress <= 0 || progress >= 1) return null;
  return (
    <circle
      cx={at[0]}
      cy={at[1]}
      r={8 + progress * 26}
      fill="none"
      className={stroke}
      strokeWidth={4}
      opacity={1 - progress}
    />
  );
}
