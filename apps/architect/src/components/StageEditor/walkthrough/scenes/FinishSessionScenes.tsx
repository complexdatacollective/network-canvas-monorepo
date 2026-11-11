import { backOut, segment } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { Card, DataTable, Heading } from './InterpreterScenes';
import {
  Chip,
  Click,
  CONTENT,
  defineScene,
  lerp,
  NEXT_BUTTON,
  pivot,
  pressAt,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  TextBar,
  Toast,
  type Point,
} from './parts';

const TEXT = {
  closing: 'Finish Interview',
  finished: 'Interview Finished',
  finish: 'Finish',
  cancel: 'Cancel',
  question: 'Are you sure you want to finish the interview?',
  failed: ['The interview could not', 'be finished. Please try', 'again.'],
  earlier: 'About you',
  noWayBack: 'No way back',
  egoList: 'Ego list',
  columns: ['sessionFinish', 'networkCanvasFinishOutcome'],
  rows: [
    ['2026-05-12T14:03:22.000Z', 'completed'],
    ['2026-05-12T15:41:07.000Z', 'ineligible'],
    ['', ''],
  ],
  unfinished: 'Not finished: left empty',
  graphml: 'GraphML',
  graphmlKeys: ['nc:sessionFinishTime', 'nc:finishOutcome'],
  protocol: 'Protocol',
  stages: ['Screening', 'Survey', 'Finish', 'Not eligible'],
  skipTo: 'Skipped: go to Not eligible',
  eligible: 'Participant A: eligible',
  ineligible: 'Participant B: not eligible',
  outcomes: ['completed', 'ineligible'],
} as const;

/* ------------------------------------------------------------- pieces */

const SCREEN = { width: 440, y: CONTENT.y + 30, height: 200 } as const;
const FINISHED_X = (CONTENT.x + CONTENT.right) / 2;
const BUTTON_WIDTH = 110;
const FINISH_BUTTON: Point = [
  STAGE_CENTER_X - SCREEN.width / 2 + 32 + BUTTON_WIDTH / 2,
  SCREEN.y + SCREEN.height - 40,
];

/**
 * The finish stage's screen: a raised card holding its text, heading first,
 * and, on the closing screen, the Finish button below it.
 */
function Screen({
  center,
  heading,
  button = false,
  press = 0,
  k = 1,
}: {
  center: number;
  heading: string;
  button?: boolean;
  press?: number;
  /** 0 to 1, the screen appearing; 0 hides it. */
  k?: number;
}) {
  if (k <= 0) return null;
  const height = button ? SCREEN.height : SCREEN.height - 60;
  const left = center - SCREEN.width / 2;
  const squash = 1 - Math.sin(Math.PI * press) * 0.12;
  return (
    <g
      transform={pivot(center, SCREEN.y + height / 2, k)}
      opacity={Math.min(1, k)}
    >
      <Card x={left} y={SCREEN.y} width={SCREEN.width} height={height} />
      <text
        x={left + 32}
        y={SCREEN.y + 50}
        fontSize={26}
        fontWeight={900}
        className="fill-white"
      >
        {heading}
      </text>
      <TextBar x={left + 32} y={SCREEN.y + 86} width={340} />
      <TextBar x={left + 32} y={SCREEN.y + 108} width={260} />
      {button ? (
        <g transform={pivot(FINISH_BUTTON[0], FINISH_BUTTON[1], squash)}>
          <Chip
            x={FINISH_BUTTON[0]}
            y={FINISH_BUTTON[1]}
            text={TEXT.finish}
            size={18}
            width={BUTTON_WIDTH}
            fill="fill-sea-green"
            ink="fill-white"
          />
        </g>
      ) : null}
    </g>
  );
}

const DIALOG = {
  width: 500,
  height: 150,
  x: FINISHED_X - 250,
  y: CONTENT.y + 100,
} as const;
const DIALOG_FINISH: Point = [
  DIALOG.x + DIALOG.width - 28 - BUTTON_WIDTH / 2,
  DIALOG.y + DIALOG.height - 34,
];

/**
 * The question the Finish button asks, over the whole screen: the stage's
 * question as its title, the app's own explanation, then Cancel and Finish.
 */
