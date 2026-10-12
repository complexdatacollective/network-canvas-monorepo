'use client';

import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  backOut,
  inCubic,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from './illustrationMotion';

const LOOP = 8.4;
const OUT_START = 7.6;
const STILL_TIME = 6.6;

type Point = readonly [number, number];

const smooth = (x: number) => x * x * (3 - 2 * x);
const lerp = (from: number, to: number, k: number) => from + (to - from) * k;
const glide = (from: Point, to: Point, k: number, arc = 0): Point => [
  lerp(from[0], to[0], k),
  lerp(from[1], to[1], k) - Math.sin(Math.PI * k) * arc,
];

// The cloud is a union of shapes: each is stroked wide first, then every shape
// is filled on top, which leaves a single outline around the merged silhouette.
const cloudCircles = [
  [196, 262, 84],
  [268, 206, 122],
  [452, 150, 124],
  [690, 138, 120],
  [892, 196, 130],
  [1010, 262, 86],
] as const;
const CLOUD_BASE = { x: 106, y: 220, width: 988, height: 130, rx: 65 } as const;

const WINDOW = { x: 215, y: 100, width: 770, height: 205 } as const;
const BAR_Y = WINDOW.y + 48;

const CARD_W = 124;
const CARD_H = 110;
const CARD_Y = 172;
const SLOT_PITCH = 146;
const slotX = (slot: number) => 246 + slot * SLOT_PITCH;
const slotCenter = (slot: number): Point => [
  slotX(slot) + CARD_W / 2,
  CARD_Y + CARD_H / 2,
];
const ROW_MID_Y = CARD_Y + CARD_H / 2;

const cards = [
  { slot: 0, dot: 'fill-sea-green', bars: [54, 70, 48], start: 0.05 },
  { slot: 1, dot: 'fill-neon-carrot', bars: [46, 64, 36], start: 0.15 },
  { slot: 3, dot: 'fill-slate-blue', bars: [58, 50, 64], start: 0.25 },
  { slot: 4, dot: 'fill-kiwi', bars: [40, 72, 56], start: 0.35 },
] as const;
const GAP_SLOT = 2;
const EDIT_SLOT = 1;

const PILL = { x: 850, y: 112, width: 108, height: 30 } as const;
const PILL_CENTER: Point = [PILL.x + PILL.width / 2, PILL.y + PILL.height / 2];

// Cursor A grabs a new stage from the toolbar and drops it into the gap.
const A_START: Point = [1130, 52];
const A_ENTER = 0.2;
const CLICK_A = 1.25;
const DRAG_START = 1.4;
const DRAG_LENGTH = 1.0;
const DROP = DRAG_START + DRAG_LENGTH;
const A_REST: Point = [704, 296];

// Cursor B types into a card.
const B_START: Point = [52, 238];
const B_ENTER = 0.4;
const EDIT_START = 1.6;
const EDIT_LENGTH = 1.1;
const BAR_X = slotX(EDIT_SLOT) + 16;
const TEXT_Y = CARD_Y + 78;
const BAR_FROM = 36;
const BAR_TO = 90;
const B_REST: Point = [slotX(EDIT_SLOT) + 112, 298];

// Cursor C adds a wave to the timeline.
const C_START: Point = [1135, 438];
const C_ENTER = 0.6;
const CLICK_C = 1.7;
const C_REST: Point = [1020, 366];

const WAVE_Y = 414;
const WAVE_W = 140;
const WAVE_H = 44;
const waves = [
  { label: 'Wave 1', x: 300, fill: 'fill-sea-green', pop: 0.5, lit: 3 },
  { label: 'Wave 2', x: 600, fill: 'fill-cerulean-blue', pop: 0.65, lit: 3.9 },
  { label: 'Wave 3', x: 900, fill: 'fill-neon-carrot', pop: 1.95, lit: 4.8 },
] as const;
const TIMELINE = { from: 150, to: 1062 } as const;

const ARROW_PATH = 'M0 0 L0 30 L8 23 L14 36 L21 33 L15 21 L26 21 Z';

