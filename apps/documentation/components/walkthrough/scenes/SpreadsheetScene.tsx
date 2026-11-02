'use client';

import { Fragment, useId } from 'react';

import {
  backOut,
  grow,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  CheckStamp,
  Click,
  GroundShadow,
  smooth,
  TextBar,
  type Point,
} from './parts';
import {
  AppWindow,
  appContent,
  DataFile,
  ROSTER,
  SheetGrid,
  sheetLayout,
} from './rosterParts';

// The reader's list in a spreadsheet. `layout` slides a heading row in above
// the names, `name` types "name" into the first heading, `unique` tells two
// Kwames apart, `csv` folds the sheet into a .csv file, and `check` stamps
// that file with the three things to check.
type Mode = 'layout' | 'name' | 'unique' | 'csv' | 'check';

const FRAME = { x: 300, y: 40, width: 600, height: 360 } as const;
const CONTENT = appContent(FRAME);
const WIDTHS = [180, 230, 140] as const;
const ROW = 44;
const SHEET = sheetLayout(CONTENT.x, CONTENT.y, WIDTHS, ROW);
const HEADINGS = ['name', 'occupation', 'gender'] as const;
const KWAMES = [
  ['Kwame', 'Kwame K.', 'Teacher', 'male'],
  ['Lisa', 'Lisa', 'Student', 'female'],
  ['Kwame', 'Kwame N.', 'Student', 'male'],
  ['Bart', 'Bart', 'Student', 'male'],
  ['Maggie', 'Maggie', '', 'female'],
] as const;
const CHECKS = ['ends in .csv', 'first heading is name', 'no two names match'];

const ACT_AT = 1.2;
const END: Record<Mode, number> = {
  layout: 3.1,
  name: 3.2,
  unique: 3.3,
  csv: 2.8,
  check: 2.6,
};

const cellText = (col: number, row: number, text: string, bold = false) => (
  <text
    x={SHEET.colX(col) + 14}
    y={SHEET.rowY(row) + ROW / 2 + 7}
    fontSize={19}
    fontWeight={bold ? 900 : 700}
    className="fill-navy-taupe"
  >
    {text}
  </text>
);

function Sheet({ mode, t }: { mode: Mode; t: number }) {
  const shift = mode === 'layout' ? smooth(segment(t, ACT_AT, 0.4)) : 1;
  const heading =
    mode === 'layout' ? backOut(segment(t, ACT_AT + 0.3, 0.45)) : 1;
  const typed =
    mode === 'name'
      ? Math.floor(segment(t, ACT_AT + 0.3, 0.6) * HEADINGS[0].length + 0.001)
      : HEADINGS[0].length;
  const selected = mode === 'name' ? segment(t, ACT_AT, 0.15) : 0;
  const glow = mode === 'unique' ? smooth(segment(t, 0.9, 0.4)) : 0;
  const renamed = mode === 'unique' ? segment(t, 1.9, 0.3) : 0;
  const rows =
    mode === 'unique'
      ? KWAMES.map(([before, after, occupation, gender]) => ({
          before,
          after,
          occupation,
          gender,
        }))
      : ROSTER.map(([name, occupation, gender]) => ({
          before: name,
          after: name,
          occupation,
          gender,
        }));

  return (
    <>
      <SheetGrid
        x={CONTENT.x}
        y={CONTENT.y}
        widths={WIDTHS}
        rows={7}
        rowHeight={ROW}
      />
      {mode === 'unique'
        ? [0, 2].map((row) => (
            <rect
              key={row}
              x={SHEET.colX(0) + 4}
              y={SHEET.rowY(row + 1) + 4}
              width={WIDTHS[0] - 8}
              height={ROW - 8}
              rx={8}
              className={
                renamed > 0.5 ? 'fill-sea-green/30' : 'fill-neon-coral/30'
              }
              opacity={glow * (renamed > 0.5 ? 1 : 0.7 + Math.sin(t * 9) * 0.3)}
            />
          ))
        : null}
      <g
        transform={`translate(0 ${-(1 - heading) * 20})`}
        opacity={Math.min(1, heading)}
      >
        <rect
          x={SHEET.colX(0)}
          y={SHEET.rowY(0)}
          width={SHEET.right - SHEET.colX(0)}
          height={ROW}
          className="fill-mustard/25"
        />
        {mode === 'layout'
          ? WIDTHS.map((width, col) => (
              <TextBar
                key={col}
                x={SHEET.colX(col) + 16}
                y={SHEET.rowY(0) + ROW / 2}
                width={width * 0.45}
                className="stroke-navy-taupe/35"
              />
            ))
          : HEADINGS.map((text, col) => (
              <Fragment key={text}>
                {cellText(
                  col,
                  0,
                  col === 0 ? text.slice(0, typed) : text,
                  true,
                )}
              </Fragment>
            ))}
      </g>
      {mode === 'name' ? (
        <>
          <rect
            x={SHEET.colX(0) + 2}
            y={SHEET.rowY(0) + 2}
            width={WIDTHS[0] - 4}
            height={ROW - 4}
            fill="none"
            className="stroke-cerulean-blue"
            strokeWidth={4}
            opacity={selected}
          />
          {selected > 0 && typed < HEADINGS[0].length ? (
            <line
              x1={SHEET.colX(0) + 16 + typed * 11}
              y1={SHEET.rowY(0) + 12}
              x2={SHEET.colX(0) + 16 + typed * 11}
              y2={SHEET.rowY(0) + ROW - 12}
              className="stroke-navy-taupe"
              strokeWidth={3}
            />
          ) : null}
        </>
      ) : null}
      <g transform={`translate(0 ${(shift - 1) * ROW})`}>
        {rows.map((row, index) => {
          const k = segment(t, 0.3 + index * 0.08, 0.3);
          const swapped = row.before !== row.after;
          return (
            <g key={index} opacity={k}>
              {swapped ? (
                <>
                  <g opacity={1 - renamed}>
                    {cellText(0, index + 1, row.before)}
                  </g>
                  <g opacity={renamed}>{cellText(0, index + 1, row.after)}</g>
                </>
              ) : (
                cellText(0, index + 1, row.before)
              )}
              {cellText(1, index + 1, row.occupation)}
              {cellText(2, index + 1, row.gender)}
            </g>
          );
        })}
      </g>
    </>
  );
}