function ConfirmDialog({ k, press = 0 }: { k: number; press?: number }) {
  if (k <= 0) return null;
  const squash = 1 - Math.sin(Math.PI * press) * 0.12;
  return (
    <g opacity={Math.min(1, k)}>
      <rect
        x={CONTENT.x}
        y={CONTENT.y}
        width={CONTENT.right - CONTENT.x}
        height={CONTENT.bottom - CONTENT.y}
        className="fill-navy-taupe/60"
      />
      <g transform={pivot(FINISHED_X, DIALOG.y + DIALOG.height / 2, k)}>
        <rect
          x={DIALOG.x}
          y={DIALOG.y}
          width={DIALOG.width}
          height={DIALOG.height}
          rx={22}
          className="fill-cyber-grape stroke-white/30"
          strokeWidth={3}
        />
        <text
          x={DIALOG.x + 28}
          y={DIALOG.y + 42}
          fontSize={17}
          fontWeight={900}
          className="fill-white"
        >
          {TEXT.question}
        </text>
        <TextBar
          x={DIALOG.x + 28}
          y={DIALOG.y + 72}
          width={320}
          className="stroke-white/25"
        />
        <Chip
          x={DIALOG_FINISH[0] - BUTTON_WIDTH - 16}
          y={DIALOG_FINISH[1]}
          text={TEXT.cancel}
          size={16}
          width={BUTTON_WIDTH}
          fill="fill-white/15"
          ink="fill-white"
        />
        <g transform={pivot(DIALOG_FINISH[0], DIALOG_FINISH[1], squash)}>
          <Chip
            x={DIALOG_FINISH[0]}
            y={DIALOG_FINISH[1]}
            text={TEXT.finish}
            size={16}
            width={BUTTON_WIDTH}
            fill="fill-sea-green"
            ink="fill-white"
          />
        </g>
      </g>
    </g>
  );
}

/** The spinner an automatic finish stage shows while the interview ends. */
function Spinner({ x, y, t }: { x: number; y: number; t: number }) {
  const r = 26;
  return (
    <g transform={`rotate(${(t * 360) % 360} ${x} ${y})`}>
      <circle
        cx={x}
        cy={y}
        r={r}
        fill="none"
        className="stroke-white/15"
        strokeWidth={6}
      />
      <path
        d={`M ${x} ${y - r} A ${r} ${r} 0 0 1 ${x + r} ${y}`}
        fill="none"
        className="stroke-white"
        strokeWidth={6}
        strokeLinecap="round"
      />
    </g>
  );
}

/* ------------------------------------------------------------- scenes */

/**
 * Shows a finish screen where the participant presses Finish and confirms in
 * the question that appears, and the closing screen is replaced by the finished
 * screen with no way to go back.
 */
export const FinishSessionIntroScene = defineScene(5.2, ({ t }) => {
  const asked =
    backOut(segment(t, 1.3, 0.4)) * (1 - smooth(segment(t, 3.0, 0.3)));
  const finished = t >= 3.3;
  return {
    rail: finished ? undefined : { progress: 1 },
    body: (
      <>
        <Screen
          center={STAGE_CENTER_X}
          heading={TEXT.closing}
          button
          press={pressAt(t, [1.1])}
          k={finished ? 0 : 1}
        />
        <Screen
          center={FINISHED_X}
          heading={TEXT.finished}
          k={backOut(segment(t, 3.3, 0.5))}
        />
      </>
    ),
    modal: <ConfirmDialog k={asked} press={pressAt(t, [2.6])} />,
    overlay: (
      <Click
        t={t}
        stops={[
          { to: FINISH_BUTTON, at: 1.1 },
          { to: DIALOG_FINISH, at: 2.6 },
        ]}
        leave={3.1}
      />
    ),
  };
});

/**
 * Shows how a finish screen's data is exported: each finished interview's
 * finish time and outcome fill two columns of the ego list, an unfinished
 * interview leaves both empty, and GraphML includes them as two attributes.
 */
