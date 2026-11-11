import { segment } from '@codaco/art/illustration/motion';

import {
  Click,
  defineScene,
  lerp,
  NEXT_BUTTON,
  PersonNode,
  pressAt,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  TextBox,
} from './parts';

const TEXT = {
  nickname: 'Nickname',
  closeness: 'How close are you?',
  options: ['Not close', 'Close', 'Very close'],
  typed: 'Sammy',
} as const;

const SAM = 'Sam';
const ANA = 'Ana';

const CARD = {
  width: 360,
  height: 230,
  x: STAGE_CENTER_X - 130,
  y: STAGE.y + 80,
} as const;
const OPTION_Y = (i: number) => CARD.y + 150 + i * 26;
const NODE_R = 34;
/** The alter sits against the card's start edge, centred on its height. */
const NODE: readonly [number, number] = [
  CARD.x - NODE_R - 12,
  CARD.y + CARD.height / 2,
];

/**
 * The form card with the alter beside its start edge, joined to it by a disc
 * in the card's colour, as the interview lays a per alter form out on a
 * screen wider than it is tall.
 */
function Card() {
  return (
    <>
      <circle
        cx={NODE[0]}
        cy={NODE[1]}
        r={NODE_R + 14}
        className="fill-cyber-grape"
      />
      <rect
        x={NODE[0]}
        y={NODE[1] - 22}
        width={CARD.x - NODE[0] + 12}
        height={44}
        className="fill-cyber-grape"
      />
      <rect
        x={CARD.x}
        y={CARD.y}
        width={CARD.width}
        height={CARD.height}
        rx={20}
        className="fill-cyber-grape"
      />
    </>
  );
}

/** One alter's answers inside the card. */
function Answers({
  lift,
  opacity,
  typed,
  caret,
  chosen,
}: {
  lift: number;
  opacity: number;
  typed: string;
  caret: boolean;
  chosen: number | undefined;
}) {
  if (opacity <= 0) return null;
  return (
    <g transform={`translate(0 ${lift})`} opacity={opacity}>
      <text
        x={CARD.x + 28}
        y={CARD.y + 34}
        fontSize={15}
        fontWeight={800}
        className="fill-white"
      >
        {TEXT.nickname}
      </text>
      <TextBox
        x={CARD.x + 28}
        y={CARD.y + 46}
        width={CARD.width - 56}
        text={typed}
        caret={caret}
      />
      <text
        x={CARD.x + 28}
        y={CARD.y + 126}
        fontSize={15}
        fontWeight={800}
        className="fill-white"
      >
        {TEXT.closeness}
      </text>
      {TEXT.options.map((option, i) => (
        <g key={option}>
          <circle
            cx={CARD.x + 40}
            cy={OPTION_Y(i) - 5}
            r={8}
            className="fill-navy-taupe stroke-white/50"
            strokeWidth={2}
          />
          {chosen === i ? (
            <circle
              cx={CARD.x + 40}
              cy={OPTION_Y(i) - 5}
              r={4.5}
              className="fill-sea-green"
            />
          ) : null}
          <text
            x={CARD.x + 58}
            y={OPTION_Y(i)}
            fontSize={14}
            fontWeight={600}
            className="fill-white"
          >
            {option}
          </text>
        </g>
      ))}
    </g>
  );
}

/**
 * Shows a per alter form where the participant types a nickname and chooses an
 * answer for the alter Sam, then presses Next, and the form clears as the next
 * alter, Ana, takes Sam's place beside the form.
 */
export const AlterFormIntroScene = defineScene(5.4, ({ t }) => {
  const typed = TEXT.typed.slice(
    0,
    Math.round(TEXT.typed.length * segment(t, 0.8, 0.9)),
  );
  const chosen = t >= 2.3 ? 1 : undefined;
  const next = 3.3;
  const answersOut = smooth(segment(t, next, 0.18));
  const personOut = smooth(segment(t, next + 0.2, 0.2));
  const personIn = smooth(segment(t, next + 0.34, 0.35));
  const answersIn = smooth(segment(t, next + 0.64, 0.26));
  const moved = t >= next;
  return {
    rail: {
      progress: lerp(0.4, 0.46, smooth(segment(t, next, 0.6))),
      press: pressAt(t, [3.1]),
    },
    body: (
      <>
        <Card />
        <Answers
          lift={answersOut * 12}
          opacity={1 - answersOut}
          typed={typed}
          caret={t >= 0.8 && t < 1.9}
          chosen={chosen}
        />
        {moved ? (
          <Answers
            lift={(1 - answersIn) * 12}
            opacity={answersIn}
            typed=""
            caret={false}
            chosen={undefined}
          />
        ) : null}
        {personOut < 1 ? (
          <g opacity={1 - personOut}>
            <PersonNode
              x={NODE[0]}
              y={NODE[1]}
              r={NODE_R}
              label={SAM}
              k={1 - personOut * 0.4}
            />
          </g>
        ) : null}
        {moved && personIn > 0 ? (
          <g opacity={personIn}>
            <PersonNode
              x={NODE[0]}
              y={NODE[1] - (1 - personIn) * 56}
              r={NODE_R}
              label={ANA}
              k={0.7 + personIn * 0.3}
            />
          </g>
        ) : null}
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: [CARD.x + 120, CARD.y + 66], at: 0.7 },
          { to: [CARD.x + 40, OPTION_Y(1) - 5], at: 2.3 },
          { to: NEXT_BUTTON, at: 3.1 },
        ]}
        leave={3.8}
      />
    ),
  };
});
