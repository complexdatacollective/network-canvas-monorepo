import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  PartyPopper,
  Plus,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useId, type ComponentType, type ReactNode } from 'react';

import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import { ClickRing, Cursor } from '@codaco/art/illustration/Cursor';
import {
  backOut,
  grow,
  outline,
  segment,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

export type Point = readonly [number, number];

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 412;

const FRAME = { x: 10, y: 8, width: 700, height: 400 } as const;
export const CONTENT = browserContent(FRAME);

/** The interview's navigation rail runs down the left of the screen. */
const RAIL_WIDTH = 66;
const RAIL_X = CONTENT.x + RAIL_WIDTH / 2;
const BACK_BUTTON: Point = [RAIL_X, CONTENT.y + 92];
export const NEXT_BUTTON: Point = [RAIL_X, CONTENT.bottom - 40];

/** The part of an interview screen beside the navigation rail. */
export const STAGE = {
  x: CONTENT.x + RAIL_WIDTH,
  y: CONTENT.y,
  right: CONTENT.right,
  bottom: CONTENT.bottom,
} as const;
export const STAGE_CENTER_X = (STAGE.x + STAGE.right) / 2;
export const ADD_BUTTON: Point = [STAGE.right - 50, STAGE.bottom - 48];
const OFFSCREEN: Point = [CONTENT.right + 80, CONTENT.bottom + 60];

/** How long a scene rests on its last frame before playing again. */
const LOOP_REST = 1.6;

export const smooth = (x: number) => x * x * (3 - 2 * x);

export const lerp = (from: number, to: number, k: number) =>
  from + (to - from) * k;

export const pivot = (x: number, y: number, k: number) =>
  `translate(${x} ${y}) scale(${Math.max(0.001, k)}) translate(${-x} ${-y})`;

/** A press that squashes a button and lets it go, for each time in `at`. */
export const pressAt = (t: number, at: readonly number[], length = 0.25) =>
  Math.max(
    0,
    ...at.map((start) => {
      const p = segment(t, start, length);
      return p < 1 ? p : 0;
    }),
  );

/** `count` positions spread evenly across the stage, `gap` apart. */
export const row = (count: number, gap = 150, centre = STAGE_CENTER_X) =>
  Array.from({ length: count }, (_, i) => centre + (i - (count - 1) / 2) * gap);

/** A rough width for SVG text, which cannot be measured before it renders. */
const textWidth = (text: string, size: number) => text.length * size * 0.56;

function Icon({
  icon: Glyph,
  x,
  y,
  size,
  className = 'text-navy-taupe',
  strokeWidth = 2.4,
}: {
  icon: LucideIcon;
  x: number;
  y: number;
  size: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <Glyph
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
    />
  );
}

export function TextBar({
  x,
  y,
  width,
  className = 'stroke-white/40',
}: {
  x: number;
  y: number;
  width: number;
  className?: string;
}) {
  return (
    <line
      x1={x}
      y1={y}
      x2={x + width}
      y2={y}
      className={className}
      strokeWidth={10}
      strokeLinecap="round"
    />
  );
}

/**
 * A rounded label: a pill of colour with its text centred on `x`, or starting
 * at `x` when `align` is "start". It pops in as `k` runs from 0 to 1.
 */
export function Chip({
  x,
  y,
  text,
  k = 1,
  size = 22,
  fill = 'fill-mustard',
  ink = 'fill-navy-taupe',
  align = 'middle',
  outlined = false,
  width: fixedWidth,
}: {
  x: number;
  y: number;
  text: string;
  k?: number;
  size?: number;
  fill?: string;
  ink?: string;
  align?: 'middle' | 'start';
  outlined?: boolean;
  width?: number;
}) {
  if (k <= 0) return null;
  const height = size * 2;
  const width = fixedWidth ?? textWidth(text, size) + size * 1.6;
  const left = align === 'middle' ? x - width / 2 : x;
  const centre = left + width / 2;
  return (
    <g transform={pivot(centre, y, k)}>
      <rect
        x={left}
        y={y - height / 2}
        width={width}
        height={height}
        rx={height / 2}
        className={cx(fill, outlined && outline)}
        strokeWidth={outlined ? 5 : 0}
      />
      <text
        x={centre}
        y={y + size * 0.36}
        textAnchor="middle"
        fontSize={size}
        fontWeight={900}
        className={ink}
      >
        {text}
      </text>
    </g>
  );
}

export type Stop = Readonly<{
  to: Point;
  /** When the cursor arrives. */
  at: number;
  /** How long it takes to get there. */
  glide?: number;
  /** Off for a stop that presses and drags rather than clicks. */
  ring?: boolean;
}>;

const GLIDE = 0.6;

/**
 * Where something moving from `from` through `stops` is at `t`, hopping a
 * little on the way to each stop.
 */
export function travel(t: number, from: Point, stops: readonly Stop[]): Point {
  let at: Point = from;
  let previous = from;
  for (const stop of stops) {
    const glide = stop.glide ?? GLIDE;
    const k = smooth(segment(t, stop.at - glide, glide));
    if (k <= 0) break;
    const distance = Math.hypot(
      stop.to[0] - previous[0],
      stop.to[1] - previous[1],
    );
    at = [
      lerp(previous[0], stop.to[0], k),
      lerp(previous[1], stop.to[1], k) -
        Math.sin(Math.PI * k) * Math.min(30, distance * 0.2),
    ];
    previous = stop.to;
  }
  return at;
}

/**
 * The /updates cursor: fades in, glides from `from` to each stop in turn,
 * clicking on arrival, and fades out at `leave`.
 */
export function Click({
  t,
  from = OFFSCREEN,
  stops,
  leave,
}: {
  t: number;
  from?: Point;
  stops: readonly Stop[];
  leave: number;
}) {
  const first = stops[0];
  if (first === undefined) return null;
  const opacity =
    segment(t, first.at - (first.glide ?? GLIDE) - 0.3, 0.3) *
    (1 - segment(t, leave, 0.3));
  return (
    <>
      {stops.map((stop) =>
        stop.ring === false ? null : (
          <ClickRing
            key={stop.at}
            at={stop.to}
            progress={segment(t, stop.at, 0.45)}
            stroke="stroke-sea-serpent"
          />
        ),
      )}
      {opacity > 0 ? (
        <Cursor
          tip={travel(t, from, stops)}
          fill="fill-sea-serpent"
          opacity={opacity}
        />
      ) : null}
    </>
  );
}

type Rail = Readonly<{
  /** How far through the interview the participant is, 0 to 1. */
  progress: number;
  /** The stage is complete: Next turns green and glows, as it does live. */
  pulse?: boolean;
  /** Seconds since the pulse began, so its glow keeps time with the scene. */
  pulseFrom?: number;
  /** 0 to 1, a press on Next. */
  press?: number;
}>;

/**
 * The interview's navigation, as a vertical rail: settings, back, the
 * interview's progress, and the larger next arrow at the bottom.
 */
function NavigationRail({
  t,
  progress,
  pulse = false,
  pulseFrom = 0,
  press = 0,
}: Rail & { t: number }) {
  const barTop = BACK_BUTTON[1] + 42;
  const barBottom = NEXT_BUTTON[1] - 48;
  const glow = ((t - pulseFrom) % 2) / 2;
  const squash = 1 - Math.sin(Math.PI * press) * 0.12;
  return (
    <>
      <rect
        x={CONTENT.x}
        y={CONTENT.y}
        width={RAIL_WIDTH}
        height={CONTENT.bottom - CONTENT.y}
        className="fill-cyber-grape"
      />
      <Icon
        icon={Settings}
        x={RAIL_X}
        y={CONTENT.y + 34}
        size={24}
        className="text-white/70"
      />
      <Icon
        icon={ChevronUp}
        x={BACK_BUTTON[0]}
        y={BACK_BUTTON[1]}
        size={34}
        className="text-white"
      />
      <line
        x1={RAIL_X}
        y1={barTop}
        x2={RAIL_X}
        y2={barBottom}
        className="stroke-white/10"
        strokeWidth={12}
        strokeLinecap="round"
      />
      <line
        x1={RAIL_X}
        y1={barTop}
        x2={RAIL_X}
        y2={lerp(barTop, barBottom, progress)}
        className="stroke-white/20"
        strokeWidth={12}
        strokeLinecap="round"
      />
      <g
        transform={`translate(${NEXT_BUTTON[0]} ${NEXT_BUTTON[1]}) scale(${squash})`}
      >
        {pulse ? (
          <>
            <circle
              r={24 + glow * 26}
              className="fill-success"
              opacity={0.8 * (1 - Math.min(1, glow / 0.7))}
            />
            <circle r={24} className="fill-success" />
          </>
        ) : null}
        <Icon
          icon={ChevronDown}
          x={0}
          y={1}
          size={38}
          strokeWidth={3}
          className="text-white"
        />
      </g>
    </>
  );
}

/**
 * A numbered callout, as on an annotated diagram: a green pin with a leader
 * line drawn out to the part it names. `lit` (0 to 1) enlarges the pin while
 * the scene points it out.
 */
export function CalloutPin({
  at,
  to,
  n,
  k,
  lit = 0,
  label,
  labelSide = 'right',
}: {
  at: Point;
  to: Point;
  n: number;
  /** 0 to 1: the pin drops in and its leader draws out. */
  k: number;
  lit?: number;
  /** The part's name, shown beside the pin while it is pointed out. */
  label?: string;
  labelSide?: 'right' | 'above';
}) {
  if (k <= 0) return null;
  const labelSize = 13;
  const labelWidth =
    label === undefined ? 0 : textWidth(label, labelSize) + labelSize * 1.6;
  const labelX =
    labelSide === 'right'
      ? at[0] + 22
      : Math.min(
          Math.max(at[0], CONTENT.x + labelWidth / 2 + 8),
          CONTENT.right - labelWidth / 2 - 8,
        );
  const end: Point = [lerp(at[0], to[0], k), lerp(at[1], to[1], k)];
  const scale = backOut(Math.min(1, k)) * (1 + 0.18 * lit);
  return (
    <g opacity={Math.min(1, k * 2)}>
      <line
        x1={at[0]}
        y1={at[1]}
        x2={end[0]}
        y2={end[1]}
        className="stroke-sea-green"
        strokeWidth={3}
      />
      {lit > 0 ? (
        <circle
          cx={at[0]}
          cy={at[1]}
          r={14 + 9 * lit}
          className="fill-sea-green"
          opacity={0.3}
        />
      ) : null}
      <g transform={pivot(at[0], at[1], scale)}>
        <circle cx={at[0]} cy={at[1]} r={14} className="fill-sea-green" />
        <text
          x={at[0]}
          y={at[1] + 4.5}
          textAnchor="middle"
          fontSize={13}
          fontWeight={900}
          className="fill-white"
        >
          {n}
        </text>
      </g>
      {label !== undefined && lit > 0 ? (
        <Chip
          x={labelX}
          y={labelSide === 'right' ? at[1] : at[1] - 36}
          align={labelSide === 'right' ? 'start' : 'middle'}
          text={label}
          size={labelSize}
          fill="fill-sea-green"
          ink="fill-white"
          k={lit}
        />
      ) : null}
    </g>
  );
}

export type SceneFrame = Readonly<{
  /** Seconds into the current play of the scene. */
  t: number;
  /** Distinct for each scene on the page, for clip paths. */
  id: string;
}>;

export type SceneDrawing = Readonly<{
  /** Drawn inside the window, clipped to it. */
  body: ReactNode;
  /** Drawn above the window, unclipped, e.g. a cursor. */
  overlay?: ReactNode;
  /** The navigation rail, for a scene of the interview. */
  rail?: Rail;
  /** Drawn over the whole window, rail included, like the interview's forms. */
  modal?: ReactNode;
}>;

/**
 * A looping scene: a window that pops in on the first play, with whatever
 * `draw` returns for the moment `t`. It plays to `end`, rests there, and
 * starts over. With reduced motion it stays on its last frame.
 */
export function defineScene(
  end: number,
  draw: (frame: SceneFrame) => SceneDrawing,
  { url = 'Interview' }: { url?: string } = {},
): ComponentType {
  return function Scene() {
    const { ref, time } = useIllustrationClock(end, { from: 0 });
    const id = useId().replace(/[^\w-]/g, '');
    const period = end + LOOP_REST;
    const t = Math.min(time % period, end);
    const win = time < period ? backOut(segment(t, 0, 0.5)) : 1;
    const { body, overlay, rail, modal } = draw({ t, id });
    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="font-heading block h-auto max-h-full w-full overflow-visible"
        aria-hidden
      >
        <g
          transform={pivot(
            FRAME.x + FRAME.width / 2,
            FRAME.y + FRAME.height / 2,
            win,
          )}
        >
          <BrowserWindow
            frame={FRAME}
            url={url}
            clipId={`${id}-window`}
            urlWidth={url.length * 10 + 40}
          >
            <rect
              x={CONTENT.x}
              y={CONTENT.y}
              width={CONTENT.right - CONTENT.x}
              height={CONTENT.bottom - CONTENT.y}
              className="fill-navy-taupe"
            />
            {body}
            {rail ? <NavigationRail t={t} {...rail} /> : null}
            {modal}
          </BrowserWindow>
          {overlay}
        </g>
      </svg>
    );
  };
}

