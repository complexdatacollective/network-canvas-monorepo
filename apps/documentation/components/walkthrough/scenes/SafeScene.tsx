'use client';

import { KeyRound, MailX, User } from 'lucide-react';

import { Badge } from '@codaco/art/illustration/Badge';
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
  Icon,
  lerp,
  pivot,
  smooth,
  TextBar,
  type Point,
} from './parts';

// The reader's sign-in details slide into a safe and the door locks; then a
// stamp warns that no reset email can bring them back.
const CARD: Point = [300, 210];
const SAFE: Point = [800, 210];
const MOVE_AT = 1;
const MOVE = 0.9;
const LOCK_AT = 2;
const BADGE_AT = 2.5;
const END = 3.2;

export function SafeScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const card = backOut(segment(t, 0, 0.5));
  const safe = backOut(segment(t, 0.3, 0.5));
  const move = smooth(segment(t, MOVE_AT, MOVE));
  const lock = smooth(segment(t, LOCK_AT, 0.4));
  const badge = backOut(segment(t, BADGE_AT, 0.5));
  const cardX = lerp(CARD[0], SAFE[0], move);
  const cardY = lerp(CARD[1], SAFE[1], move) - Math.sin(Math.PI * move) * 90;
  const shrink = 1 - 0.75 * move;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={CARD[0]} cy={410} rx={150 * (1 - move) + 0.001} />
      <GroundShadow cx={SAFE[0]} cy={410} rx={170} />
      <g transform={`translate(0 ${bob}) ${pivot(SAFE[0], SAFE[1], safe)}`}>
        <rect
          x={SAFE[0] - 150}
          y={SAFE[1] - 160}
          width={300}
          height={320}
          rx={34}
          className={cx('fill-sea-serpent', outline)}
          strokeWidth={6}
        />
        <rect
          x={SAFE[0] - 115}
          y={SAFE[1] - 125}
          width={230}
          height={250}
          rx={22}
          className={cx('fill-white/25', outline)}
          strokeWidth={5}
        />
        <g transform={`rotate(${lock * 180} ${SAFE[0]} ${SAFE[1]})`}>
          <circle
            cx={SAFE[0]}
            cy={SAFE[1]}
            r={56}
            className={cx('fill-white', outline)}
            strokeWidth={6}
          />
          {[0, 90, 180, 270].map((angle) => (
            <line
              key={angle}
              x1={SAFE[0]}
              y1={SAFE[1] - 22}
              x2={SAFE[0]}
              y2={SAFE[1] - 46}
              className={outline}
              strokeWidth={6}
              strokeLinecap="round"
              transform={`rotate(${angle} ${SAFE[0]} ${SAFE[1]})`}
            />
          ))}
          <circle
            cx={SAFE[0]}
            cy={SAFE[1]}
            r={12}
            className="fill-navy-taupe"
          />
        </g>
        <rect
          x={SAFE[0] + 115}
          y={SAFE[1] - 50}
          width={22}
          height={100}
          rx={11}
          className={cx(lock > 0.5 ? 'fill-sea-green' : 'fill-white', outline)}
          strokeWidth={5}
        />
      </g>
      {move < 1 ? (
        <g
          transform={`translate(${cardX} ${cardY + bob}) scale(${grow(card * shrink)})`}
          opacity={1 - segment(t, MOVE_AT + MOVE - 0.2, 0.2)}
        >
          <rect
            x={-150}
            y={-95}
            width={300}
            height={190}
            rx={22}
            className={cx('fill-white', outline)}
            strokeWidth={6}
          />
          <Icon icon={User} x={-100} y={-38} size={34} />
          <TextBar x={-66} y={-38} width={150} />
          <Icon icon={KeyRound} x={-100} y={34} size={34} />
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <circle
              key={index}
              cx={-60 + index * 28}
              cy={34}
              r={8}
              className="fill-navy-taupe/60"
            />
          ))}
        </g>
      ) : null}
      <g
        transform={`translate(${SAFE[0] + 170} ${SAFE[1] - 150 + bob}) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(badge)})`}
      >
        <Badge r={56} fill="fill-neon-coral">
          <Icon icon={MailX} x={0} y={-10} size={38} className="text-white" />
          <text
            y={30}
            textAnchor="middle"
            fontSize={14}
            fontWeight={900}
            letterSpacing={2}
            className="fill-white"
          >
            NO RESET
          </text>
        </Badge>
      </g>
    </svg>
  );
}
