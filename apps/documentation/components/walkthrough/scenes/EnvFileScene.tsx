'use client';

import { Copy } from 'lucide-react';
import { useId } from 'react';

import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import {
  backOut,
  grow,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { CheckStamp, Click, GroundShadow, Icon, pivot, smooth } from './parts';

// The plain-text file holding Neon's snippet. `edit` deletes the # in front
// of the second address, `check` picks out the two lines that must start with
// DATABASE_URL, and `copy` selects everything and copies it.
type Mode = 'edit' | 'check' | 'copy';

const FRAME = { x: 150, y: 70, width: 900, height: 300 } as const;
const CONTENT = browserContent(FRAME);
const SIZE = 21;
// The advance of one monospace character, as a share of the font size.
const CHAR = SIZE * 0.6;
const TEXT_X = CONTENT.x + 40;
const lineY = (index: number) => CONTENT.y + 70 + index * 56;

const POOLED = 'DATABASE_URL="postgresql://…-pooler.neon.tech/neondb"';
const COMMENT = '# uncomment next line if you use Prisma <5.10';
const UNPOOLED = 'DATABASE_URL_UNPOOLED="postgresql://…neon.tech/neondb"';
const LINES = [POOLED, COMMENT, UNPOOLED] as const;

const ACT_AT = 1.3;
const STAMP_AT = 2.5;
const END = 3.2;

function EnvFileScene({ mode }: { mode: Mode }) {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const win = backOut(segment(t, 0, 0.5));
  const deleted = mode === 'edit' ? smooth(segment(t, ACT_AT + 0.1, 0.4)) : 1;

  const band = (index: number, k: number, fill: string) => {
    if (k <= 0) return null;
    const width = LINES[index]!.length * CHAR + 24;
    return (
      <rect
        x={TEXT_X - 12}
        y={lineY(index) - 30}
        width={width * k}
        height={44}
        rx={10}
        className={fill}
      />
    );
  };

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow
        cx={FRAME.x + FRAME.width / 2}
        cy={415}
        rx={FRAME.width / 2}
      />
      <g
        transform={`translate(0 ${bob}) ${pivot(FRAME.x + FRAME.width / 2, FRAME.y + FRAME.height / 2, win)}`}
      >
        <BrowserWindow
          frame={FRAME}
          url="database.txt"
          clipId={`${id}-window`}
          urlWidth={160}
        >
          {mode === 'edit'
            ? band(2, segment(t, ACT_AT + 0.6, 0.3), 'fill-sea-green/25')
            : null}
          {mode === 'check'
            ? [0, 2].map((index, order) => (
                <g key={index}>
                  {band(
                    index,
                    smooth(segment(t, ACT_AT + order * 0.5, 0.4)),
                    'fill-mustard/40',
                  )}
                </g>
              ))
            : null}
          {mode === 'copy'
            ? LINES.map((_, index) => (
                <g key={index}>
                  {band(
                    index,
                    smooth(segment(t, ACT_AT + index * 0.2, 0.3)),
                    'fill-cerulean-blue/30',
                  )}
                </g>
              ))
            : null}
          {LINES.map((line, index) => {
            const k = segment(t, 0.4 + index * 0.12, 0.3);
            const isUnpooled = index === 2;
            return (
              <g key={line} opacity={k} className="font-monospace">
                {isUnpooled ? (
                  <>
                    <text
                      x={TEXT_X}
                      y={lineY(index)}
                      fontSize={SIZE}
                      fontWeight={700}
                      className="fill-navy-taupe/50"
                      opacity={1 - deleted}
                    >
                      #
                    </text>
                    <text
                      x={TEXT_X + 2 * CHAR * (1 - deleted)}
                      y={lineY(index)}
                      fontSize={SIZE}
                      fontWeight={700}
                      className="fill-navy-taupe"
                      opacity={0.5 + 0.5 * deleted}
                    >
                      {line}
                    </text>
                  </>
                ) : (
                  <text
                    x={TEXT_X}
                    y={lineY(index)}
                    fontSize={SIZE}
                    fontWeight={700}
                    className={
                      line.startsWith('#')
                        ? 'fill-navy-taupe/50'
                        : 'fill-navy-taupe'
                    }
                  >
                    {line}
                  </text>
                )}
              </g>
            );
          })}
          {mode === 'edit' ? (
            <Click
              t={t}
              from={[CONTENT.right - 80, CONTENT.bottom - 10]}
              to={[TEXT_X + CHAR / 2, lineY(2) - 8]}
              at={ACT_AT}
              leave={ACT_AT + 0.5}
            />
          ) : null}
        </BrowserWindow>
      </g>
      {mode === 'copy' ? (
        <g
          transform={`translate(${FRAME.x + FRAME.width - 150} ${FRAME.y + FRAME.height + 10 + bob}) scale(${grow(backOut(segment(t, ACT_AT + 0.8, 0.4)))})`}
        >
          <rect
            x={-80}
            y={-24}
            width={160}
            height={48}
            rx={24}
            className={cx('fill-white', outline)}
            strokeWidth={5}
          />
          <Icon icon={Copy} x={-44} y={0} size={22} />
          <text
            x={12}
            y={8}
            textAnchor="middle"
            fontSize={22}
            fontWeight={900}
            className="fill-navy-taupe"
          >
            Copied
          </text>
        </g>
      ) : null}
      <CheckStamp
        x={FRAME.x + FRAME.width - 30}
        y={FRAME.y + 40 + bob}
        k={backOut(segment(t, STAMP_AT, 0.5))}
        t={t}
      />
    </svg>
  );
}

export const EnvEditScene = () => <EnvFileScene mode="edit" />;
export const EnvCheckScene = () => <EnvFileScene mode="check" />;
export const EnvCopyScene = () => <EnvFileScene mode="copy" />;