/** The pips above the prompt when a stage has more than one. */
export function PromptPips({
  count,
  current,
  y = STAGE.y + 20,
  x = STAGE_CENTER_X,
}: {
  count: number;
  current: number;
  y?: number;
  x?: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <circle
          key={i}
          cx={x + (i - (count - 1) / 2) * 24}
          cy={y}
          r={7}
          className={cx('stroke-white', i === current && 'fill-white/30')}
          fill={i === current ? undefined : 'none'}
          strokeWidth={2.5}
        />
      ))}
    </>
  );
}

/** The question at the top of an interview screen. */
export function Prompt({
  text,
  y = STAGE.y + 56,
  x = STAGE_CENTER_X,
  opacity = 1,
  offset = 0,
  size = 26,
}: {
  text: string;
  y?: number;
  x?: number;
  opacity?: number;
  offset?: number;
  size?: number;
}) {
  return (
    <text
      x={x + offset}
      y={y}
      textAnchor="middle"
      fontSize={size}
      fontWeight={500}
      opacity={opacity}
      className="fill-white"
    >
      {text}
    </text>
  );
}

/** A person, as the interview draws a node: a disc with its label inside. */
export function PersonNode({
  x,
  y,
  label,
  k,
  r = 40,
  fill = 'fill-neon-coral',
}: {
  x: number;
  y: number;
  label?: string;
  k: number;
  r?: number;
  fill?: string;
}) {
  if (k <= 0) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${grow(k)})`}>
      <circle r={r} className={cx(fill, 'stroke-white/90')} strokeWidth={4} />
      <circle
        r={r - 10}
        className="fill-white/10"
        transform="translate(-4 -6)"
      />
      {label ? (
        <text
          y={r * 0.15}
          textAnchor="middle"
          fontSize={r * 0.42}
          fontWeight={900}
          className="fill-white"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/**
 * The round "add a person" button in the corner of a name generator. At a
 * maximum it fades and stops responding, as it does in the interview.
 */
export function AddButton({
  id,
  k = 1,
  disabled = false,
  press = 0,
}: {
  id: string;
  k?: number;
  disabled?: boolean;
  press?: number;
}) {
  const squash = 1 - Math.sin(Math.PI * press) * 0.12;
  const clip = `${id}-add-button`;
  return (
    <g
      transform={`translate(${ADD_BUTTON[0]} ${ADD_BUTTON[1]}) scale(${grow(k * squash)})`}
      opacity={disabled ? 0.35 : 1}
    >
      <clipPath id={clip}>
        <circle r={32} />
      </clipPath>
      <circle r={32} className="fill-sea-green" />
      {/* The node type's "add a person" icon: a figure on the disc. */}
      <g clipPath={`url(#${clip})`} className="fill-white">
        <circle cy={-6} r={11} />
        <ellipse cy={26} rx={20} ry={15} />
      </g>
      <g transform="translate(24 -24)">
        <circle r={11} className="fill-white" />
        <Icon icon={Plus} x={0} y={0} size={16} className="text-navy-taupe" />
      </g>
    </g>
  );
}