function StageCard({
  dot,
  bars,
  ring = 0,
  caret = 0,
}: {
  dot: string;
  bars: readonly [number, number, number];
  ring?: number;
  caret?: number;
}) {
  return (
    <g>
      <rect
        width={CARD_W}
        height={CARD_H}
        rx={16}
        className={cx('fill-white', outline)}
        strokeWidth={4}
      />
      <circle
        cx={24}
        cy={28}
        r={9}
        className={cx(dot, outline)}
        strokeWidth={3}
      />
      <rect
        x={44}
        y={22}
        width={bars[0]}
        height={12}
        rx={6}
        className="fill-navy-taupe/35"
      />
      <rect
        x={16}
        y={56}
        width={bars[1]}
        height={10}
        rx={5}
        className="fill-navy-taupe/20"
      />
      <rect
        x={16}
        y={78}
        width={bars[2]}
        height={10}
        rx={5}
        className="fill-navy-taupe/20"
      />
      {caret > 0 ? (
        <rect
          x={16 + bars[2] + 4}
          y={74}
          width={4}
          height={18}
          rx={2}
          className="fill-cerulean-blue"
          opacity={caret}
        />
      ) : null}
      {ring > 0 ? (
        <rect
          x={-7}
          y={-7}
          width={CARD_W + 14}
          height={CARD_H + 14}
          rx={21}
          fill="none"
          className="stroke-cerulean-blue"
          strokeWidth={4}
          opacity={ring}
        />
      ) : null}
    </g>
  );
}

function Cursor({
  tip,
  fill,
  opacity,
}: {
  tip: Point;
  fill: string;
  opacity: number;
}) {
  return (
    <g
      transform={`translate(${tip[0]} ${tip[1]}) scale(1.15)`}
      opacity={opacity}
    >
      <rect
        x={20}
        y={36}
        width={38}
        height={20}
        rx={10}
        className={cx(fill, outline)}
        strokeWidth={3}
      />
      <path
        d={ARROW_PATH}
        className={cx(fill, outline)}
        strokeWidth={4}
        strokeLinejoin="round"
      />
    </g>
  );
}

function ClickRing({
  at,
  progress,
  stroke,
}: {
  at: Point;
  progress: number;
  stroke: string;
}) {
  if (progress <= 0 || progress >= 1) return null;
  return (
    <circle
      cx={at[0]}
      cy={at[1]}
      r={8 + progress * 26}
      fill="none"
      className={stroke}
      strokeWidth={4}
      opacity={1 - progress}
    />
  );
}

