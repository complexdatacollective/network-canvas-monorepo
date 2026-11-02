import type { ReactNode } from 'react';

import { grow, outline } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { TextBar } from './parts';

// The example roster the walkthrough offers, simpsons-roster.csv.
export const ROSTER = [
  ['Marge', 'Homemaker', 'female'],
  ['Homer', 'Nuclear Technician', 'male'],
  ['Lisa', 'Student', 'female'],
  ['Bart', 'Student', 'male'],
  ['Maggie', '', 'female'],
] as const;

export const NODE_FILL = 'fill-neon-coral';

type Frame = { x: number; y: number; width: number; height: number };

const BAR = 44;
const RADIUS = 20;

export const appContent = (frame: Frame) => ({
  x: frame.x + 3,
  y: frame.y + BAR + 3,
  right: frame.x + frame.width - 3,
  bottom: frame.y + frame.height - 3,
});

// A desktop app's window: traffic lights and a centered title in place of
// BrowserWindow's address bar.
export function AppWindow({
  frame,
  title,
  clipId,
  children,
}: {
  frame: Frame;
  title: string;
  clipId: string;
  children?: ReactNode;
}) {
  const content = appContent(frame);
  const barY = frame.y + BAR;
  return (
    <>
      <rect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        rx={24}
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
            cx={frame.x + 28 + index * 20}
            cy={frame.y + 22}
            r={6}
            className={fill}
          />
        ),
      )}
      <text
        x={frame.x + frame.width / 2}
        y={frame.y + 28}
        textAnchor="middle"
        fontSize={16}
        fontWeight={900}
        className="fill-navy-taupe/75"
      >
        {title}
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

export const CARD_WIDTH = 220;
export const CARD_HEIGHT = 64;
const DETAIL_HEIGHT = 34;

// A roster card with its top-left corner at the origin: a person dot and a
// name, and a detail line that `detailK` (0 → 1) grows in below. `children`
// are drawn on the card, behind its text.
export function NameCard({
  name,
  width = CARD_WIDTH,
  detail,
  detailK = 0,
  className = 'fill-white',
  children,
}: {
  name: string;
  width?: number;
  detail?: string;
  detailK?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <rect
        width={width}
        height={CARD_HEIGHT + DETAIL_HEIGHT * detailK}
        rx={18}
        className={cx(className, outline)}
        strokeWidth={5}
      />
      {children}
      <circle
        cx={34}
        cy={32}
        r={13}
        className={cx(NODE_FILL, outline)}
        strokeWidth={4}
      />
      <text
        x={60}
        y={40}
        fontSize={22}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        {name}
      </text>
      {detail && detailK > 0 ? (
        <text
          x={60}
          y={76}
          fontSize={18}
          fontWeight={800}
          className="fill-navy-taupe/60"
          opacity={detailK}
        >
          {detail}
        </text>
      ) : null}
    </>
  );
}

// A person as an interview draws them: a filled circle with their name.
export function PersonNode({
  x,
  y,
  r,
  name,
  fill = NODE_FILL,
}: {
  x: number;
  y: number;
  r: number;
  name: string;
  fill?: string;
}) {
  return (
    <>
      <circle
        cx={x}
        cy={y}
        r={r}
        className={cx(fill, outline)}
        strokeWidth={6}
      />
      <text
        x={x}
        y={y + r * 0.15}
        textAnchor="middle"
        fontSize={r * 0.42}
        fontWeight={900}
        className="fill-white"
      >
        {name}
      </text>
    </>
  );
}

const BARS = [90, 64, 96, 56, 80] as const;

// A file centered on the origin: a page with a folded corner, a few lines of
// content and a tag naming its type.
export function DataFile({
  ext,
  tag = 'fill-mustard',
  lines = 4,
}: {
  ext: string;
  tag?: string;
  lines?: number;
}) {
  const tagWidth = ext.length * 15 + 30;
  return (
    <>
      <path
        d="M-75 -95 H35 L75 -55 V95 H-75 Z"
        className={cx('fill-white', outline)}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <path
        d="M35 -95 V-55 H75 Z"
        className={cx('fill-navy-taupe/10', outline)}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      {BARS.slice(0, lines).map((width, index) => (
        <TextBar
          key={index}
          x={-50}
          y={-50 + index * (lines > 4 ? 22 : 26)}
          width={width}
          className={
            index === 0 ? 'stroke-purple-pizazz/50' : 'stroke-navy-taupe/20'
          }
        />
      ))}
      <rect
        x={-95}
        y={46}
        width={tagWidth}
        height={42}
        rx={21}
        className={cx(tag, outline)}
        strokeWidth={5}
      />
      <text
        x={-95 + tagWidth / 2}
        y={75}
        textAnchor="middle"
        fontSize={22}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        {ext}
      </text>
    </>
  );
}

const GUTTER = 44;
const LETTERS = 30;

// Where a spreadsheet's cells sit: `row` 0 is the first numbered row.
export const sheetLayout = (
  x: number,
  y: number,
  widths: readonly number[],
  rowHeight: number,
) => ({
  colX: (col: number) =>
    x + GUTTER + widths.slice(0, col).reduce((sum, w) => sum + w, 0),
  rowY: (row: number) => y + LETTERS + row * rowHeight,
  right: x + GUTTER + widths.reduce((sum, w) => sum + w, 0),
});

// A spreadsheet's grid: lettered columns, numbered rows and cell lines.
export function SheetGrid({
  x,
  y,
  widths,
  rows,
  rowHeight,
}: {
  x: number;
  y: number;
  widths: readonly number[];
  rows: number;
  rowHeight: number;
}) {
  const layout = sheetLayout(x, y, widths, rowHeight);
  const bottom = layout.rowY(rows);
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={layout.right - x}
        height={LETTERS}
        className="fill-navy-taupe/8"
      />
      <rect
        x={x}
        y={y}
        width={GUTTER}
        height={bottom - y}
        className="fill-navy-taupe/8"
      />
      {widths.map((width, col) => (
        <text
          key={col}
          x={layout.colX(col) + width / 2}
          y={y + 21}
          textAnchor="middle"
          fontSize={15}
          fontWeight={800}
          className="fill-navy-taupe/50"
        >
          {String.fromCharCode(65 + col)}
        </text>
      ))}
      {Array.from({ length: rows }, (_, row) => (
        <text
          key={row}
          x={x + GUTTER / 2}
          y={layout.rowY(row) + rowHeight / 2 + 5}
          textAnchor="middle"
          fontSize={15}
          fontWeight={800}
          className="fill-navy-taupe/50"
        >
          {row + 1}
        </text>
      ))}
      {Array.from({ length: rows + 1 }, (_, row) => (
        <line
          key={`row-${row}`}
          x1={x}
          y1={layout.rowY(row)}
          x2={layout.right}
          y2={layout.rowY(row)}
          className="stroke-navy-taupe/15"
          strokeWidth={2}
        />
      ))}
      {widths.map((_, col) => (
        <line
          key={`col-${col}`}
          x1={layout.colX(col)}
          y1={y}
          x2={layout.colX(col)}
          y2={bottom}
          className="stroke-navy-taupe/15"
          strokeWidth={2}
        />
      ))}
    </g>
  );
}

// An "or" between two options, popped in by `k`.
export function OrMark({ x, y, k }: { x: number; y: number; k: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${grow(k)})`}>
      <circle r={32} className={cx('fill-white', outline)} strokeWidth={5} />
      <text
        y={8}
        textAnchor="middle"
        fontSize={22}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        or
      </text>
    </g>
  );
}
