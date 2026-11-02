'use client';

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

import {
  GroundShadow,
  lerp,
  link,
  Particles,
  pivot,
  smooth,
  type Point,
} from './parts';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  NameCard,
  PersonNode,
  ROSTER,
} from './rosterParts';

const QUESTIONS = ['Who do you study with?', 'Who do you eat lunch with?'];
const BUBBLE_WIDTH = 400;
const BUBBLE_HEIGHT = 84;

// A speech bubble with its top-left corner at (x, y) and its tail on the left
// side or under the bottom-left.
function Bubble({
  x,
  y,
  text,
  tail,
}: {
  x: number;
  y: number;
  text: string;
  tail: 'left' | 'bottom';
}) {
  const w = BUBBLE_WIDTH;
  const h = BUBBLE_HEIGHT;
  const r = 24;
  const bottom =
    tail === 'bottom'
      ? `H${x + 84} L${x + 44} ${y + h + 26} L${x + 52} ${y + h} H${x + r}`
      : `H${x + r}`;
  const left =
    tail === 'left'
      ? `V${y + h / 2 + 12} L${x - 24} ${y + h / 2 + 8} L${x} ${y + h / 2 - 12} V${y + r}`
      : `V${y + r}`;
  return (
    <>
      <path
        d={`M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} ${bottom} Q${x} ${y + h} ${x} ${y + h - r} ${left} Q${x} ${y} ${x + r} ${y} Z`}
        className={cx('fill-white', outline)}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <text
        x={x + 28}
        y={y + h / 2 + 9}
        fontSize={25}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        {text}
      </text>
    </>
  );
}

// One roster card, linked to two questions about the same people.
const CARD: Point = [100, 188];
const CARD_SCALE = 1.3;
const BUBBLES = [
  [720, 60],
  [720, 300],
] as const;

export function TwoQuestionsScene() {
  const END = 2.6;
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const card = backOut(segment(t, 0, 0.5));
  const from: Point = [
    CARD[0] + CARD_WIDTH * CARD_SCALE + 14,
    CARD[1] + (CARD_HEIGHT * CARD_SCALE) / 2,
  ];

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow
        cx={CARD[0] + (CARD_WIDTH * CARD_SCALE) / 2}
        cy={420}
        rx={170}
      />
      {BUBBLES.map(([x, y], index) => {
        const path = link(from, [x - 34, y + BUBBLE_HEIGHT / 2 + 8]);
        const at = 1 + index * 0.25;
        return (
          <g key={x + y}>
            <g opacity={segment(t, at - 0.2, 0.3)}>
              <DottedPath d={path.d} time={t} />
            </g>
            <Particles
              path={path}
              since={t - at}
              duration={0.8}
              fill="fill-neon-coral"
            />
          </g>
        );
      })}
      {BUBBLES.map(([x, y], index) => {
        const k = backOut(segment(t, 0.4 + index * 0.2, 0.5));
        return (
          <g key={x + y} transform={pivot(x, y + BUBBLE_HEIGHT / 2, k)}>
            <g
              transform={`translate(0 ${Math.sin((TAU * t) / 2.7 + index) * 3})`}
            >
              <Bubble x={x} y={y} text={QUESTIONS[index]!} tail="left" />
            </g>
          </g>
        );
      })}
      <g
        transform={`translate(0 ${bob}) ${pivot(CARD[0] + (CARD_WIDTH * CARD_SCALE) / 2, CARD[1] + (CARD_HEIGHT * CARD_SCALE) / 2, card)} translate(${CARD[0]} ${CARD[1]}) scale(${CARD_SCALE})`}
      >
        <NameCard name="Lisa" />
      </g>
    </svg>
  );
}

// Two questions, each with the roster beneath it. A card added for the first
// leaves its list, and the second list closes up one shorter.
const COLUMNS = [120, 680] as const;
const BUBBLE_Y = 30;
const LIST_SCALE = 0.75;
const PICK = 2;
const STEP = 54;
const listY = (index: number) => 140 + index * STEP;
const ADD_AT = 1;
const ADDED_AT = 1.7;
const GONE_AT = 2.1;

export function AddedOnceScene() {
  const END = 3.2;
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const t = time;
  const travel = smooth(segment(t, ADD_AT, ADDED_AT - ADD_AT));
  const node = backOut(segment(t, ADDED_AT - 0.1, 0.5));
  const gone = smooth(segment(t, GONE_AT, 0.3));
  const close = [0, smooth(segment(t, GONE_AT + 0.25, 0.4))];
  const nodeAt: Point = [COLUMNS[0] + BUBBLE_WIDTH - 4, BUBBLE_Y + 14];

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      {COLUMNS.map((x, column) => {
        const bob = Math.sin((TAU * t) / 2.7 + column) * 3;
        const bubble = backOut(segment(t, column * 0.2, 0.5));
        return (
          <g key={x} transform={`translate(0 ${bob})`}>
            <GroundShadow cx={x + BUBBLE_WIDTH / 2} cy={428} rx={170} />
            <g transform={pivot(x + 60, BUBBLE_Y + BUBBLE_HEIGHT, bubble)}>
              <Bubble
                x={x}
                y={BUBBLE_Y}
                text={QUESTIONS[column]!}
                tail="bottom"
              />
            </g>
            {ROSTER.map(([name], index) => {
              const k = backOut(segment(t, 0.3 + index * 0.08, 0.45));
              const y =
                listY(index) - (index > PICK ? close[column]! * STEP : 0);
              const cardX = x + 40;
              if (index === PICK && column === 0) {
                const slot = (
                  <rect
                    key={`${name}-slot`}
                    x={cardX}
                    y={y}
                    width={CARD_WIDTH * LIST_SCALE}
                    height={CARD_HEIGHT * LIST_SCALE}
                    rx={14}
                    fill="none"
                    className="stroke-navy-taupe/30"
                    strokeWidth={4}
                    strokeDasharray="2 10"
                    strokeLinecap="round"
                    opacity={segment(t, ADD_AT + 0.2, 0.3)}
                  />
                );
                if (travel >= 1) return slot;
                const tx = lerp(cardX, nodeAt[0] - 40, travel);
                const ty =
                  lerp(y, nodeAt[1] - 20, travel) -
                  Math.sin(Math.PI * travel) * 40;
                return (
                  <g key={name}>
                    {slot}
                    <g
                      transform={`translate(${tx} ${ty}) scale(${grow(LIST_SCALE * (1 - travel * 0.7))})`}
                      opacity={Math.min(1, k)}
                    >
                      <NameCard name={name} />
                    </g>
                  </g>
                );
              }
              const fade = index === PICK ? 1 - gone : 1;
              if (fade <= 0) return null;
              return (
                <g
                  key={name}
                  transform={`translate(${cardX + (1 - k) * -24} ${y}) scale(${grow(LIST_SCALE * fade)} ${LIST_SCALE})`}
                  opacity={Math.min(1, k) * fade}
                >
                  <NameCard name={name} />
                </g>
              );
            })}
          </g>
        );
      })}
      {node > 0 ? (
        <g
          transform={`translate(0 ${Math.sin((TAU * t) / 2.7) * 3}) ${pivot(nodeAt[0], nodeAt[1], node)}`}
        >
          <PersonNode x={nodeAt[0]} y={nodeAt[1]} r={40} name="Lisa" />
        </g>
      ) : null}
    </svg>
  );
}