const TOAST = { width: 300, line: 24, pad: 16 } as const;

/**
 * The interview's toast beside the Next arrow, pointing at it: green with a
 * party popper for good news, red with an alert for a problem. It shakes as
 * it arrives.
 */
export function Toast({
  lines,
  variant,
  k,
  t,
  from,
}: {
  lines: readonly string[];
  variant: 'success' | 'destructive';
  /** 0 to 1, its arrival; 0 hides it. */
  k: number;
  t: number;
  /** When it arrived, for its shake. */
  from: number;
}) {
  if (k <= 0) return null;
  const height = TOAST.pad * 2 + lines.length * TOAST.line;
  const left = NEXT_BUTTON[0] + 44;
  const top = Math.min(
    NEXT_BUTTON[1] - height / 2,
    CONTENT.bottom - height - 8,
  );
  const shake = segment(t, from, 0.5);
  const dx = Math.sin(shake * Math.PI * 5) * 6 * (1 - shake);
  const fill = variant === 'success' ? 'fill-success' : 'fill-destructive';
  return (
    <g transform={`translate(${dx} 0)`} opacity={Math.min(1, k * 2)}>
      <g transform={pivot(left, NEXT_BUTTON[1], k)}>
        <rect
          x={left - 7}
          y={NEXT_BUTTON[1] - 7}
          width={14}
          height={14}
          rx={2}
          className={fill}
          transform={`rotate(45 ${left} ${NEXT_BUTTON[1]})`}
        />
        <rect
          x={left}
          y={top}
          width={TOAST.width}
          height={height}
          rx={10}
          className={fill}
        />
        <Icon
          icon={variant === 'success' ? PartyPopper : CircleAlert}
          x={left + 28}
          y={top + TOAST.pad + 11}
          size={22}
          className="text-white"
        />
        {lines.map((text, i) => (
          <text
            key={text}
            x={left + 52}
            y={top + TOAST.pad + 17 + i * TOAST.line}
            fontSize={17}
            fontWeight={600}
            className="fill-white"
          >
            {text}
          </text>
        ))}
        <Icon
          icon={X}
          x={left + TOAST.width - 20}
          y={top + TOAST.pad + 10}
          size={16}
          className="text-white/80"
        />
      </g>
    </g>
  );
}