export const FinishSessionDataScene = defineScene(
  4.8,
  ({ t }) => {
    const tableX = CONTENT.x + 100;
    const top = CONTENT.y + 66;
    const graphmlY = top + 40 * 4 + 50;
    return {
      body: (
        <>
          <Heading x={tableX} y={CONTENT.y + 42} text={TEXT.egoList} />
          <DataTable
            x={tableX}
            y={top}
            columns={TEXT.columns}
            rows={TEXT.rows}
            reveal={(row, cell) =>
              smooth(segment(t, 0.4 + row * 0.7 + cell * 0.3, 0.4))
            }
            colWidth={250}
          />
          <Chip
            x={tableX + 250}
            y={top + 40 * 3 + 20}
            text={TEXT.unfinished}
            size={13}
            fill="fill-white/20"
            ink="fill-white"
            k={backOut(segment(t, 2.4, 0.4))}
          />
          <Heading x={tableX} y={graphmlY} text={TEXT.graphml} />
          {TEXT.graphmlKeys.map((key, i) => (
            <Chip
              key={key}
              x={tableX + i * 230}
              y={graphmlY + 34}
              text={key}
              size={14}
              align="start"
              k={backOut(segment(t, 3.0 + i * 0.3, 0.4))}
            />
          ))}
        </>
      ),
    };
  },
  { url: 'Exported data' },
);

/**
 * Shows a finish screen set to finish automatically, where the participant
 * clicks Next on the stage before it, the interview ends at once with no way
 * back, and the finished screen appears.
 */
export const FinishSessionAutomaticScene = defineScene(4.8, ({ t }) => {
  const arrived = t >= 1.3;
  const finished = t >= 2.9;
  const spinning = arrived && !finished;
  return {
    rail: finished
      ? undefined
      : { progress: arrived ? 1 : 0.85, press: pressAt(t, [1.0]) },
    body: (
      <>
        {arrived ? null : (
          <Screen center={STAGE_CENTER_X} heading={TEXT.earlier} />
        )}
        {spinning ? (
          <>
            <Spinner
              x={STAGE_CENTER_X}
              y={(STAGE.y + STAGE.bottom) / 2}
              t={t}
            />
            <Chip
              x={STAGE.x + 80}
              y={CONTENT.y + 92}
              text={TEXT.noWayBack}
              size={13}
              k={backOut(segment(t, 1.6, 0.4))}
            />
          </>
        ) : null}
        <Screen
          center={FINISHED_X}
          heading={TEXT.finished}
          k={backOut(segment(t, 2.9, 0.5))}
        />
      </>
    ),
    overlay: <Click t={t} stops={[{ to: NEXT_BUTTON, at: 1.0 }]} leave={1.4} />,
  };
});

/**
 * Shows a finish screen where the participant presses Finish and confirms, the
 * interview can't be finished and a failure message appears, and the
 * participant presses Finish and confirms again to reach the finished screen.
 */
export const FinishSessionFailedScene = defineScene(7.4, ({ t }) => {
  const asked =
    backOut(segment(t, 1.1, 0.4)) * (1 - smooth(segment(t, 2.2, 0.3))) +
    backOut(segment(t, 5.0, 0.4)) * (1 - smooth(segment(t, 6.1, 0.3)));
  const toast =
    smooth(segment(t, 2.5, 0.3)) * (1 - smooth(segment(t, 4.2, 0.3)));
  const finished = t >= 6.4;
  return {
    rail: finished ? undefined : { progress: 1 },
    body: (
      <>
        <Screen
          center={STAGE_CENTER_X}
          heading={TEXT.closing}
          button
          press={pressAt(t, [0.9, 4.8])}
          k={finished ? 0 : 1}
        />
        <Screen
          center={FINISHED_X}
          heading={TEXT.finished}
          k={backOut(segment(t, 6.4, 0.5))}
        />
      </>
    ),
    modal: (
      <>
        {finished ? null : (
          <Toast
            lines={TEXT.failed}
            variant="destructive"
            k={toast}
            t={t}
            from={2.5}
          />
        )}
        <ConfirmDialog k={asked} press={pressAt(t, [1.9, 5.8])} />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: FINISH_BUTTON, at: 0.9 },
          { to: DIALOG_FINISH, at: 1.9 },
          { to: FINISH_BUTTON, at: 4.8 },
          { to: DIALOG_FINISH, at: 5.8 },
        ]}
        leave={6.2}
      />
    ),
  };
});

/**
 * Shows a protocol with two finish screens, where an eligible participant moves
 * through every stage to the first finish screen with the outcome completed,
 * and skip logic sends a participant who isn't eligible to the second finish
 * screen with the outcome ineligible.
 */
