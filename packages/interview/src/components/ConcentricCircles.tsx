import { range } from 'es-toolkit';

import { cx } from '@codaco/fresco-ui/utils/cva';

// Ease-out curve: q > 1 compresses outer rings more aggressively
const computeRadii = (n: number, q: number) =>
  range(1, n + 1)
    .map((i) => 50 * (1 - (1 - i / n) ** q))
    .reverse();

type RadarProps = {
  'n': number;
  'skewed'?: boolean;
  'className'?: string;
  'data-testid'?: string;
};

export default function ConcentricCircles({
  n,
  skewed = true,
  className,
  ...props
}: RadarProps) {
  // The schema admits zero circles: a deliberate blank background.
  if (n === 0) {
    return null;
  }

  const radii = computeRadii(n, skewed ? 1.4 : 1);

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={cx('aspect-square h-full max-w-full', className)}
      aria-hidden="true"
      {...props}
    >
      {radii.map((radius, index) => {
        const t = index / n;
        const colorPercent = Math.round(10 + t * 50);
        return (
          <circle
            key={index}
            cx="50"
            cy="50"
            r={radius}
            className="canvas-radar__range"
            style={{
              fill: `color-mix(in oklab, var(--scoped-bg) ${100 - colorPercent}%, currentColor)`,
            }}
          />
        );
      })}
    </svg>
  );
}