export function StudioFundedIllustration() {
  const { ref, time } = useIllustrationClock(STILL_TIME);
  const t = time % LOOP;
  const out = inCubic(segment(t, OUT_START, 0.5));
  const alive = 1 - out;
  const bob = (phase: number) =>
    Math.sin((TAU * t) / 2.6 + phase) * 3 * segment(t, 2.8, 0.5);

  // Cursor A
  const aEnter = smooth(segment(t, A_ENTER, 1.0));
  const drag = smooth(segment(t, DRAG_START, DRAG_LENGTH));
  const gap = slotCenter(GAP_SLOT);
  const carried: Point = [
    lerp(PILL_CENTER[0], gap[0], drag),
    lerp(PILL_CENTER[1] + 12, gap[1], drag) - Math.sin(Math.PI * drag) * 34,
  ];
  const carriedScale =
    lerp(0.4, 1, smooth(Math.min(1, drag * 2.2))) *
    Math.min(1.1, backOut(segment(t, CLICK_A - 0.05, 0.25))) *
    (1 + 0.05 * Math.sin(Math.PI * segment(t, DROP - 0.05, 0.35)));
  const carriedTilt = -Math.sin(Math.PI * drag) * 4;
  const landed = segment(t, DROP - 0.1, 0.2);
  const aCarry: Point = [
    carried[0] + lerp(0, -26, drag),
    carried[1] + lerp(-12, -30, drag),
  ];
  let aTip: Point;
  if (t < DRAG_START) aTip = glide(A_START, PILL_CENTER, aEnter, 30);
  else if (t < DROP) aTip = aCarry;
  else aTip = glide(aCarry, A_REST, smooth(segment(t, DROP + 0.1, 0.7)));
  aTip = [aTip[0] + bob(1.9) * 0.6, aTip[1] + bob(0.4)];

  // Cursor B
  const editK = smooth(segment(t, EDIT_START, EDIT_LENGTH));
  const barWidth = lerp(BAR_FROM, BAR_TO, editK);
  const bEdit: Point = [BAR_X + BAR_FROM + 14, TEXT_Y + 14];
  const bType: Point = [BAR_X + barWidth + 14, TEXT_Y + 14];
  let bTip: Point;
  if (t < EDIT_START) {
    bTip = glide(B_START, bEdit, smooth(segment(t, B_ENTER, 1.0)), 24);
  } else if (t < EDIT_START + EDIT_LENGTH) bTip = bType;
  else {
    bTip = glide(
      bType,
      B_REST,
      smooth(segment(t, EDIT_START + EDIT_LENGTH + 0.1, 0.7)),
    );
  }
  bTip = [bTip[0] + bob(3.6) * 0.6, bTip[1] + bob(2.1)];
  const editing =
    segment(t, EDIT_START - 0.2, 0.2) *
    (1 - segment(t, EDIT_START + EDIT_LENGTH + 0.1, 0.25));
  const caretBlink = Math.sin(TAU * t * 2.2) > 0 ? 1 : 0.25;

  // Cursor C
  const wave3 = waves[2];
  const C_TARGET: Point = [wave3.x + 18, WAVE_Y + 10];
  let cTip: Point;
  if (t < CLICK_C) {
    cTip = glide(C_START, C_TARGET, smooth(segment(t, C_ENTER, 1.0)), 40);
  } else {
    cTip = glide(C_TARGET, C_REST, smooth(segment(t, CLICK_C + 0.5, 0.8)));
  }
  cTip = [cTip[0] + bob(5.4) * 0.6, cTip[1] + bob(4.2)];

  const cursors = [
    { tip: aTip, start: A_START, fill: 'fill-neon-coral', delay: 0 },
    { tip: bTip, start: B_START, fill: 'fill-cerulean-blue', delay: 0.2 },
    { tip: cTip, start: C_START, fill: 'fill-mustard', delay: 0.4 },
  ] as const;

  const pillSquash =
    1 - 0.08 * Math.sin(Math.PI * segment(t, CLICK_A - 0.1, 0.25));
  const rowFade = alive;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto w-full overflow-visible"
      aria-hidden
    >
      <ellipse
        cx={600}
        cy={362}
        rx={470}
        ry={9}
        className="fill-navy-taupe/12"
      />
      <g className={outline} strokeWidth={12} strokeLinejoin="round">
        {cloudCircles.map(([cx0, cy0, r]) => (
          <circle key={`${cx0}-${cy0}`} cx={cx0} cy={cy0} r={r} fill="none" />
        ))}
        <rect {...CLOUD_BASE} fill="none" />
      </g>
      <g className="fill-white">
        {cloudCircles.map(([cx0, cy0, r]) => (
          <circle key={`${cx0}-${cy0}`} cx={cx0} cy={cy0} r={r} />
        ))}
        <rect {...CLOUD_BASE} />
      </g>

      <rect
        {...WINDOW}
        rx={22}
        className={cx('fill-white', outline)}
        strokeWidth={5}
      />
      <path
        d={`M${WINDOW.x + 3} ${BAR_Y} H${WINDOW.x + WINDOW.width - 3} V${
          WINDOW.y + WINDOW.height - 22
        } Q${WINDOW.x + WINDOW.width - 3} ${WINDOW.y + WINDOW.height - 3} ${
          WINDOW.x + WINDOW.width - 22
        } ${WINDOW.y + WINDOW.height - 3} H${WINDOW.x + 25} Q${WINDOW.x + 3} ${
          WINDOW.y + WINDOW.height - 3
        } ${WINDOW.x + 3} ${WINDOW.y + WINDOW.height - 25} Z`}
        className="fill-navy-taupe/5"
      />
      <path
        d={`M${WINDOW.x + 3} ${BAR_Y} H${WINDOW.x + WINDOW.width - 3}`}
        className={outline}
        strokeWidth={4}
      />
      {['fill-neon-coral', 'fill-mustard', 'fill-sea-green'].map(
        (fill, index) => (
          <circle
            key={fill}
            cx={WINDOW.x + 32 + index * 22}
            cy={WINDOW.y + 24}
            r={7}
            className={fill}
          />
        ),
      )}
      <rect
        x={WINDOW.x + 120}
        y={WINDOW.y + 8}
        width={128}
        height={32}
        rx={16}
        className="fill-navy-taupe/10"
      />
      <text
        x={WINDOW.x + 184}
        y={WINDOW.y + 30}
        textAnchor="middle"
        fontSize={18}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        Studio
      </text>
      <g
        transform={`translate(${PILL_CENTER[0]} ${PILL_CENTER[1]}) scale(${pillSquash}) translate(${-PILL.width / 2} ${-PILL.height / 2})`}
      >
        <rect
          width={PILL.width}
          height={PILL.height}
          rx={PILL.height / 2}
          className={cx('fill-neon-coral', outline)}
          strokeWidth={3}
        />
        <text
          x={PILL.width / 2}
          y={21}
          textAnchor="middle"
          fontSize={16}
          fontWeight={900}
          className="fill-navy-taupe"
        >
          + Stage
        </text>
      </g>

      <line
        x1={slotX(0) + 20}
        x2={slotX(4) + CARD_W - 20}
        y1={ROW_MID_Y}
        y2={ROW_MID_Y}
        className="stroke-navy-taupe/25"
        strokeWidth={4}
        strokeDasharray="2 12"
        strokeLinecap="round"
        strokeDashoffset={-time * 20}
        opacity={segment(t, 0.2, 0.3) * rowFade}
      />
      {(() => {
        const k = backOut(segment(t, 0.4, 0.4)) * alive;
        const [gx, gy] = gap;
        return (
          <rect
            x={-CARD_W / 2}
            y={-CARD_H / 2}
            width={CARD_W}
            height={CARD_H}
            rx={16}
            fill="none"
            className="stroke-neon-coral"
            strokeWidth={4}
            strokeDasharray="10 9"
            strokeLinecap="round"
            transform={`translate(${gx} ${gy}) scale(${Math.max(0.001, k * (1 - landed))})`}
          />
        );
      })()}
      {cards.map((card) => {
        const k = backOut(segment(t, card.start, 0.5)) * alive;
        const [cx0, cy0] = slotCenter(card.slot);
        const edit = card.slot === EDIT_SLOT;
        const bars: readonly [number, number, number] = edit
          ? [card.bars[0], card.bars[1], barWidth]
          : card.bars;
        const idle = Math.sin((TAU * t) / 2.7 + card.slot) * 2 * k;
        return (
          <g
            key={card.slot}
            transform={`translate(${cx0} ${cy0 + idle}) scale(${Math.max(0.001, k)}) translate(${-CARD_W / 2} ${-CARD_H / 2})`}
          >
            <StageCard
              dot={card.dot}
              bars={bars}
              ring={edit ? editing : 0}
              caret={edit ? editing * caretBlink : 0}
            />
          </g>
        );
      })}

      <g opacity={segment(t, 0.3, 0.3) * rowFade}>
        <line
          x1={TIMELINE.from}
          x2={TIMELINE.to}
          y1={WAVE_Y}
          y2={WAVE_Y}
          className="stroke-navy-taupe/25"
          strokeWidth={5}
          strokeDasharray="2 14"
          strokeLinecap="round"
        />
        <path
          d={`M${TIMELINE.to - 16} ${WAVE_Y - 14} L${TIMELINE.to} ${WAVE_Y} L${TIMELINE.to - 16} ${WAVE_Y + 14}`}
          fill="none"
          className="stroke-navy-taupe/25"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={TIMELINE.from}
          cy={WAVE_Y}
          r={8}
          className="fill-navy-taupe/25"
        />
      </g>
      {waves.map((wave, index) => {
        const next = waves[index + 1];
        const from = index === 0 ? TIMELINE.from : wave.x - WAVE_W / 2 - 150;
        const start = index === 0 ? from : waves[index - 1]!.x + WAVE_W / 2;
        const end = wave.x - WAVE_W / 2;
        const p = smooth(segment(t, wave.lit - 0.4, 0.4));
        return (
          <line
            key={`line-${wave.label}`}
            x1={index === 0 ? TIMELINE.from : start}
            x2={lerp(index === 0 ? TIMELINE.from : start, end, p)}
            y1={WAVE_Y}
            y2={WAVE_Y}
            className="stroke-navy-taupe"
            strokeWidth={5}
            strokeLinecap="round"
            opacity={next === undefined || p > 0 ? alive : 0}
          />
        );
      })}
      {waves.map((wave) => {
        const k = backOut(segment(t, wave.pop, 0.45)) * alive;
        const lit = smooth(segment(t, wave.lit, 0.3));
        const phase = ((t - wave.lit - 0.1) / 1.6) % 1;
        const packet = t > wave.lit + 0.1 ? phase : -1;
        return (
          <g key={wave.label}>
            <line
              x1={wave.x}
              x2={wave.x}
              y1={WAVE_Y - WAVE_H / 2 - 4}
              y2={366}
              className="stroke-navy-taupe/25"
              strokeWidth={4}
              strokeDasharray="2 10"
              strokeLinecap="round"
              opacity={Math.min(1, k)}
            />
            {packet >= 0 ? (
              <circle
                cx={wave.x}
                cy={lerp(WAVE_Y - WAVE_H / 2 - 4, 366, packet)}
                r={6}
                className={cx(wave.fill, outline)}
                strokeWidth={2.5}
                opacity={Math.sin(Math.PI * packet) * alive}
              />
            ) : null}
            <g
              transform={`translate(${wave.x} ${WAVE_Y}) scale(${Math.max(0.001, k * (1 + 0.06 * Math.sin(Math.PI * lit)))})`}
            >
              <rect
                x={-WAVE_W / 2}
                y={-WAVE_H / 2}
                width={WAVE_W}
                height={WAVE_H}
                rx={WAVE_H / 2}
                className={cx('fill-white', outline)}
                strokeWidth={5}
              />
              <rect
                x={-WAVE_W / 2}
                y={-WAVE_H / 2}
                width={WAVE_W}
                height={WAVE_H}
                rx={WAVE_H / 2}
                className={cx(wave.fill, outline)}
                strokeWidth={5}
                opacity={lit}
              />
              <text
                y={6.5}
                textAnchor="middle"
                fontSize={19}
                fontWeight={900}
                className="fill-navy-taupe"
                opacity={0.5 + 0.5 * lit}
              >
                {wave.label}
              </text>
            </g>
          </g>
        );
      })}
      {(() => {
        const k =
          backOut(segment(t, 0.7, 0.4)) *
          alive *
          (1 - segment(t, wave3.pop - 0.05, 0.15));
        return (
          <g
            transform={`translate(${wave3.x} ${WAVE_Y}) scale(${Math.max(0.001, k)})`}
          >
            <rect
              x={-WAVE_W / 2}
              y={-WAVE_H / 2}
              width={WAVE_W}
              height={WAVE_H}
              rx={WAVE_H / 2}
              fill="none"
              className="stroke-mustard"
              strokeWidth={4}
              strokeDasharray="10 9"
              strokeLinecap="round"
            />
            <text
              y={9}
              textAnchor="middle"
              fontSize={28}
              fontWeight={900}
              className="fill-mustard"
            >
              +
            </text>
          </g>
        );
      })()}

      {t >= DRAG_START - 0.2 ? (
        <g
          transform={`translate(${carried[0]} ${carried[1]}) rotate(${carriedTilt}) scale(${Math.max(0.001, carriedScale * alive)}) translate(${-CARD_W / 2} ${-CARD_H / 2})`}
        >
          <StageCard dot="fill-neon-coral" bars={[50, 60, 40]} />
        </g>
      ) : null}

      <ClickRing
        at={PILL_CENTER}
        progress={segment(t, CLICK_A, 0.4)}
        stroke="stroke-neon-coral"
      />
      <ClickRing
        at={C_TARGET}
        progress={segment(t, CLICK_C, 0.4)}
        stroke="stroke-mustard"
      />
      <ClickRing
        at={bEdit}
        progress={segment(t, EDIT_START - 0.1, 0.4)}
        stroke="stroke-cerulean-blue"
      />
      {cursors.map((cursor) => (
        <Cursor
          key={cursor.fill}
          tip={glide(cursor.tip, cursor.start, out)}
          fill={cursor.fill}
          opacity={segment(t, cursor.delay, 0.25) * alive}
        />
      ))}
    </svg>
  );
}
