'use client';

import { Cursor } from '@codaco/art/illustration/Cursor';
import { DottedPath } from '@codaco/art/illustration/DottedPath';
import {
  backOut,
  grow,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';

import { GroundShadow, lerp, link, pivot, smooth, type Point } from './parts';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  NameCard,
  PersonNode,
  ROSTER,
} from './rosterParts';

// The roster as a column of name cards: the cursor drags one across to the
// interview, where it becomes a person.
const LIST_X = 140;
const listY = (index: number) => 56 + index * 72;
const PICK = 2;
const GRAB: Point = [LIST_X + 40, listY(PICK) + CARD_HEIGHT / 2];
const DROP: Point = [860, 225];
const PATH = link(GRAB, DROP);
const GRAB_AT = 1;
const DRAG_AT = 1.1;
const DROP_AT = 1.9;

export function RosterDragScene() {
  const END = 3;
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const glide = smooth(segment(t, GRAB_AT - 0.6, 0.6));
  const drag = smooth(segment(t, DRAG_AT, DROP_AT - DRAG_AT));
  const shrink = smooth(segment(t, DROP_AT, 0.25));
  const node = backOut(segment(t, DROP_AT + 0.1, 0.5));
  const close = smooth(segment(t, DROP_AT + 0.2, 0.4));
  const start: Point = [560, 430];
  const tip: Point =
    t < DRAG_AT
      ? [
          lerp(start[0], GRAB[0], glide),
          lerp(start[1], GRAB[1], glide) - Math.sin(Math.PI * glide) * 30,
        ]
      : PATH.at(drag);
  const cursor = segment(t, 0.2, 0.3) * (1 - segment(t, DROP_AT + 0.2, 0.3));
  const offset: Point =
    t < DRAG_AT ? [0, 0] : [tip[0] - GRAB[0], tip[1] - GRAB[1]];
  const lifted = t >= DRAG_AT ? 1 : 0;
  const cardCenter: Point = [
    LIST_X + CARD_WIDTH / 2 + offset[0],
    listY(PICK) + CARD_HEIGHT / 2 + offset[1],
  ];

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={LIST_X + CARD_WIDTH / 2} cy={430} rx={150} />
      <circle
        cx={DROP[0]}
        cy={DROP[1] + bob}
        r={175 * grow(backOut(segment(t, 0.3, 0.5)))}
        className="fill-navy-taupe/5 stroke-navy-taupe/20"
        strokeWidth={5}
        strokeDasharray="2 14"
        strokeLinecap="round"
      />
      <g opacity={segment(t, DRAG_AT, 0.3) * (1 - segment(t, DROP_AT, 0.3))}>
        <DottedPath d={PATH.d} time={t} />
      </g>
      {ROSTER.map(([name], index) => {
        if (index === PICK) return null;
        const k = backOut(segment(t, index * 0.08, 0.45));
        const y = listY(index) - (index > PICK ? close * 72 : 0);
        return (
          <g
            key={name}
            transform={`translate(${LIST_X + (1 - k) * -30} ${y + bob})`}
            opacity={Math.min(1, k)}
          >
            <NameCard name={name} />
          </g>
        );
      })}
      {shrink < 1 ? (
        <g
          transform={`${pivot(cardCenter[0], cardCenter[1] + bob, 1 - shrink)} rotate(${Math.sin(Math.PI * drag) * -6} ${cardCenter[0]} ${cardCenter[1]})`}
          opacity={Math.min(1, backOut(segment(t, PICK * 0.08, 0.45)))}
        >
          <g
            transform={`translate(${LIST_X + offset[0]} ${listY(PICK) + offset[1] + bob - lifted * 4})`}
          >
            <NameCard name={ROSTER[PICK][0]} />
          </g>
        </g>
      ) : null}
      {node > 0 ? (
        <g transform={pivot(DROP[0], DROP[1] + bob, node)}>
          <PersonNode x={DROP[0]} y={DROP[1] + bob} r={64} name="Lisa" />
        </g>
      ) : null}
      {cursor > 0 ? (
        <Cursor
          tip={[tip[0], tip[1] + (t >= DRAG_AT ? bob : 0)]}
          fill="fill-sea-serpent"
          opacity={cursor}
        />
      ) : null}
    </svg>
  );
}

// A roster card grows a second line with a detail from the file.
const DETAIL_SCALE = 1.7;
const DETAIL_WIDTH = 260;

export function CardDetailScene() {
  const END = 2.2;
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const card = backOut(segment(t, 0, 0.5));
  const detail = backOut(segment(t, 1, 0.5));
  const flash = segment(t, 1.2, 0.3) * (1 - segment(t, 1.8, 0.4));
  const x = 600 - (DETAIL_WIDTH * DETAIL_SCALE) / 2;
  const y = 130;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={600} cy={400} rx={240} />
      <g
        transform={`translate(0 ${bob}) ${pivot(600, 200, card)} translate(${x} ${y}) scale(${DETAIL_SCALE})`}
      >
        <NameCard
          name="Marge"
          width={DETAIL_WIDTH}
          detail="Gender: female"
          detailK={Math.max(0, detail)}
        >
          <rect
            x={50}
            y={56}
            width={170}
            height={30}
            rx={10}
            className="fill-mustard/40"
            opacity={flash}
          />
        </NameCard>
      </g>
    </svg>
  );
}
