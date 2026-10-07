'use client';

import { useLocale } from 'next-intl';

import { cx } from '@codaco/fresco-ui/utils/cva';

import { outline, TAU, useIllustrationClock } from './illustrationMotion';

// A greeting for each of the site's languages. The viewer's own greeting
// starts at the front of the orbit.
const greetings = [
  { text: 'Hello', locales: ['en-US', 'en-GB'], width: 104 },
  { text: 'Hola', locales: ['es'], width: 96 },
  { text: 'Bonjour', locales: ['fr'], width: 128 },
  { text: '你好', locales: ['zh-Hans', 'zh-Hant'], width: 92 },
  { text: 'Hallo', locales: ['de'], width: 104 },
  { text: 'Olá', locales: ['pt-BR'], width: 84 },
  { text: 'Ciao', locales: ['it'], width: 92 },
  { text: 'Hoi', locales: ['nl'], width: 80 },
] as const;

const LOOP = 16;
const CENTER_X = 600;
const CENTER_Y = 200;
const GLOBE_R = 110;
const ORBIT_RX = 390;
const ORBIT_RY = 100;
const SPIN_PERIOD = 16;
const BUBBLE_HEIGHT = 48;

const RIPPLE_PERIOD = 7;
const RIPPLES = 3;

const sparkles = [
  [110, 70, 1],
  [250, 390, 0.8],
  [420, 40, 0.7],
  [960, 50, 0.9],
  [1110, 230, 0.8],
  [1050, 410, 1],
  [80, 260, 0.7],
] as const;

type Bubble = {
  text: string;
  width: number;
  depth: number;
  opacity: number;
  transform: string;
};

const bubblePath = (width: number) => {
  const h = BUBBLE_HEIGHT;
  const r = 20;
  return `M${r} 0 H${width - r} Q${width} 0 ${width} ${r} V${h - r} Q${width} ${h} ${
    width - r
  } ${h} H40 L18 ${h + 16} L22 ${h} H${r} Q0 ${h} 0 ${h - r} V${r} Q0 0 ${r} 0 Z`;
};

function GreetingBubble({ bubble }: { bubble: Bubble }) {
  return (
    <g transform={bubble.transform} opacity={bubble.opacity}>
      <path
        d={bubblePath(bubble.width)}
        className={cx('fill-white', outline)}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <text
        x={bubble.width / 2}
        y={32}
        textAnchor="middle"
        fontSize={22}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        {bubble.text}
      </text>
    </g>
  );
}

function Ripples({ time }: { time: number }) {
  return (
    <g fill="none" className="stroke-white" strokeWidth={6}>
      {Array.from({ length: RIPPLES }, (_, index) => {
        const progress = (time / RIPPLE_PERIOD + index / RIPPLES) % 1;
        const r = GLOBE_R + 30 + progress * 520;
        return (
          <ellipse
            key={index}
            cx={CENTER_X}
            cy={CENTER_Y}
            rx={r}
            ry={r * 0.62}
            opacity={0.9 * Math.sin(Math.PI * progress)}
          />
        );
      })}
    </g>
  );
}

function Sparkles({ time }: { time: number }) {
  return (
    <g className="fill-white">
      {sparkles.map(([x, y, size], index) => {
        const twinkle = 0.5 + 0.5 * Math.sin((TAU * time) / 2.4 + index * 2.1);
        return (
          <path
            key={`${x}-${y}`}
            transform={`translate(${x} ${y}) scale(${size * (0.6 + 0.4 * twinkle)})`}
            d="M0 -16 Q2 -2 16 0 Q2 2 0 16 Q-2 2 -16 0 Q-2 -2 0 -16 Z"
            opacity={0.4 + 0.6 * twinkle}
          />
        );
      })}
    </g>
  );
}

const orbitArc = (sweep: 0 | 1) =>
  `M${CENTER_X - ORBIT_RX} ${CENTER_Y} A${ORBIT_RX} ${ORBIT_RY} 0 0 ${sweep} ${
    CENTER_X + ORBIT_RX
  } ${CENTER_Y}`;

function OrbitTrack({ sweep }: { sweep: 0 | 1 }) {
  return (
    <path
      d={orbitArc(sweep)}
      fill="none"
      className="stroke-navy-taupe/20"
      strokeWidth={3}
      strokeDasharray="2 12"
      strokeLinecap="round"
    />
  );
}

const byDepth = (a: Bubble, b: Bubble) => a.depth - b.depth;

export function LanguageIllustration() {
  const locale = useLocale();
  const spacing = TAU / greetings.length;
  const localeIndex = Math.max(
    0,
    greetings.findIndex((greeting) =>
      (greeting.locales as readonly string[]).includes(locale),
    ),
  );
  const startTime =
    ((((0.25 - localeIndex / greetings.length) * LOOP) % LOOP) + LOOP) % LOOP;
  const { ref, time } = useIllustrationClock(startTime);
  const loopTime = time % LOOP;

  const bob = Math.sin((TAU * loopTime) / 4);
  const bubbles: Bubble[] = greetings.map((greeting, index) => {
    const angle = (TAU * loopTime) / LOOP + index * spacing;
    const depth = Math.sin(angle);
    const scale = 0.78 + 0.11 * (depth + 1);
    return {
      text: greeting.text,
      width: greeting.width,
      depth,
      opacity: 0.6 + 0.2 * (depth + 1),
      transform: `translate(${CENTER_X + Math.cos(angle) * ORBIT_RX} ${
        CENTER_Y + depth * ORBIT_RY
      }) scale(${scale}) translate(${-greeting.width / 2} ${-BUBBLE_HEIGHT / 2})`,
    };
  });
  const spin = (TAU * time) / SPIN_PERIOD;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto w-full overflow-visible"
      aria-hidden
    >
      <Ripples time={time} />
      <Sparkles time={time} />
      <ellipse
        cx={CENTER_X}
        cy={400}
        rx={100 - bob * 7}
        ry={14}
        className="fill-navy-taupe/12"
      />
      <OrbitTrack sweep={1} />
      {bubbles
        .filter((bubble) => bubble.depth <= 0)
        .sort(byDepth)
        .map((bubble) => (
          <GreetingBubble key={bubble.text} bubble={bubble} />
        ))}
      <g
        transform={`translate(${CENTER_X} ${CENTER_Y + bob * 6}) rotate(${
          Math.sin(spin) * 4
        })`}
        strokeWidth={4}
        fill="none"
      >
        <circle
          r={GLOBE_R}
          className={cx('fill-cerulean-blue', outline)}
          strokeWidth={6}
        />
        {[0, 1, 2].map((meridian) => (
          <ellipse
            key={meridian}
            rx={Math.max(
              0.5,
              GLOBE_R * Math.abs(Math.cos(spin + (meridian * Math.PI) / 3)),
            )}
            ry={GLOBE_R}
            className="stroke-white"
            opacity={0.75}
          />
        ))}
        <line
          x1={-GLOBE_R}
          x2={GLOBE_R}
          y1={0}
          y2={0}
          className="stroke-white"
          opacity={0.8}
        />
        <path
          d="M-93 -56 Q0 -40 93 -56"
          className="stroke-white"
          opacity={0.6}
        />
        <path d="M-93 56 Q0 40 93 56" className="stroke-white" opacity={0.6} />
        <circle r={GLOBE_R} className={outline} strokeWidth={6} />
      </g>
      <OrbitTrack sweep={0} />
      {bubbles
        .filter((bubble) => bubble.depth > 0)
        .sort(byDepth)
        .map((bubble) => (
          <GreetingBubble key={bubble.text} bubble={bubble} />
        ))}
    </svg>
  );
}