function SpreadsheetScene({ mode }: { mode: Mode }) {
  const end = END[mode];
  const { ref, time } = useIllustrationClock(end, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const win = backOut(segment(t, 0, 0.5));
  const centerX = FRAME.x + FRAME.width / 2;
  const centerY = FRAME.y + FRAME.height / 2;
  const fold = mode === 'csv' ? smooth(segment(t, ACT_AT, 0.5)) : 0;
  const file =
    mode === 'csv'
      ? backOut(segment(t, ACT_AT + 0.4, 0.5))
      : mode === 'check'
        ? backOut(segment(t, 0, 0.5))
        : 0;
  const fileX = mode === 'check' ? 400 : centerX;
  const target: Point = [SHEET.colX(0) + 60, SHEET.rowY(0) + ROW / 2];

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow
        cx={mode === 'check' ? 600 : centerX}
        cy={420}
        rx={mode === 'check' ? 360 : (FRAME.width / 2) * (1 - fold * 0.7)}
      />
      {mode !== 'check' && fold < 1 ? (
        <g
          transform={`translate(0 ${bob}) translate(${centerX} ${centerY}) scale(${grow(win * (1 - fold * 0.75))} ${grow(win * (1 - fold * 0.5))}) translate(${-centerX} ${-centerY})`}
          opacity={mode === 'csv' ? 1 - segment(t, ACT_AT + 0.3, 0.2) : 1}
        >
          <AppWindow
            frame={FRAME}
            title="classmates.xlsx"
            clipId={`${id}-window`}
          >
            <Sheet mode={mode} t={t} />
            {mode === 'name' ? (
              <Click
                t={t}
                from={[CONTENT.right - 60, CONTENT.bottom - 10]}
                to={target}
                at={ACT_AT}
                leave={ACT_AT + 0.4}
              />
            ) : null}
          </AppWindow>
        </g>
      ) : null}
      {file > 0 ? (
        <g
          transform={`translate(${fileX} ${centerY + bob}) scale(${grow(file * 1.1)})`}
        >
          <DataFile ext=".csv" />
        </g>
      ) : null}
      {mode === 'check'
        ? CHECKS.map((label, index) => {
            const at = 0.7 + index * 0.45;
            const y = 130 + index * 100;
            return (
              <g key={label}>
                <CheckStamp
                  x={580}
                  y={y + bob}
                  k={backOut(segment(t, at, 0.5))}
                  t={t + index}
                  r={30}
                />
                <g
                  opacity={segment(t, at + 0.15, 0.3)}
                  transform={`translate(${(1 - smooth(segment(t, at + 0.15, 0.3))) * -16} ${bob})`}
                >
                  <rect
                    x={630}
                    y={y - 24}
                    width={label.length * 12 + 40}
                    height={48}
                    rx={24}
                    className={cx('fill-white', outline)}
                    strokeWidth={4}
                  />
                  <text
                    x={650}
                    y={y + 8}
                    fontSize={22}
                    fontWeight={900}
                    className="fill-navy-taupe"
                  >
                    {label}
                  </text>
                </g>
              </g>
            );
          })
        : null}
      {mode === 'layout' || mode === 'name' || mode === 'unique' ? (
        <CheckStamp
          x={FRAME.x + FRAME.width + 4}
          y={FRAME.y + 4 + bob}
          k={backOut(segment(t, end - 0.7, 0.5))}
          t={t}
        />
      ) : null}
    </svg>
  );
}

export const SheetLayoutScene = () => <SpreadsheetScene mode="layout" />;
export const SheetNameScene = () => <SpreadsheetScene mode="name" />;
export const SheetUniqueScene = () => <SpreadsheetScene mode="unique" />;
export const SheetCsvScene = () => <SpreadsheetScene mode="csv" />;
export const SheetCheckScene = () => <SpreadsheetScene mode="check" />;
