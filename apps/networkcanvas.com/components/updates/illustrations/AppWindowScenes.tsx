import { cx } from '@codaco/fresco-ui/utils/cva';

import { backOut, outline, segment, TAU } from './illustrationMotion';

type SceneProps = { shown: number };

const pop = (shown: number, delay: number) =>
  backOut(segment(shown, delay, 0.35));

function Page({ className = 'fill-white' }: { className?: string }) {
  return (
    <rect x={423} y={243} width={484} height={194} className={className} />
  );
}

export function HomeScene({ time }: { time: number }) {
  return (
    <g>
      <Page />
      <image
        href="/images/logos/network-canvas-mark.svg"
        x={633}
        y={282}
        width={64}
        height={64}
      />
      {[0, 1, 2].map((index) => (
        <circle
          key={index}
          cx={649 + index * 16}
          cy={374}
          r={5}
          className="fill-navy-taupe"
          opacity={
            0.2 + 0.6 * Math.max(0, Math.sin(TAU * time * 1.2 - index * 0.9))
          }
        />
      ))}
    </g>
  );
}

const stages = [
  { y: 280, dot: 'fill-sea-green', width: 110 },
  { y: 328, dot: 'fill-neon-coral', width: 80 },
  { y: 376, dot: 'fill-cerulean-blue', width: 128 },
] as const;

const previewNodes = [
  [764, 318, 'fill-neon-coral'],
  [826, 336, 'fill-sea-green'],
  [790, 378, 'fill-mustard'],
] as const;

export function ArchitectScene({ shown }: SceneProps) {
  return (
    <g>
      <Page />
      <line
        x1={470}
        y1={266}
        x2={470}
        y2={418}
        className="stroke-navy-taupe/15"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {stages.map((stage, index) => {
        const k = pop(shown, 0.05 + index * 0.12);
        return (
          <g
            key={stage.y}
            transform={`translate(${(1 - k) * -24} 0)`}
            opacity={Math.min(1, k)}
          >
            <circle
              cx={470}
              cy={stage.y}
              r={10}
              className={cx(stage.dot, outline)}
              strokeWidth={3}
            />
            <rect
              x={492}
              y={stage.y - 18}
              width={192}
              height={36}
              rx={10}
              className="fill-navy-taupe/5 stroke-navy-taupe/15"
              strokeWidth={2}
            />
            <rect
              x={506}
              y={stage.y - 5}
              width={stage.width}
              height={10}
              rx={5}
              className="fill-navy-taupe/25"
            />
          </g>
        );
      })}
      <rect
        x={712}
        y={262}
        width={170}
        height={160}
        rx={16}
        className="fill-navy-taupe"
        opacity={Math.min(1, pop(shown, 0.35))}
      />
      {previewNodes.map(([x, y, fill], index) => {
        const k = pop(shown, 0.45 + index * 0.1);
        return (
          <circle
            key={x}
            cx={x}
            cy={y}
            r={16 * k}
            className={cx(fill, 'stroke-white')}
            strokeWidth={3}
          />
        );
      })}
      <rect
        x={738}
        y={278}
        width={118}
        height={8}
        rx={4}
        className="fill-white/40"
        opacity={Math.min(1, pop(shown, 0.4))}
      />
    </g>
  );
}

const people = [
  [622, 332],
  [704, 340],
  [652, 394],
  [726, 396],
  [596, 380],
] as const;

const ties = [
  [0, 1],
  [1, 3],
  [0, 2],
  [2, 4],
  [2, 3],
] as const;