/**
 * A side panel as the interview draws it: a raised card with its title
 * centred above a dividing line, its people as nodes, and a coloured bar
 * along the bottom that tells the panels apart.
 */
export function SidePanel({
  id,
  x,
  y,
  width,
  height,
  title,
  bar,
  slide = 1,
  children,
}: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  bar: string;
  slide?: number;
  children?: ReactNode;
}) {
  const clip = `${id}-panel-${bar}`;
  return (
    <g
      transform={`translate(${(1 - slide) * -60} 0)`}
      opacity={Math.min(1, Math.max(0, slide))}
    >
      <clipPath id={clip}>
        <rect x={x} y={y} width={width} height={height} rx={14} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          className="fill-cyber-grape"
        />
        <rect
          x={x}
          y={y + 40}
          width={width}
          height={3}
          className="fill-navy-taupe"
        />
        <rect
          x={x}
          y={y + height - 10}
          width={width}
          height={10}
          className={bar}
        />
      </g>
      <text
        x={x + width / 2}
        y={y + 27}
        textAnchor="middle"
        fontSize={18}
        fontWeight={700}
        className="fill-white"
      >
        {title}
      </text>
      {children}
    </g>
  );
}

/** The form a name generator opens for each person: a card over the screen. */
export const FORM_CARD = {
  width: 400,
  height: 290,
  x: STAGE_CENTER_X - 200,
  y: CONTENT.y + 30,
} as const;
const DONE_TEXT = 'Done';
export const FORM_SUBMIT: Point = [
  FORM_CARD.x + FORM_CARD.width - 86,
  FORM_CARD.y + FORM_CARD.height - 32,
];

