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
  width: 380,
  height: 230,
  x: STAGE_CENTER_X - 190,
  y: STAGE.y + 96,
} as const;
const OPTION_Y = (i: number) => CARD.y + 150 + i * 26;

/** One alter's slide: the node above the form card, as the interview draws it. */
function Slide({
  label,
  offset,
  typed,
  caret,
  chosen,
}: {
  label: string;
  offset: number;
  typed: string;
  caret: boolean;
  chosen: number | undefined;
}) {
  return (
    <g transform={`translate(${offset} 0)`}>
      <PersonNode
        x={STAGE_CENTER_X}
        y={STAGE.y + 50}
        r={32}
        label={label}
        k={1}
      />
      <rect
        x={CARD.x}
        y={CARD.y}
        width={CARD.width}
        height={CARD.height}
        rx={20}
        className="fill-cyber-grape"
      />
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
 * A per alter form: the same form for each alter in turn. The participant
 * answers it, presses Next, and the next alter's form slides in.
 */
export const AlterFormIntroScene = defineScene(5.4, ({ t }) => {
  const typed = TEXT.typed.slice(
    0,
    Math.round(TEXT.typed.length * segment(t, 0.8, 0.9)),
  );
  const chosen = t >= 2.3 ? 1 : undefined;
  const slide = smooth(segment(t, 3.3, 0.6));
  const span = 520;
  return {
    rail: { progress: lerp(0.4, 0.46, slide), press: pressAt(t, [3.1]) },
    body: (
      <>
        <Slide
          label={SAM}
          offset={-slide * span}
          typed={typed}
          caret={t >= 0.8 && t < 1.9}
          chosen={chosen}
        />
        {slide > 0 ? (
          <Slide
            label={ANA}
            offset={(1 - slide) * span}
            typed=""
            caret={false}
            chosen={undefined}
          />
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