export function InterviewerScene({ shown }: SceneProps) {
  return (
    <g>
      <Page className="fill-navy-taupe" />
      <rect
        x={520}
        y={256}
        width={290}
        height={26}
        rx={13}
        className="fill-white/15"
      />
      <rect
        x={540}
        y={265}
        width={190}
        height={8}
        rx={4}
        className="fill-white/60"
      />
      {[72, 50, 28].map((r) => (
        <circle
          key={r}
          cx={664}
          cy={366}
          r={r}
          fill="none"
          className="stroke-white/15"
          strokeWidth={3}
        />
      ))}
      {ties.map(([from, to], index) => (
        <line
          key={`${from}-${to}`}
          x1={people[from]![0]}
          y1={people[from]![1]}
          x2={people[to]![0]}
          y2={people[to]![1]}
          className="stroke-white/60"
          strokeWidth={3}
          opacity={segment(shown, 0.6 + index * 0.1, 0.2)}
        />
      ))}
      {people.map(([x, y], index) => (
        <circle
          key={x}
          cx={x}
          cy={y}
          r={14 * pop(shown, 0.05 + index * 0.1)}
          className={cx('fill-neon-coral', outline)}
          strokeWidth={3}
        />
      ))}
    </g>
  );
}

const columns = [536, 640, 730, 816] as const;
const headingWidths = [62, 50, 46, 40] as const;

const interviews = [
  { id: 62, protocol: 70, progress: 1, status: 'fill-sea-green' },
  { id: 48, protocol: 54, progress: 0.6, status: 'fill-mustard' },
  { id: 56, protocol: 70, progress: 1, status: 'fill-sea-green' },
  { id: 44, protocol: 62, progress: 0.3, status: 'fill-mustard' },
  { id: 58, protocol: 54, progress: 0.85, status: 'fill-mustard' },
] as const;

export function FrescoScene({ shown }: SceneProps) {
  return (
    <g>
      <Page />
      <path
        d="M423 243 H507 V437 H449 Q423 437 423 411 Z"
        className="fill-slate-blue/12"
      />
      {[266, 290, 314, 338].map((y, index) => (
        <rect
          key={y}
          x={438}
          y={y}
          width={54}
          height={10}
          rx={5}
          className={index === 1 ? 'fill-slate-blue' : 'fill-navy-taupe/20'}
        />
      ))}
      <rect
        x={524}
        y={259}
        width={110}
        height={12}
        rx={6}
        className="fill-navy-taupe/40"
      />
      <rect
        x={770}
        y={254}
        width={120}
        height={22}
        rx={11}
        fill="none"
        className="stroke-navy-taupe/20"
        strokeWidth={2}
      />
      <rect
        x={524}
        y={286}
        width={366}
        height={24}
        rx={6}
        className="fill-navy-taupe/5"
      />
      {columns.map((x, index) => (
        <rect
          key={x}
          x={x}
          y={295}
          width={headingWidths[index]}
          height={7}
          rx={3.5}
          className="fill-navy-taupe/35"
        />
      ))}
      {interviews.map((row, index) => {
        const y = 314 + index * 24;
        const k = pop(shown, 0.1 + index * 0.12);
        return (
          <g
            key={y}
            transform={`translate(0 ${(1 - k) * 10})`}
            opacity={Math.min(1, k)}
          >
            <rect
              x={columns[0]}
              y={y + 8}
              width={row.id}
              height={7}
              rx={3.5}
              className="fill-navy-taupe/50"
            />
            <rect
              x={columns[1]}
              y={y + 8}
              width={row.protocol}
              height={7}
              rx={3.5}
              className="fill-navy-taupe/20"
            />
            <rect
              x={columns[2]}
              y={y + 8}
              width={64}
              height={7}
              rx={3.5}
              className="fill-navy-taupe/10"
            />
            <rect
              x={columns[2]}
              y={y + 8}
              width={64 * row.progress * Math.min(1, k)}
              height={7}
              rx={3.5}
              className="fill-slate-blue"
            />
            <rect
              x={columns[3]}
              y={y + 4}
              width={60}
              height={15}
              rx={7.5}
              className={row.status}
              opacity={0.25}
            />
            <circle
              cx={columns[3] + 10}
              cy={y + 11.5}
              r={3.5}
              className={row.status}
            />
            <rect
              x={columns[3] + 18}
              y={y + 9}
              width={32}
              height={5}
              rx={2.5}
              className="fill-navy-taupe/40"
            />
            <line
              x1={524}
              y1={y + 22}
              x2={890}
              y2={y + 22}
              className="stroke-navy-taupe/10"
              strokeWidth={2}
            />
          </g>
        );
      })}
    </g>
  );
}
