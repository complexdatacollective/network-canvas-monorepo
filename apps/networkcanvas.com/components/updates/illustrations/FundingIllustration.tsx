'use client';

import { useId } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  backOut,
  inCubic,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from './illustrationMotion';

const OXFORD_START = 0.2;
const NORTHWESTERN_START = 0.45;
const ARC_START = 1;
const PLAN_START = 1.8;
const DROP_START = 2.9;
const IMPACT = 3.2;
const OUT_START = 6.8;
const LOOP = 7.4;
const STILL_TIME = 4.2;

const CARD = { y: 185, width: 250, height: 150 } as const;
const OXFORD = { x: 50, ...CARD } as const;
const NORTHWESTERN = { x: 900, ...CARD } as const;
const PLAN = { x: 360, y: 160, width: 480, height: 222 } as const;
const PLAN_IMAGE = {
  x: PLAN.x + 12,
  y: PLAN.y + 60,
  width: PLAN.width - 24,
  height: ((PLAN.width - 24) * 220) / 680,
} as const;
const STAMP = { x: 460, y: 338, width: 240, height: 112 } as const;

// The Oxford logo file has empty margins around the artwork (artwork spans
// 1270 × 605 of 1500 × 840 at (150, 165)); it is drawn so the artwork fills
// the card.
const OXFORD_LOGO_SCALE = 214 / 1270;

const ARC_START_POINT = [OXFORD.x + OXFORD.width / 2, OXFORD.y + 2] as const;
const ARC_CONTROL = [600, -30] as const;
const ARC_END_POINT = [
  NORTHWESTERN.x + NORTHWESTERN.width / 2,
  NORTHWESTERN.y + 2,
] as const;
const ARC_PATH = `M${ARC_START_POINT[0]} ${ARC_START_POINT[1]} Q${ARC_CONTROL[0]} ${ARC_CONTROL[1]} ${ARC_END_POINT[0]} ${ARC_END_POINT[1]}`;

const sparkles = [
  [110, 90, 1],
  [1090, 90, 0.9],
  [300, 430, 0.7],
  [900, 430, 0.8],
  [330, 118, 0.7],
  [870, 118, 0.8],
] as const;

const burstAngles = Array.from({ length: 12 }, (_, i) => (TAU * i) / 12);

const pivot = (x: number, y: number, k: number, dy = 0) =>
  `translate(${x} ${y + dy}) scale(${Math.max(0.001, k)}) translate(${-x} ${-y})`;

// Confetti: every piece is generated once from a seeded sequence (never
// Math.random, which would differ between server and client) and its position
// is a pure function of the time since the stamp landed.
const CONFETTI_COUNT = 58;
const CONFETTI_ORIGIN = [STAMP.x, STAMP.y] as const;
const CONFETTI_DRAG = 2.4;
const CONFETTI_GRAVITY = 480;

const confettiColors = [
  { fill: 'fill-sea-green', stroke: 'stroke-sea-green' },
  { fill: 'fill-neon-coral', stroke: 'stroke-neon-coral' },
  { fill: 'fill-mustard', stroke: 'stroke-mustard' },
  { fill: 'fill-cerulean-blue', stroke: 'stroke-cerulean-blue' },
  { fill: 'fill-slate-blue', stroke: 'stroke-slate-blue' },
  { fill: 'fill-purple-pizazz', stroke: 'stroke-purple-pizazz' },
  { fill: 'fill-paradise-pink', stroke: 'stroke-paradise-pink' },
  { fill: 'fill-kiwi', stroke: 'stroke-kiwi' },
  { fill: 'fill-neon-carrot', stroke: 'stroke-neon-carrot' },
] as const;

const confettiShapes = ['rect', 'squiggle', 'dot', 'rect'] as const;

const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const round = (value: number) => Math.round(value * 100) / 100;

const confetti = (() => {
  const random = seeded(2016);
  return Array.from({ length: CONFETTI_COUNT }, (_, index) => {
    const angle = ((index + random() * 0.8) / CONFETTI_COUNT) * TAU;
    const speed =
      (480 + random() * 680) * (1 - 0.3 * Math.max(0, -Math.sin(angle)));
    // Pieces thrown downward would leave the frame at once, so they are
    // thrown more gently.
    const downward = Math.sin(angle) > 0.25 ? 0.45 : 1;
    return {
      shape: confettiShapes[index % confettiShapes.length]!,
      color: confettiColors[(index * 5) % confettiColors.length]!,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * downward - 120,
      delay: random() * 0.1,
      life: 2.3 + random() * 0.7,
      rotation: random() * 360,
      spin: (random() - 0.5) * 900,
      flip: 4 + random() * 7,
      flipPhase: random() * TAU,
      size: 1.1 + random() * 0.7,
      flutter: 10 + random() * 22,
      flutterRate: 3 + random() * 4,
      flutterPhase: random() * TAU,
    };
  });
})();

