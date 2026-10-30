'use client';

import { FileAudio, FileImage, FileVideo, KeyRound } from 'lucide-react';
import { useId } from 'react';

import { AppTile } from '@codaco/art/illustration/AppTile';
import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import { DottedPath } from '@codaco/art/illustration/DottedPath';
import {
  backOut,
  grow,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { GroundShadow, Icon, link, smooth } from './parts';

// A key travels from UploadThing to Fresco; then the study's files can travel
// the other way, into storage.
const WINDOW = { x: 70, y: 90, width: 420, height: 280 } as const;
const CONTENT = browserContent(WINDOW);
const FOLDER: readonly [number, number] = [900, 250];
const KEY_AT = 0.6;
const KEY_TRAVEL = 1;
const FILES_AT = 1.9;
const FILE_TRAVEL = 0.9;
const END = 3.6;

const files = [
  { icon: FileImage, fill: 'fill-neon-coral' },
  { icon: FileAudio, fill: 'fill-sea-serpent' },
  { icon: FileVideo, fill: 'fill-purple-pizazz' },
] as const;

function Folder({ x, y, open }: { x: number; y: number; open: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M-130 -70 H-50 L-30 -94 H130 V90 H-130 Z"
        className={cx('fill-mustard', outline)}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <path
        d={`M-130 ${-40 + open * 8} H130 V90 H-130 Z`}
        className={cx('fill-neon-carrot', outline)}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <text
        y={40}
        textAnchor="middle"
        fontSize={24}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        UploadThing
      </text>
    </g>
  );
}

export function StorageScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const win = backOut(segment(t, 0, 0.5));
  const folder = backOut(segment(t, 0.2, 0.5));
  const path = link(
    [WINDOW.x + WINDOW.width + 14, 230],
    [FOLDER[0] - 144, 230],
  );
  const keyU = smooth(segment(t, KEY_AT, KEY_TRAVEL));
  const keyShown = t > KEY_AT && keyU < 1;
  const [kx, ky] = path.at(1 - keyU);
  const keyed = backOut(segment(t, KEY_AT + KEY_TRAVEL - 0.05, 0.4));
  const midX = (CONTENT.x + CONTENT.right) / 2;
  const midY = (CONTENT.y + CONTENT.bottom) / 2;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow
        cx={WINDOW.x + WINDOW.width / 2}
        cy={410}
        rx={WINDOW.width / 2}
      />
      <GroundShadow cx={FOLDER[0]} cy={410} rx={140} />
      <g opacity={segment(t, 0.4, 0.3)}>
        <DottedPath d={path.d} time={time} />
      </g>
      <g
        transform={`translate(${WINDOW.x + WINDOW.width / 2} ${WINDOW.y + WINDOW.height / 2 + bob}) scale(${grow(win)}) translate(${-WINDOW.x - WINDOW.width / 2} ${-WINDOW.y - WINDOW.height / 2})`}
      >
        <BrowserWindow
          frame={WINDOW}
          url="your-study.netlify.app/setup"
          clipId={`${id}-window`}
          urlWidth={270}
        >
          <rect
            x={CONTENT.x}
            y={CONTENT.y}
            width={CONTENT.right - CONTENT.x}
            height={CONTENT.bottom - CONTENT.y}
            className="fill-navy-taupe/5"
          />
          <g transform={`translate(${midX} ${midY - 14})`}>
            <AppTile
              href="/assets/walkthroughs/fresco-icon.png"
              size={90}
              clipId={`${id}-fresco`}
            />
          </g>
          <g
            transform={`translate(${midX} ${midY + 62}) scale(${grow(keyed)})`}
          >
            <rect
              x={-66}
              y={-18}
              width={132}
              height={36}
              rx={18}
              className={cx('fill-mustard', outline)}
              strokeWidth={4}
            />
            <Icon icon={KeyRound} x={-40} y={0} size={22} />
            <text
              x={10}
              y={6}
              textAnchor="middle"
              fontSize={15}
              fontWeight={900}
              className="fill-navy-taupe"
            >
              Saved
            </text>
          </g>
        </BrowserWindow>
      </g>
      <g
        transform={`translate(${FOLDER[0]} ${FOLDER[1] + bob}) scale(${grow(folder)}) translate(${-FOLDER[0]} ${-FOLDER[1]})`}
      >
        <Folder
          x={FOLDER[0]}
          y={FOLDER[1]}
          open={segment(t, FILES_AT + FILE_TRAVEL - 0.2, 0.3)}
        />
      </g>
      {keyShown ? (
        <g transform={`translate(${kx} ${ky}) rotate(${-20 + keyU * 20})`}>
          <circle
            r={26}
            className={cx('fill-mustard', outline)}
            strokeWidth={4}
          />
          <Icon icon={KeyRound} x={0} y={0} size={28} />
        </g>
      ) : null}
      {files.map((file, index) => {
        const since = t - FILES_AT - index * 0.25;
        const u = smooth(segment(since, 0, FILE_TRAVEL));
        if (since <= 0 || u >= 1) return null;
        const [x, y] = path.at(u);
        const k =
          backOut(segment(since, 0, 0.3)) * (1 - segment(u, 0.85, 0.15));
        return (
          <g
            key={index}
            transform={`translate(${x} ${y - Math.sin(Math.PI * u) * 30}) rotate(${(index - 1) * 10}) scale(${grow(k)})`}
          >
            <rect
              x={-26}
              y={-32}
              width={52}
              height={64}
              rx={10}
              className={cx(file.fill, outline)}
              strokeWidth={4}
            />
            <Icon
              icon={file.icon}
              x={0}
              y={0}
              size={28}
              className="text-white"
            />
          </g>
        );
      })}
    </svg>
  );
}
