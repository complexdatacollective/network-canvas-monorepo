import { motion, type Transition, useReducedMotion } from 'motion/react';

// The start page's hero: research questions are written out on a card, the
// terms that matter flow into a sociogram as people, places and measures,
// and the interview's stages line up underneath. It plays once, then only a
// mustard tie keeps being sketched. With reduced motion it renders the
// finished picture and nothing moves. Purely decorative.

const CENTRE = { x: 404, y: 186 };

type Point = { x: number; y: number };

const people = {
  maya: { label: 'Maya', x: 356, y: 98 },
  sam: { label: 'Sam', x: 494, y: 124 },
  jordan: { label: 'Jordan', x: 504, y: 236 },
  ade: { label: 'Ade', x: 420, y: 300 },
} satisfies Record<string, Point & { label: string }>;

const places = {
  dorm: { label: 'Dorm', x: 312, y: 232 },
  bar: { label: 'Bar', x: 336, y: 318 },
} satisfies Record<string, Point & { label: string }>;

// Gentle curve between two points, bowed towards the sociogram's centre.
const tie = (a: Point, b: Point, bow = 0.18) => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const cx = mx + (CENTRE.x - mx) * bow;
  const cy = my + (CENTRE.y - my) * bow;
  return `M${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
};

const TIES = [
  { d: tie(people.maya, people.sam), kind: 'friend' },
  { d: tie(people.sam, people.jordan), kind: 'friend' },
  { d: tie(people.jordan, people.ade), kind: 'friend' },
  { d: tie(people.maya, places.dorm), kind: 'place' },
  { d: tie(people.ade, places.bar), kind: 'place' },
] as const;

// Each highlighted term leaves the card from a dot at its line's end.
const FLOWS = [
  {
    from: { x: 262, y: 92 },
    to: people.maya,
    dot: 'fill-neon-coral',
    stroke: 'stroke-neon-coral',
  },
  {
    from: { x: 262, y: 136 },
    to: people.ade,
    dot: 'fill-mustard',
    stroke: 'stroke-mustard',
  },
  {
    from: { x: 262, y: 194 },
    to: places.dorm,
    dot: 'fill-sea-green',
    stroke: 'stroke-sea-green',
  },
];

const flowPath = (a: Point, b: Point) =>
  `M${a.x} ${a.y} C ${a.x + 40} ${a.y}, ${b.x - 40} ${b.y}, ${b.x} ${b.y}`;

const STAGES = [
  {
    label: 'Name generator',
    w: 162,
    dot: 'fill-neon-coral',
    num: 'fill-white',
  },
  { label: 'Sociogram', w: 124, dot: 'fill-slate-blue', num: 'fill-white' },
  { label: 'Alter form', w: 120, dot: 'fill-mustard', num: 'fill-on-light' },
];
const STAGE_GAP = 14;
const STAGES_WIDTH =
  STAGES.reduce((sum, s) => sum + s.w, 0) + STAGE_GAP * (STAGES.length - 1);
const STAGES_START = (560 - STAGES_WIDTH) / 2;
const STAGES_END = STAGES_START + STAGES_WIDTH;
const STAGE_X = STAGES.map(
  (_, i) =>
    STAGES_START +
    STAGES.slice(0, i).reduce((sum, s) => sum + s.w + STAGE_GAP, 0),
);

// The card's lines, with the terms Sketch reads drawn in colour.
const LINES: { y: number; parts: { text: string; className?: string }[] }[] = [
  {
    y: 98,
    parts: [
      { text: '1. Do ' },
      { text: 'close friends', className: 'fill-neon-coral font-bold' },
    ],
  },
  { y: 120, parts: [{ text: 'shape a student’s own' }] },
  {
    y: 142,
    parts: [
      { text: 'drinking', className: 'fill-mustard-ink font-bold' },
      { text: '?' },
    ],
  },
  {
    y: 178,
    parts: [
      { text: '2. ' },
      { text: 'Where', className: 'fill-sea-green-deep font-bold' },
      { text: ' do they spend' },
    ],
  },
  { y: 200, parts: [{ text: 'time together?' }] },
];

const T = {
  card: 0.1,
  line: (i: number) => 0.45 + i * 0.32,
  dots: 2.2,
  flows: 2.4,
  nodes: 2.9,
  ties: 3.5,
  pips: 4.1,
  stages: 4.3,
  sketch: 5.1,
};

const pop = (delay: number): Transition => ({
  type: 'spring',
  bounce: 0.45,
  duration: 0.6,
  delay,
});

const ease = (delay: number, duration = 0.5): Transition => ({
  duration,
  delay,
  ease: [0.22, 1, 0.36, 1],
});

type NodeProps = Point & {
  label: string;
  r: number;
  fill: string;
  shade: string;
  text: string;
  delay: number;
  bob: string;
  still: boolean;
};

const Node = ({
  x,
  y,
  label,
  r,
  fill,
  shade,
  text,
  delay,
  bob,
  still,
}: NodeProps) => (
  <g
    className="motion-safe:animate-bob transform-fill"
    style={{ animationDelay: bob }}
  >
    <motion.g
      initial={still ? false : { scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop(delay)}
    >
      <circle cx={x} cy={y + 3} r={r} className={shade} />
      <circle cx={x} cy={y} r={r} className={fill} />
      <text
        x={x}
        y={y + 4.5}
        textAnchor="middle"
        className={`font-display text-[12.5px] font-extrabold ${text}`}
      >
        {label}
      </text>
    </motion.g>
  </g>
);

export const HeroArt = () => {
  const still = useReducedMotion() === true;
  const from = <V,>(value: V) => (still ? false : value);

  return (
    <svg
      viewBox="0 0 560 420"
      aria-hidden="true"
      focusable="false"
      className="block h-auto w-full overflow-visible"
    >
      <defs>
        {LINES.map((line, i) => (
          <clipPath key={line.y} id={`sketch-hero-line-${i}`}>
            <motion.rect
              x="30"
              y={line.y - 16}
              height="22"
              initial={from({ width: 0 })}
              animate={{ width: 236 }}
              transition={ease(T.line(i), 0.45)}
            />
          </clipPath>
        ))}
      </defs>

      {/* The sociogram's rings */}
      <motion.g
        initial={from({ opacity: 0, scale: 0.92 })}
        animate={{ opacity: 1, scale: 1 }}
        transition={ease(0, 0.9)}
      >
        <circle
          cx={CENTRE.x}
          cy={CENTRE.y}
          r="152"
          className="fill-night-ring stroke-[oklch(0.36_0.08_281)]"
          strokeWidth="1.5"
        />
        <circle
          cx={CENTRE.x}
          cy={CENTRE.y}
          r="104"
          className="fill-[oklch(0.285_0.085_281)] stroke-[oklch(0.38_0.08_281)]"
          strokeWidth="1.5"
        />
        <circle
          cx={CENTRE.x}
          cy={CENTRE.y}
          r="54"
          className="fill-night-tile stroke-[oklch(0.42_0.08_281)]"
          strokeWidth="1.5"
        />
      </motion.g>

      {/* Ties */}
      <g fill="none" strokeLinecap="round">
        {TIES.map((t, i) => (
          <motion.path
            key={t.d}
            d={t.d}
            strokeWidth={t.kind === 'friend' ? 3.5 : 2.5}
            className={
              t.kind === 'friend'
                ? 'stroke-[oklch(0.92_0.02_281)]'
                : 'stroke-cerulean'
            }
            initial={from({ pathLength: 0, opacity: 0 })}
            animate={{
              pathLength: 1,
              opacity: t.kind === 'friend' ? 0.75 : 0.9,
            }}
            transition={ease(T.ties + i * 0.09, 0.55)}
          />
        ))}
        {/* The tie still being sketched */}
        <motion.path
          d={tie(places.dorm, people.ade, 0.1)}
          className="stroke-mustard motion-safe:animate-draw"
          strokeWidth="3.5"
          strokeDasharray="2 10"
          initial={from({ opacity: 0 })}
          animate={{ opacity: 1 }}
          transition={ease(T.sketch, 0.6)}
        />
      </g>

      {/* Flows from the card into the sociogram */}
      <g fill="none" strokeLinecap="round" strokeWidth="2">
        {FLOWS.map((f, i) => (
          <motion.path
            key={f.dot}
            d={flowPath(f.from, f.to)}
            className={f.stroke}
            initial={from({ pathLength: 0, opacity: 0 })}
            animate={{ pathLength: 1, opacity: 0.6 }}
            transition={ease(T.flows + i * 0.12, 0.7)}
          />
        ))}
      </g>

      {/* Ego */}
      <Node
        {...CENTRE}
        label="You"
        r={22}
        fill="fill-slate-blue"
        shade="fill-[oklch(0.45_0.17_281)]"
        text="fill-white"
        delay={T.nodes}
        bob="-1.1s"
        still={still}
      />
      {Object.values(people).map((p, i) => (
        <Node
          key={p.label}
          {...p}
          r={25}
          fill="fill-neon-coral"
          shade="fill-neon-coral-shade"
          text="fill-white"
          delay={T.nodes + 0.1 + i * 0.09}
          bob={`-${(i * 0.85 + 0.3).toFixed(2)}s`}
          still={still}
        />
      ))}
      {Object.values(places).map((p, i) => (
        <Node
          key={p.label}
          {...p}
          r={21}
          fill="fill-sea-green"
          shade="fill-sea-green-shade"
          text="fill-on-light"
          delay={T.nodes + 0.5 + i * 0.09}
          bob={`-${(i * 1.3 + 2).toFixed(2)}s`}
          still={still}
        />
      ))}

      {/* Measures: the drinking variable recorded on two friends */}
      {[people.sam, people.ade].map((p, i) => (
        <motion.g
          key={p.label}
          initial={from({ scale: 0, opacity: 0 })}
          animate={{ scale: 1, opacity: 1 }}
          transition={pop(T.pips + i * 0.1)}
        >
          <circle
            cx={p.x + 20}
            cy={p.y - 20}
            r="9"
            className="fill-mustard stroke-night"
            strokeWidth="3"
          />
        </motion.g>
      ))}

      {/* The research questions card */}
      <motion.g
        initial={from({ opacity: 0, y: 14, rotate: 0 })}
        animate={{ opacity: 1, y: 0, rotate: -2.5 }}
        transition={ease(T.card, 0.7)}
      >
        <rect
          x="14"
          y="38"
          width="252"
          height="194"
          rx="20"
          className="fill-[oklch(0.42_0.08_281)]"
          transform="translate(0 4)"
        />
        <rect
          x="14"
          y="38"
          width="252"
          height="194"
          rx="20"
          className="fill-paper"
        />
        <text
          x="32"
          y="68"
          className="fill-ink-muted font-body text-[10.5px] font-bold tracking-[0.12em]"
        >
          RESEARCH QUESTIONS
        </text>
        <rect
          x="32"
          y="156"
          width="216"
          height="1.5"
          className="fill-paper-rule"
        />
        {LINES.map((line, i) => (
          <text
            key={line.y}
            x="32"
            y={line.y}
            clipPath={`url(#sketch-hero-line-${i})`}
            className="fill-ink font-body text-[15px]"
          >
            {line.parts.map((part) => (
              <tspan key={part.text} className={part.className}>
                {part.text}
              </tspan>
            ))}
          </text>
        ))}
        {FLOWS.map((f, i) => (
          <motion.circle
            key={f.dot}
            cx={f.from.x - 6}
            cy={f.from.y - 2}
            r="5.5"
            className={f.dot}
            initial={from({ scale: 0 })}
            animate={{ scale: 1 }}
            transition={pop(T.dots + i * 0.1)}
          />
        ))}
      </motion.g>

      {/* The interview's stages */}
      <motion.path
        d={`M${STAGES_START + 20} 384 H ${STAGES_END - 20}`}
        className="stroke-night-border"
        strokeWidth="2"
        strokeDasharray="3 6"
        initial={from({ opacity: 0 })}
        animate={{ opacity: 1 }}
        transition={ease(T.stages, 0.4)}
      />
      {STAGES.map((stage, i) => (
        <motion.g
          key={stage.label}
          initial={from({ opacity: 0, y: 18 })}
          animate={{ opacity: 1, y: 0 }}
          transition={ease(T.stages + i * 0.16, 0.55)}
        >
          <g transform={`translate(${STAGE_X[i]} 364)`}>
            <rect
              width={stage.w}
              height="40"
              rx="20"
              className="fill-[oklch(0.42_0.08_281)]"
              transform="translate(0 3)"
            />
            <rect width={stage.w} height="40" rx="20" className="fill-paper" />
            <circle cx="20" cy="20" r="11" className={stage.dot} />
            <text
              x="20"
              y="24.5"
              textAnchor="middle"
              className={`font-display text-[12px] font-black ${stage.num}`}
            >
              {i + 1}
            </text>
            <text
              x="38"
              y="25"
              className="fill-ink font-body text-[13.5px] font-bold"
            >
              {stage.label}
            </text>
          </g>
        </motion.g>
      ))}
    </svg>
  );
};