export function FormCard({
  title,
  submit = true,
  k,
  settle = 0,
  to = [STAGE_CENTER_X, FORM_CARD.y + FORM_CARD.height / 2],
  children,
}: {
  title?: string;
  /** Whether to draw the name generator form's own Done button. */
  submit?: boolean;
  /** 0 to 1, the card opening. */
  k: number;
  /** 0 to 1, the card closing into the person it created at `to`. */
  settle?: number;
  to?: Point;
  children?: ReactNode;
}) {
  const scale = k * (1 - settle);
  if (scale <= 0.001) return null;
  const centre: Point = [STAGE_CENTER_X, FORM_CARD.y + FORM_CARD.height / 2];
  return (
    <g
      transform={`translate(${lerp(0, to[0] - centre[0], settle)} ${lerp(0, to[1] - centre[1], settle)}) ${pivot(centre[0], centre[1], scale)}`}
    >
      <rect
        x={CONTENT.x}
        y={CONTENT.y}
        width={CONTENT.right - CONTENT.x}
        height={CONTENT.bottom - CONTENT.y}
        className="fill-navy-taupe/60"
        opacity={1 - settle}
      />
      <rect
        x={FORM_CARD.x}
        y={FORM_CARD.y}
        width={FORM_CARD.width}
        height={FORM_CARD.height}
        rx={22}
        className="fill-cyber-grape stroke-white/30"
        strokeWidth={3}
      />
      <text
        x={FORM_CARD.x + 34}
        y={FORM_CARD.y + 44}
        fontSize={24}
        fontWeight={900}
        className="fill-white"
      >
        {title}
      </text>
      {children}
      {submit ? (
        <Chip
          x={FORM_SUBMIT[0]}
          y={FORM_SUBMIT[1]}
          text={DONE_TEXT}
          size={19}
          width={132}
          fill="fill-sea-green"
          ink="fill-white"
        />
      ) : null}
    </g>
  );
}

const CARET = '|';

/** A text box in a form, with a blinking caret while it is being typed in. */
export function TextBox({
  x,
  y,
  width,
  text,
  caret = false,
  invalid = false,
}: {
  x: number;
  y: number;
  width: number;
  text: string;
  caret?: boolean;
  invalid?: boolean;
}) {
  return (
    <>
      <rect
        x={x}
        y={y}
        width={width}
        height={42}
        rx={10}
        className={cx('fill-white', invalid && 'stroke-destructive')}
        strokeWidth={invalid ? 4 : 0}
      />
      <text
        x={x + 16}
        y={y + 30}
        fontSize={22}
        fontWeight={800}
        className="fill-navy-taupe"
      >
        {text}
        {caret ? CARET : null}
      </text>
    </>
  );
}
