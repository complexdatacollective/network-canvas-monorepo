'use client';

import { FileText, GitFork } from 'lucide-react';
import { useId } from 'react';

import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import {
  backOut,
  grow,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';

import { CheckStamp, GroundShadow, Icon, pivot, TextBar } from './parts';

// The reader's copy on GitHub: their name and the copy's name, a note that it
// came from Fresco, then its files. A ring picks out the name to check.
const FRAME = { x: 300, y: 40, width: 600, height: 360 } as const;
const CONTENT = browserContent(FRAME);
const NAME = { x: CONTENT.x + 24, y: CONTENT.y + 22, width: 270, height: 50 };
const RING_AT = 1.6;
const STAMP_AT = 2.2;
const END = 2.9;

const files = [210, 160, 240, 130] as const;

export function ForkedScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const win = backOut(segment(t, 0, 0.5));
  const ring = backOut(segment(t, RING_AT, 0.4));
  const ringX = NAME.x + NAME.width / 2;
  const ringY = NAME.y + NAME.height / 2;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow
        cx={FRAME.x + FRAME.width / 2}
        cy={420}
        rx={FRAME.width / 2}
      />
      <g
        transform={`translate(0 ${bob}) ${pivot(FRAME.x + FRAME.width / 2, FRAME.y + FRAME.height / 2, win)}`}
      >
        <BrowserWindow
          frame={FRAME}
          url="github.com/you/your-study"
          clipId={`${id}-window`}
          urlWidth={280}
        >
          <g opacity={segment(t, 0.4, 0.3)}>
            <Icon icon={GitFork} x={NAME.x + 22} y={ringY} size={28} />
            <text
              x={NAME.x + 46}
              y={ringY + 9}
              fontSize={26}
              fontWeight={900}
              className="fill-navy-taupe"
            >
              you / your-study
            </text>
            <text
              x={NAME.x + 46}
              y={ringY + 42}
              fontSize={16}
              fontWeight={700}
              className="fill-navy-taupe/60"
            >
              forked from complexdatacollective/Fresco
            </text>
          </g>
          {files.map((width, index) => {
            const k = backOut(segment(t, 0.7 + index * 0.12, 0.4));
            const y = CONTENT.y + 130 + index * 40;
            return (
              <g
                key={index}
                transform={`translate(${(1 - k) * -20} 0)`}
                opacity={Math.min(1, k)}
              >
                <Icon icon={FileText} x={CONTENT.x + 46} y={y} size={22} />
                <TextBar x={CONTENT.x + 72} y={y} width={width} />
                <TextBar
                  x={CONTENT.right - 120}
                  y={y}
                  width={80}
                  className="stroke-navy-taupe/12"
                />
              </g>
            );
          })}
          <rect
            x={NAME.x - 8}
            y={NAME.y}
            width={NAME.width + 16}
            height={NAME.height}
            rx={14}
            fill="none"
            className="stroke-mustard"
            strokeWidth={6}
            transform={`translate(${ringX} ${ringY}) scale(${grow(ring)}) translate(${-ringX} ${-ringY})`}
            opacity={ring > 0 ? 1 : 0}
          />
        </BrowserWindow>
      </g>
      <CheckStamp
        x={FRAME.x + FRAME.width - 30}
        y={FRAME.y + 40 + bob}
        k={backOut(segment(t, STAMP_AT, 0.5))}
        t={t}
        fill="fill-purple-pizazz"
      />
    </svg>
  );
}