export const FinishSessionOutcomesScene = defineScene(
  6.0,
  ({ t }) => {
    const CARD = { width: 140, height: 150, gap: 28 };
    const startX =
      CONTENT.x +
      (CONTENT.right - CONTENT.x - (CARD.width * 4 + CARD.gap * 3)) / 2;
    const cardX = (i: number) => startX + i * (CARD.width + CARD.gap);
    const cardY = CONTENT.y + 96;
    const center = (i: number) => cardX(i) + CARD.width / 2;
    const lineY = cardY + CARD.height + 44;
    const runs = [
      { at: 0.7, visits: [0, 1, 2], label: TEXT.eligible },
      { at: 3.4, visits: [0, 3], label: TEXT.ineligible },
    ];
    const second = t >= 3.2;
    const run = runs[second ? 1 : 0] ?? runs[0];
    const visits = run?.visits ?? [0];
    const step = 0.7;
    const progress = (t - (run?.at ?? 0)) / step;
    const index = Math.max(0, Math.min(visits.length - 1, progress));
    const from = visits[Math.floor(index)] ?? 0;
    const to = visits[Math.min(Math.floor(index) + 1, visits.length - 1)] ?? 0;
    const k = smooth(index - Math.floor(index));
    const jumping = to - from > 1;
    const dot: Point = [
      lerp(center(from), center(to), k),
      lineY + (jumping ? Math.sin(Math.PI * k) * 40 : 0),
    ];
    const here = progress >= 0 ? (visits[Math.round(index)] ?? -1) : -1;
    const reached = (stage: number) =>
      backOut(segment(t, (run?.at ?? 0) + visits.indexOf(stage) * step, 0.4));
    return {
      body: (
        <>
          <Chip
            x={(CONTENT.x + CONTENT.right) / 2}
            y={CONTENT.y + 34}
            text={run?.label ?? ''}
            size={17}
            fill={second ? 'fill-slate-blue' : 'fill-sea-green'}
            ink="fill-white"
            k={backOut(segment(t, second ? 3.2 : 0.2, 0.4))}
          />
          <line
            x1={center(0)}
            y1={lineY}
            x2={center(2)}
            y2={lineY}
            className="stroke-white/20"
            strokeWidth={6}
            strokeLinecap="round"
            opacity={second ? 0.4 : 1}
          />
          <path
            d={`M${center(0)} ${lineY} Q${center(1.5)} ${lineY + 80} ${center(3)} ${lineY}`}
            className="stroke-white/40"
            fill="none"
            strokeWidth={5}
            strokeDasharray="10 10"
            opacity={second ? 1 : 0}
          />
          {TEXT.stages.map((stage, i) => {
            const isFinish = i >= 2;
            const pop = backOut(segment(t, 0.1 + i * 0.08, 0.4));
            return (
              <g
                key={stage}
                transform={pivot(center(i), cardY + CARD.height / 2, pop)}
              >
                <rect
                  x={cardX(i)}
                  y={cardY}
                  width={CARD.width}
                  height={CARD.height}
                  rx={16}
                  className={cx(
                    'fill-cyber-grape',
                    here === i
                      ? 'stroke-sea-green'
                      : isFinish
                        ? 'stroke-mustard'
                        : 'stroke-white/20',
                  )}
                  strokeWidth={here === i ? 6 : 4}
                />
                <TextBar
                  x={cardX(i) + 24}
                  y={cardY + 40}
                  width={CARD.width - 48}
                  className="stroke-white/25"
                />
                <TextBar
                  x={cardX(i) + 24}
                  y={cardY + 64}
                  width={CARD.width - 80}
                  className="stroke-white/15"
                />
                <text
                  x={center(i)}
                  y={cardY + CARD.height - 24}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={800}
                  className="fill-white"
                >
                  {stage}
                </text>
                <circle
                  cx={center(i)}
                  cy={lineY}
                  r={9}
                  className="fill-white/40"
                />
              </g>
            );
          })}
          <Chip
            x={center(1)}
            y={cardY - 22}
            text={TEXT.skipTo}
            size={13}
            k={backOut(segment(t, 3.2, 0.4))}
          />
          {TEXT.outcomes.map((outcome, i) => {
            const stage = i + 2;
            return (
              <Chip
                key={outcome}
                x={center(stage)}
                y={cardY - 22}
                text={outcome}
                size={13}
                fill="fill-sea-green"
                ink="fill-white"
                k={visits.includes(stage) ? reached(stage) : 0}
              />
            );
          })}
          {progress >= -0.5 ? (
            <circle
              cx={dot[0]}
              cy={dot[1]}
              r={14}
              className="fill-neon-coral stroke-white"
              strokeWidth={4}
            />
          ) : null}
        </>
      ),
    };
  },
  { url: TEXT.protocol },
);