function Confetti({ since }: { since: number }) {
  return (
    <g>
      {confetti.map((piece, index) => {
        const age = since - piece.delay;
        if (age <= 0 || age >= piece.life) return null;
        const glide = 1 - Math.exp(-CONFETTI_DRAG * age);
        const sway =
          Math.sin(piece.flutterRate * age + piece.flutterPhase) *
          piece.flutter *
          segment(age, 0.25, 0.6);
        const x =
          CONFETTI_ORIGIN[0] + (piece.vx / CONFETTI_DRAG) * glide + sway;
        const y =
          CONFETTI_ORIGIN[1] +
          (piece.vy / CONFETTI_DRAG) * glide +
          (CONFETTI_GRAVITY / CONFETTI_DRAG) * (age - glide / CONFETTI_DRAG);
        const tumble = Math.max(
          0.15,
          Math.abs(Math.cos(piece.flip * age + piece.flipPhase)),
        );
        const size = piece.size * Math.min(1, age / 0.1);
        const opacity =
          (1 - segment(age, piece.life - 0.7, 0.7)) * (1 - segment(y, 425, 40));
        return (
          <g
            key={index}
            transform={`translate(${round(x)} ${round(y)}) rotate(${round(
              piece.rotation + piece.spin * age,
            )}) scale(${round(size)} ${round(size * tumble)})`}
            opacity={round(opacity)}
          >
            {piece.shape === 'rect' ? (
              <rect
                x={-7}
                y={-4}
                width={14}
                height={8}
                rx={1.5}
                className={piece.color.fill}
              />
            ) : null}
            {piece.shape === 'squiggle' ? (
              <path
                d="M-10 0 Q-7 -7 -3.5 0 T3.5 0 T10 0"
                fill="none"
                className={piece.color.stroke}
                strokeWidth={3.5}
                strokeLinecap="round"
              />
            ) : null}
            {piece.shape === 'dot' ? (
              <circle r={4.5} className={piece.color.fill} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

const pillWidth = (label: string) => label.length * 10.5 + 36;

function LocationPill({
  label,
  x,
  y,
  className,
}: {
  label: string;
  x: number;
  y: number;
  className: string;
}) {
  const width = pillWidth(label);
  return (
    <g>
      <rect
        x={x - width / 2}
        y={y - 19}
        width={width}
        height={38}
        rx={19}
        className={cx(className, outline)}
        strokeWidth={4}
      />
      <text
        x={x}
        y={y + 6.5}
        textAnchor="middle"
        fontSize={18}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        {label}
      </text>
    </g>
  );
}

export function FundingIllustration() {
  const { ref, time } = useIllustrationClock(STILL_TIME);
  const clipPrefix = `funding-${useId().replace(/[^\w-]/g, '')}`;
  const t = time % LOOP;
  const out = inCubic(segment(t, OUT_START, 0.4));
  const bob = (phase: number) => Math.sin((TAU * t) / 3 + phase);

  const oxford = backOut(segment(t, OXFORD_START, 0.55)) * (1 - out);
  const northwestern =
    backOut(segment(t, NORTHWESTERN_START, 0.55)) * (1 - out);
  const plan = backOut(segment(t, PLAN_START, 0.6)) * (1 - out);
  const planDrop = (1 - Math.min(1, plan)) * 70;
  const arcReveal = segment(t, ARC_START, 0.9);
  const arcOpacity = 1 - out;

  const drop = inCubic(segment(t, DROP_START, 0.3));
  const impact = segment(t, IMPACT, 0.35);
  const pulse = Math.sin(Math.PI * impact);
  const burst = segment(t, IMPACT, 0.5);
  const stampVisible = t >= DROP_START;
  const stampScale = 1 + 1.6 * (1 - drop);
  const stampRotation =
    -12 - 22 * (1 - drop) + Math.sin((TAU * t) / 3.4) * 1.2 * drop;
  const stampOpacity = segment(t, DROP_START, 0.12);
  const planDip = pulse * 7;
  const planTransform = pivot(
    PLAN.x + PLAN.width / 2,
    PLAN.y + PLAN.height / 2,
    plan,
    planDrop + bob(1) * 3 + planDip,
  );

  const clipOxford = `${clipPrefix}-oxford`;
  const clipNorthwestern = `${clipPrefix}-northwestern`;
  const clipPlan = `${clipPrefix}-plan`;
  const clipArc = `${clipPrefix}-arc`;

  const oxfordCx = OXFORD.x + OXFORD.width / 2;
  const northwesternCx = NORTHWESTERN.x + NORTHWESTERN.width / 2;
  const cardCy = CARD.y + CARD.height / 2;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto w-full overflow-visible"
      aria-hidden
    >
      <clipPath id={clipOxford}>
        <rect
          x={OXFORD.x}
          y={OXFORD.y}
          width={OXFORD.width}
          height={OXFORD.height}
          rx={28}
        />
      </clipPath>
      <clipPath id={clipNorthwestern}>
        <rect
          x={NORTHWESTERN.x}
          y={NORTHWESTERN.y}
          width={NORTHWESTERN.width}
          height={NORTHWESTERN.height}
          rx={28}
        />
      </clipPath>
      <clipPath id={clipPlan}>
        <rect
          x={PLAN_IMAGE.x}
          y={PLAN_IMAGE.y}
          width={PLAN_IMAGE.width}
          height={PLAN_IMAGE.height}
          rx={14}
        />
      </clipPath>
      <clipPath id={clipArc}>
        <rect
          x={0}
          y={0}
          width={ARC_START_POINT[0] + 850 * arcReveal}
          height={460}
        />
      </clipPath>
      <g className="fill-white">
        {sparkles.map(([x, y, size], index) => {
          const twinkle =
            0.5 + 0.5 * Math.sin((TAU * time) / 2.4 + index * 2.1);
          return (
            <path
              key={`${x}-${y}`}
              transform={`translate(${x} ${y}) scale(${size * (0.6 + 0.4 * twinkle) * (1 - out)})`}
              d="M0 -16 Q2 -2 16 0 Q2 2 0 16 Q-2 2 -16 0 Q-2 -2 0 -16 Z"
              opacity={0.4 + 0.6 * twinkle}
            />
          );
        })}
      </g>
      <ellipse
        cx={oxfordCx}
        cy={414}
        rx={110 * Math.min(1, oxford)}
        ry={12}
        className="fill-navy-taupe/12"
      />
      <ellipse
        cx={northwesternCx}
        cy={414}
        rx={110 * Math.min(1, northwestern)}
        ry={12}
        className="fill-navy-taupe/12"
      />
      <ellipse
        cx={PLAN.x + PLAN.width / 2}
        cy={414}
        rx={220 * Math.min(1, plan)}
        ry={13}
        className="fill-navy-taupe/12"
      />
      <g clipPath={`url(#${clipArc})`} opacity={arcOpacity}>
        <path
          d={ARC_PATH}
          fill="none"
          className="stroke-navy-taupe/40"
          strokeWidth={5}
          strokeDasharray="2 14"
          strokeDashoffset={-time * 30}
          strokeLinecap="round"
        />
      </g>
      <g transform={pivot(oxfordCx, cardCy, oxford, bob(0) * 4)}>
        <rect
          x={OXFORD.x}
          y={OXFORD.y}
          width={OXFORD.width}
          height={OXFORD.height}
          rx={28}
          className={cx('fill-white', outline)}
          strokeWidth={6}
        />
        <image
          href="/images/logos/oxford.png"
          x={OXFORD.x + 18 - 150 * OXFORD_LOGO_SCALE}
          y={OXFORD.y + 24 - 165 * OXFORD_LOGO_SCALE}
          width={1500 * OXFORD_LOGO_SCALE}
          height={840 * OXFORD_LOGO_SCALE}
          clipPath={`url(#${clipOxford})`}
        />
        <rect
          x={OXFORD.x}
          y={OXFORD.y}
          width={OXFORD.width}
          height={OXFORD.height}
          rx={28}
          fill="none"
          className={outline}
          strokeWidth={6}
        />
        <LocationPill
          label="Oxford, UK"
          x={oxfordCx}
          y={OXFORD.y + OXFORD.height + 36}
          className="fill-cerulean-blue/25"
        />
      </g>
      <g transform={pivot(northwesternCx, cardCy, northwestern, bob(2) * 4)}>
        <rect
          x={NORTHWESTERN.x}
          y={NORTHWESTERN.y}
          width={NORTHWESTERN.width}
          height={NORTHWESTERN.height}
          rx={28}
          className={cx('fill-white', outline)}
          strokeWidth={6}
        />
        <image
          href="/images/logos/northwestern.svg"
          x={NORTHWESTERN.x + 20}
          y={NORTHWESTERN.y + 20}
          width={NORTHWESTERN.width - 40}
          height={NORTHWESTERN.height - 40}
          preserveAspectRatio="xMidYMid meet"
          clipPath={`url(#${clipNorthwestern})`}
        />
        <LocationPill
          label="Chicago, US"
          x={northwesternCx}
          y={NORTHWESTERN.y + NORTHWESTERN.height + 36}
          className="fill-purple-pizazz/25"
        />
      </g>
      <g transform={planTransform}>
        <rect
          x={PLAN.x}
          y={PLAN.y}
          width={PLAN.width}
          height={PLAN.height}
          rx={28}
          className={cx('fill-white', outline)}
          strokeWidth={6}
        />
        <text
          x={PLAN.x + 26}
          y={PLAN.y + 36}
          fontSize={26}
          fontWeight={900}
          letterSpacing={1}
          className="fill-navy-taupe"
        >
          2016 PLAN
        </text>
        <image
          href="/images/updates/network-canvas-suite-2016.jpg"
          x={PLAN_IMAGE.x}
          y={PLAN_IMAGE.y}
          width={PLAN_IMAGE.width}
          height={PLAN_IMAGE.height}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipPlan})`}
        />
        <rect
          x={PLAN_IMAGE.x}
          y={PLAN_IMAGE.y}
          width={PLAN_IMAGE.width}
          height={PLAN_IMAGE.height}
          rx={14}
          fill="none"
          className="stroke-navy-taupe/25"
          strokeWidth={3}
        />
      </g>
      <Confetti since={t - IMPACT} />
      <g transform={planTransform}>
        {stampVisible ? (
          <g transform={`translate(${STAMP.x} ${STAMP.y})`}>
            <g opacity={1 - burst}>
              {(burst > 0 && burst < 1 ? burstAngles : []).map(
                (angle, index) => {
                  const rx = STAMP.width / 2 + 14 + burst * 16;
                  const ry = STAMP.height / 2 + 14 + burst * 16;
                  const length = 26 * (1 - burst * 0.5);
                  const x1 = Math.cos(angle) * rx;
                  const y1 = Math.sin(angle) * ry;
                  const x2 = Math.cos(angle) * (rx + length);
                  const y2 = Math.sin(angle) * (ry + length);
                  return (
                    <line
                      key={angle}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className={
                        index % 2 === 0
                          ? 'stroke-neon-coral'
                          : 'stroke-navy-taupe'
                      }
                      strokeWidth={6}
                      strokeLinecap="round"
                    />
                  );
                },
              )}
            </g>
            <g
              opacity={stampOpacity}
              transform={`rotate(${stampRotation}) scale(${stampScale * (1 + 0.1 * pulse)} ${
                stampScale * (1 - 0.14 * pulse)
              })`}
            >
              <rect
                x={-STAMP.width / 2}
                y={-STAMP.height / 2}
                width={STAMP.width}
                height={STAMP.height}
                rx={20}
                className="stroke-neon-coral fill-white/85"
                strokeWidth={8}
              />
              <rect
                x={-STAMP.width / 2 + 10}
                y={-STAMP.height / 2 + 10}
                width={STAMP.width - 20}
                height={STAMP.height - 20}
                rx={12}
                fill="none"
                className="stroke-neon-coral/70"
                strokeWidth={3}
              />
              <text
                y={-8}
                textAnchor="middle"
                fontSize={36}
                fontWeight={900}
                letterSpacing={4}
                className="fill-neon-coral"
              >
                NIH
              </text>
              <text
                y={32}
                textAnchor="middle"
                fontSize={40}
                fontWeight={900}
                letterSpacing={3}
                className="fill-neon-coral"
              >
                FUNDED
              </text>
            </g>
          </g>
        ) : null}
      </g>
    </svg>
  );
}
