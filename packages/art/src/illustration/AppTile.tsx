import type { ReactNode } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';

import { outline } from './motion';

export const appTileLabelWidth = (label: string) => label.length * 10.5 + 36;

// A rounded, outlined app icon centered on the origin, with an optional label
// pill to its right. The icon is an image (`href`) or drawn content
// (`children`, centered on the origin). Position it with a transform on a
// parent group.
export function AppTile({
  href,
  size,
  clipId,
  label,
  fill = 'fill-white',
  children,
}: {
  href?: string;
  size: number;
  clipId: string;
  label?: string;
  fill?: string;
  children?: ReactNode;
}) {
  const half = size / 2;
  const labelX = half + 16;
  const labelWidth = label ? appTileLabelWidth(label) : 0;
  return (
    <>
      <clipPath id={clipId}>
        <rect x={-half} y={-half} width={size} height={size} rx={24} />
      </clipPath>
      <rect
        x={-half}
        y={-half}
        width={size}
        height={size}
        rx={24}
        className={fill}
      />
      {href ? (
        <image
          href={href}
          x={-half}
          y={-half}
          width={size}
          height={size}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <g clipPath={`url(#${clipId})`}>{children}</g>
      )}
      <rect
        x={-half}
        y={-half}
        width={size}
        height={size}
        rx={24}
        fill="none"
        className={outline}
        strokeWidth={6}
      />
      {label ? (
        <>
          <rect
            x={labelX}
            y={-19}
            width={labelWidth}
            height={38}
            rx={19}
            className={cx('fill-white', outline)}
            strokeWidth={4}
          />
          <text
            x={labelX + labelWidth / 2}
            y={6.5}
            textAnchor="middle"
            fontSize={18}
            fontWeight={900}
            className="fill-navy-taupe"
          >
            {label}
          </text>
        </>
      ) : null}
    </>
  );
}
