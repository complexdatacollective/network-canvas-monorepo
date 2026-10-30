import type { ReactNode } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';

import { outline } from './motion';

type Frame = { x: number; y: number; width: number; height: number };

const BAR = 50;
const RADIUS = 23;

// The area below the address bar, inside the outline, that content fills.
export const browserContent = (frame: Frame) => ({
  x: frame.x + 3,
  y: frame.y + BAR + 3,
  right: frame.x + frame.width - 3,
  bottom: frame.y + frame.height - 3,
});

// An outlined browser window: traffic lights, an address pill showing `url`,
// and `children` clipped to the content area. Children are drawn in the
// illustration's own coordinates; use `browserContent` to place them.
export function BrowserWindow({
  frame,
  url,
  clipId,
  urlWidth = 360,
  children,
}: {
  frame: Frame;
  url: string;
  clipId: string;
  urlWidth?: number;
  children?: ReactNode;
}) {
  const content = browserContent(frame);
  const barY = frame.y + BAR;
  return (
    <>
      <rect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        rx={26}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      <path
        d={`M${content.x} ${barY} L${content.right} ${barY}`}
        className={outline}
        strokeWidth={5}
      />
      {['fill-neon-coral', 'fill-mustard', 'fill-sea-green'].map(
        (fill, index) => (
          <circle
            key={fill}
            cx={frame.x + 30 + index * 22}
            cy={frame.y + 25}
            r={7}
            className={fill}
          />
        ),
      )}
      <rect
        x={frame.x + 106}
        y={frame.y + 12}
        width={urlWidth}
        height={26}
        rx={13}
        className="fill-navy-taupe/10"
      />
      <text
        x={frame.x + 122}
        y={frame.y + 30}
        fontSize={15}
        fontWeight={800}
        className="fill-navy-taupe/75"
      >
        {url}
      </text>
      <clipPath id={clipId}>
        <path
          d={`M${content.x} ${content.y} H${content.right} V${
            content.bottom - RADIUS
          } Q${content.right} ${content.bottom} ${content.right - RADIUS} ${
            content.bottom
          } H${content.x + RADIUS} Q${content.x} ${content.bottom} ${content.x} ${
            content.bottom - RADIUS
          } Z`}
        />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>{children}</g>
    </>
  );
}
