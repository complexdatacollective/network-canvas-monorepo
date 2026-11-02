'use client';

import { useId } from 'react';

import { Badge } from '@codaco/art/illustration/Badge';
import {
  backOut,
  grow,
  inCubic,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { CheckStamp, GroundShadow, pivot, TextBar } from './parts';
import {
  AppWindow,
  appContent,
  DataFile,
  OrMark,
  SheetGrid,
  sheetLayout,
} from './rosterParts';

// The reader's own list in a spreadsheet beside the five-person example
// file, stamped "Example".
const SHEET_FRAME = { x: 120, y: 50, width: 520, height: 330 } as const;
const SHEET_CONTENT = appContent(SHEET_FRAME);
const WIDTHS = [190, 150, 130] as const;
const ROW = 42;
const SHEET = sheetLayout(SHEET_CONTENT.x, SHEET_CONTENT.y, WIDTHS, ROW);
const FILE_X = 920;
const FILE_Y = 220;

export function RosterFilesScene() {
  const END = 2.2;
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const win = backOut(segment(t, 0, 0.5));
  const file = backOut(segment(t, 0.6, 0.5));
  const badge = backOut(segment(t, 1.3, 0.5));
  const or = backOut(segment(t, 0.9, 0.4));

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow
        cx={SHEET_FRAME.x + SHEET_FRAME.width / 2}
        cy={420}
        rx={SHEET_FRAME.width / 2}
      />
      <GroundShadow cx={FILE_X} cy={420} rx={110} />
      <g
        transform={`translate(0 ${bob}) ${pivot(SHEET_FRAME.x + SHEET_FRAME.width / 2, SHEET_FRAME.y + SHEET_FRAME.height / 2, win)}`}
      >
        <AppWindow frame={SHEET_FRAME} title="my-list.xlsx" clipId={id}>
          <SheetGrid
            x={SHEET_CONTENT.x}
            y={SHEET_CONTENT.y}
            widths={WIDTHS}
            rows={7}
            rowHeight={ROW}
          />
          {Array.from({ length: 7 }, (_, row) =>
            WIDTHS.map((width, col) => (
              <TextBar
                key={`${row}-${col}`}
                x={SHEET.colX(col) + 16}
                y={SHEET.rowY(row) + ROW / 2}
                width={width * (0.3 + ((row * 3 + col * 5) % 4) * 0.1)}
                className={
                  row === 0 ? 'stroke-navy-taupe/35' : 'stroke-navy-taupe/20'
                }
              />
            )),
          )}
        </AppWindow>
      </g>
      <OrMark x={745} y={215 + bob} k={or} />
      <g
        transform={`translate(${FILE_X} ${FILE_Y + bob}) scale(${grow(file)})`}
      >
        <DataFile ext=".csv" lines={5} />
      </g>
      <g
        transform={`translate(${FILE_X + 100} ${FILE_Y - 115 + bob}) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(badge)})`}
      >
        <Badge r={52}>
          <text
            y={8}
            textAnchor="middle"
            fontSize={21}
            fontWeight={900}
            className="fill-navy-taupe"
          >
            Example
          </text>
        </Badge>
      </g>
    </svg>
  );
}

// The example file falls into the reader's Downloads folder.
const FOLDER_X = 600;
const FOLDER_TOP = 270;
const FOLDER_WIDTH = 300;
const FOLDER_HEIGHT = 140;
const DROP_FROM = 90;
const DROP_TO = 190;
const DROP_AT = 0.9;
const LAND_AT = 1.4;

export function RosterDownloadScene() {
  const END = 2.6;
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const folder = backOut(segment(t, 0, 0.5));
  const file = backOut(segment(t, 0.4, 0.4));
  const fall = inCubic(segment(t, DROP_AT, LAND_AT - DROP_AT));
  const fileY = DROP_FROM + (DROP_TO - DROP_FROM) * fall;
  const squash =
    Math.sin(Math.PI * segment(t, LAND_AT, 0.35)) *
    (1 - segment(t, LAND_AT, 0.35)) *
    0.12;
  const left = FOLDER_X - FOLDER_WIDTH / 2;
  const bottom = FOLDER_TOP + FOLDER_HEIGHT;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={FOLDER_X} cy={425} rx={FOLDER_WIDTH / 2} />
      <g
        transform={`translate(0 ${bob}) translate(${FOLDER_X} ${bottom}) scale(${grow(folder * (1 + squash))} ${grow(folder * (1 - squash))}) translate(${-FOLDER_X} ${-bottom})`}
      >
        <path
          d={`M${left} ${FOLDER_TOP - 40} H${left + 100} L${left + 124} ${FOLDER_TOP - 16} H${left + FOLDER_WIDTH} V${bottom} H${left} Z`}
          className={cx('fill-mustard', outline)}
          strokeWidth={6}
          strokeLinejoin="round"
        />
        {file > 0 ? (
          <g
            transform={`translate(${FOLDER_X} ${fileY}) rotate(${(1 - fall) * -8}) scale(${grow(file * 0.85)})`}
          >
            <DataFile ext=".csv" lines={5} />
          </g>
        ) : null}
        <path
          d={`M${left - 14} ${FOLDER_TOP} H${left + FOLDER_WIDTH + 14} L${left + FOLDER_WIDTH} ${bottom} H${left} Z`}
          className={cx('fill-neon-carrot', outline)}
          strokeWidth={6}
          strokeLinejoin="round"
        />
        <text
          x={FOLDER_X}
          y={FOLDER_TOP + 82}
          textAnchor="middle"
          fontSize={26}
          fontWeight={900}
          className="fill-navy-taupe"
        >
          Downloads
        </text>
      </g>
      <CheckStamp
        x={FOLDER_X + FOLDER_WIDTH / 2 + 10}
        y={FOLDER_TOP - 20 + bob}
        k={backOut(segment(t, LAND_AT + 0.4, 0.5))}
        t={t}
      />
    </svg>
  );
}
