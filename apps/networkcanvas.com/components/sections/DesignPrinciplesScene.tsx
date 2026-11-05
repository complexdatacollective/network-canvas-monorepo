'use client';

import {
  AnimatePresence,
  motion,
  type MotionValue,
  useMotionValueEvent,
  useTransform,
  type Variants,
} from 'motion/react';
import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import { cn } from '~/lib/cn';

import {
  ANSWER_BUBBLE,
  ANSWER_COLOR,
  ANSWER_LINE,
  ANSWER_SIZE,
  ANSWER_SLOT,
  ANSWER_TRAIL,
  answerMarked,
  answerOpen,
  answerRecorded,
  answerSlotShown,
  asked,
  type Bubble,
  bubbleOpen,
  bubbleOutline,
  cameraTransform,
  COMMUNITY_CONFIG,
  deviceFrame,
  type EdgeSpec,
  edgeFrame,
  edges,
  exportDrawn,
  FORM_COLORS,
  formAt,
  inListSlot,
  INSTITUTIONS,
  institutionShown,
  INTERVIEWER_BADGE,
  interviewBeats,
  KEY_HUES,
  lightLevels,
  LIST_ENTER,
  LIST_SLOTS,
  listItemColor,
  listItemOutline,
  markShown,
  type NodeColor,
  type NodeFrame,
  nodeFrame,
  nodeLayers,
  PROJECT_RADIUS,
  projectShown,
  PROMPT,
  PROMPT_BUBBLE,
  promptArrived,
  PROTOCOL,
  rowWritten,
  sceneryWeight,
  SLOT_RADIUS,
  SLOT_STROKE,
  smoothstep,
  TABLE,
  trailShown,
  VIEW_WIDTH,
  voicesGone,
  WORKFLOW_CONFIG,
  WORKFLOW_LINE,
  WORKFLOW_MARKS,
  WORKFLOW_START,
  workflowLine,
} from './designPrinciplesGeometry';

// The design principles scene: one network under one camera. As `phase` runs
// from 0 to 6 the network grows in and takes on node and edge types; a
// screen forms round it, and an interview takes place in front of it, in two
// speech bubbles: the interviewer asks, the participant answers, and the
// answer is recorded on the screen; it leaves for a list as the camera
// pushes in; the camera pulls back to the workflow, where one line runs from
// a protocol being drafted in Architect, behind the device running
// Interviewer, into a table it exports; and it ends in the community around
// the project. Shapes morph, edges draw and retract and the camera moves; the
// section drives `phase` from scroll, and the interview's beats and the
// workflow's line from the reading of their cards.
//
// Per frame, only what is changing is written: node outlines come from a
// cache and change only while a shape changes, nodes move by transform,
// undrawn edges keep one constant path, and the looping details run only for
// the form on screen.

const NODE_COUNT = 9;

const nodeColor = (color: NodeColor) =>
  color === 0 ? 'var(--color-slate-blue)' : `var(--node-${color})`;

// The two-tone fill Fresco's Node draws: a 145° hard split between the colour
// and a slightly darker shade of it (a tenth black takes about 0.06 off its
// lightness; a mix, since older Safari drops relative colours).
function TwoToneGradient({ id, color }: { id: string; color: string }) {
  const dark = `color-mix(in oklab, ${color} 90%, black)`;
  return (
    <linearGradient id={id} x1="0.21" y1="0.09" x2="0.79" y2="0.91">
      <stop offset="0.5" stopColor={color} />
      <stop offset="0.5" style={{ stopColor: dark }} />
    </linearGradient>
  );
}

const fixed = (v: number) => v.toFixed(1);

function roundedRect(w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  return `M${fixed(x + rr)} ${fixed(y)}H${fixed(x + w - rr)}A${fixed(rr)} ${fixed(rr)} 0 0 1 ${fixed(x + w)} ${fixed(y + rr)}V${fixed(y + h - rr)}A${fixed(rr)} ${fixed(rr)} 0 0 1 ${fixed(x + w - rr)} ${fixed(y + h)}H${fixed(x + rr)}A${fixed(rr)} ${fixed(rr)} 0 0 1 ${fixed(x)} ${fixed(y + h - rr)}V${fixed(y + rr)}A${fixed(rr)} ${fixed(rr)} 0 0 1 ${fixed(x + rr)} ${fixed(y)}Z`;
}

// A rounded rectangle's outline as two halves, both from the middle of its
// lower edge (its near side, where the interview's two voices sit) round to
// the middle of its upper edge: drawn together, the frame grows from the near
// side both ways.
function rimHalves(w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  const a = `${fixed(rr)} ${fixed(rr)}`;
  const start = `M0 ${fixed(y + h)}`;
  return [
    `${start}H${fixed(x + rr)}A${a} 0 0 1 ${fixed(x)} ${fixed(y + h - rr)}V${fixed(y + rr)}A${a} 0 0 1 ${fixed(x + rr)} ${fixed(y)}H0`,
    `${start}H${fixed(x + w - rr)}A${a} 0 0 0 ${fixed(x + w)} ${fixed(y + h - rr)}V${fixed(y + rr)}A${a} 0 0 0 ${fixed(x + w - rr)} ${fixed(y)}H0`,
  ] as const;
}

/** Props that belong to some forms only: they fade (and rise) in with them. */
function Scenery({
  configs,
  phase,
  rise = 0,
  children,
}: {
  configs: number[];
  phase: MotionValue<number>;
  rise?: number;
  children: ReactNode;
}) {
  const weight = useTransform(phase, (p) =>
    Math.max(...configs.map((config) => sceneryWeight(config, p))),
  );
  const y = useTransform(weight, (w) => (1 - w) * rise);
  const visibility = useTransform(weight, (w) =>
    w < 0.005 ? 'hidden' : 'visible',
  );
  return (
    <motion.g
      style={
        rise
          ? { opacity: weight, y, visibility }
          : { opacity: weight, visibility }
      }
    >
      {children}
    </motion.g>
  );
}

// Line drawing on the canvas, as in dark mode: light ink round a page the
// shade of the device's screen.
const INK = 'stroke-text';
const INK_WIDTH = 4;
const PAPER = 'fill-navy-taupe';
const RADIUS = 16;

// The apps' icons, as the site ships them.
const ARCHITECT_ICON = '/images/summer-2026/architect-icon.png';
const INTERVIEWER_ICON = '/images/summer-2026/interviewer-icon.svg';

// A reader with no reading position (reduced motion) has read every card.
const READ_ALL = Number.POSITIVE_INFINITY;
const readingOf = (reading: MotionValue<number> | undefined) =>
  reading ? reading.get() : READ_ALL;

type WorkflowState = ReturnType<typeof workflowLine>;

/** One of the protocol's stages, drafted as the line reaches it. */
function StageCard({
  y,
  at,
  workflow,
  next = false,
}: {
  y: number;
  at: number;
  workflow: MotionValue<WorkflowState>;
  /** The empty slot for the next stage. */
  next?: boolean;
}) {
  const shown = useTransform(workflow, (s) => markShown(s.head, at));
  const x = useTransform(shown, (v) => (1 - v) * 14);
  const { card } = PROTOCOL;
  const top = y - card.h / 2;
  const centre = card.x + card.w / 2;
  return (
    <motion.g style={{ opacity: shown, x }}>
      {next ? (
        <>
          <rect
            x={card.x}
            y={top}
            width={card.w}
            height={card.h}
            rx={10}
            className="stroke-text/45"
            strokeWidth={3}
            strokeDasharray="7 6"
          />
          <path
            d={`M${centre - 8} ${y}H${centre + 8}M${centre} ${y - 8}V${y + 8}`}
            className="stroke-text/60"
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <rect
            x={card.x}
            y={top}
            width={card.w}
            height={card.h}
            rx={10}
            className="fill-white/10"
          />
          <rect
            x={card.x + 10}
            y={y - 9}
            width={38}
            height={7}
            rx={3.5}
            className="fill-text/45"
          />
          <rect
            x={card.x + 10}
            y={y + 4}
            width={24}
            height={6}
            rx={3}
            className="fill-text/25"
          />
        </>
      )}
    </motion.g>
  );
}

/**
 * The protocol, a page being drafted in Architect: its timeline runs down the
 * right-hand side, and each stage is added as the line reaches it.
 */
function ProtocolPage({ workflow }: { workflow: MotionValue<WorkflowState> }) {
  const { x, y, w, h, fold, rows, nextRow, badge } = PROTOCOL;
  const right = x + w;
  const bottom = y + h;
  const page = `M${x + RADIUS} ${y}H${right - fold}L${right} ${y + fold}V${bottom - RADIUS}A${RADIUS} ${RADIUS} 0 0 1 ${right - RADIUS} ${bottom}H${x + RADIUS}A${RADIUS} ${RADIUS} 0 0 1 ${x} ${bottom - RADIUS}V${y + RADIUS}A${RADIUS} ${RADIUS} 0 0 1 ${x + RADIUS} ${y}Z`;
  const crease = `M${right - fold} ${y}V${y + fold - 5}A5 5 0 0 0 ${right - fold + 5} ${y + fold}H${right}`;
  return (
    <g>
      <path
        d={page}
        className={`${PAPER} ${INK}`}
        strokeWidth={INK_WIDTH}
        strokeLinejoin="round"
      />
      <path
        d={crease}
        className={INK}
        strokeWidth={INK_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <image
        href={ARCHITECT_ICON}
        x={badge.x}
        y={badge.y}
        width={badge.size}
        height={badge.size}
      />
      <rect
        x={badge.x + badge.size + 10}
        y={badge.y + 7}
        width={46}
        height={8}
        rx={4}
        className="fill-text/45"
      />
      <rect
        x={badge.x + badge.size + 10}
        y={badge.y + 19}
        width={28}
        height={6}
        rx={3}
        className="fill-text/25"
      />
      {rows.map((rowY, i) => (
        <StageCard
          key={rowY}
          y={rowY}
          at={WORKFLOW_MARKS.definitions[i]!}
          workflow={workflow}
        />
      ))}
      <StageCard
        y={nextRow}
        at={WORKFLOW_MARKS.next}
        workflow={workflow}
        next
      />
      <circle
        cx={WORKFLOW_START.x}
        cy={WORKFLOW_START.y}
        r={9}
        className="fill-white"
      />
    </g>
  );
}

// The table's cells take the colour of the type in their row.
const CELL_FILLS = ['fill-node-1/60', 'fill-node-4/60', 'fill-node-5/75'];

function TableRow({
  y,
  row,
  progress,
}: {
  y: number;
  row: number;
  progress: MotionValue<number>;
}) {
  const written = useTransform(progress, (p) => rowWritten(p, row));
  return (
    <>
      {TABLE.cells.map((cell) => (
        <motion.rect
          key={cell.x}
          x={cell.x}
          y={y - 4}
          width={cell.w}
          height={8}
          rx={4}
          className={CELL_FILLS[row]}
          style={{ scaleX: written, originX: 0 }}
        />
      ))}
    </>
  );
}

/**
 * The data: a table whose rows are written as the line delivers them, and an
 * arrow that leaves it, once they are, exporting it.
 */
function DataTable({ workflow }: { workflow: MotionValue<WorkflowState> }) {
  const { x, y, w, h, headerY, rows, ruleX, cells, exportTo } = TABLE;
  const progress = useTransform(workflow, (s) => s.progress);
  const shaft = useTransform(progress, exportDrawn);
  const head = useTransform(shaft, (v) => smoothstep((v - 0.75) / 0.25));
  // Round caps would leave a dot where nothing is drawn yet.
  const visibility = useTransform(shaft, (v) =>
    v < 0.001 ? 'hidden' : 'visible',
  );
  const exportY = rows[1]!;
  const rules = [
    `M${x} ${headerY + 18}H${x + w}`,
    ...rows
      .slice(1)
      .map((rowY, i) => `M${x} ${(rowY + rows[i]!) / 2}H${x + w}`),
    `M${ruleX} ${y}V${y + h}`,
  ].join('');
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={RADIUS}
        className={`${PAPER} ${INK}`}
        strokeWidth={INK_WIDTH}
      />
      <path d={rules} className="stroke-text/20" strokeWidth={2.5} />
      {cells.map((cell) => (
        <rect
          key={cell.x}
          x={cell.x}
          y={headerY - 4}
          width={cell.w}
          height={8}
          rx={4}
          className="fill-text/45"
        />
      ))}
      {rows.map((rowY, row) => (
        <TableRow key={rowY} y={rowY} row={row} progress={progress} />
      ))}
      <motion.g
        style={{ visibility }}
        className="stroke-white/90"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path
          d={`M${x + w} ${exportY}H${exportTo}`}
          style={{ pathLength: shaft }}
        />
        <motion.path
          d={`M${exportTo} ${exportY}L${exportTo - 13} ${exportY - 12}M${exportTo} ${exportY}L${exportTo - 13} ${exportY + 12}`}
          style={{ pathLength: head }}
        />
      </motion.g>
    </g>
  );
}

/**
 * The workflow's one line: drawn from its start as the card is read, it runs
 * behind the device, and leaves forwards through its end. Once it is
 * complete a pulse runs its length.
 */
function WorkflowLine({ workflow }: { workflow: MotionValue<WorkflowState> }) {
  const dash = useTransform(
    workflow,
    (s) => `${Math.max(0, s.head - s.tail).toFixed(4)} 3`,
  );
  const offset = useTransform(workflow, (s) => (-s.tail).toFixed(4));
  const visibility = useTransform(workflow, (s) =>
    s.head - s.tail > 0.0005 ? 'visible' : 'hidden',
  );
  const complete = useTransform(workflow, (s) =>
    s.tail > 0 ? 0 : smoothstep((s.progress - 0.97) / 0.03),
  );
  return (
    <motion.g
      style={{ visibility }}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <motion.path
        d={WORKFLOW_LINE}
        pathLength={1}
        strokeDasharray={dash}
        strokeDashoffset={offset}
        className="stroke-white/80"
        strokeWidth={6}
      />
      <motion.g style={{ opacity: complete }}>
        <g className="opacity-0 group-data-[loop=5]/stage:motion-safe:opacity-100">
          <path
            d={WORKFLOW_LINE}
            pathLength={1}
            strokeDasharray="0.04 2"
            className="stroke-white group-data-[loop=5]/stage:motion-safe:animate-[nc-pulse_6.5s_linear_infinite]"
            strokeWidth={11}
          />
        </g>
      </motion.g>
    </motion.g>
  );
}

/**
 * The device forms around the network on the way into the interview: a
 * circle holding the network becomes the rounded screen, filling in as the
 * camera pulls back, and the bezel's line draws round it.
 */
function Device({ phase }: { phase: MotionValue<number> }) {
  const frame = useTransform(phase, deviceFrame);
  const screenD = useTransform(frame, (f) =>
    roundedRect(f.screen.w, f.screen.h, f.screen.r),
  );
  const screenOpacity = useTransform(frame, (f) => f.screen.opacity);
  const bezelD = useTransform(frame, (f) =>
    roundedRect(f.bezel.w, f.bezel.h, f.bezel.r),
  );
  const rimA = useTransform(
    frame,
    (f) => rimHalves(f.bezel.w, f.bezel.h, f.bezel.r)[0],
  );
  const rimB = useTransform(
    frame,
    (f) => rimHalves(f.bezel.w, f.bezel.h, f.bezel.r)[1],
  );
  const bezelFill = useTransform(frame, (f) => f.bezel.opacity);
  const bezelDrawn = useTransform(frame, (f) => f.bezel.drawn);
  // Drawing, the rim is two halves, square-ended so that nothing shows before
  // they have length; drawn, it is one closed line, with no seam where the
  // halves meet.
  const bezelVisibility = useTransform(bezelDrawn, (d) =>
    d < 0.001 || d >= 0.999 ? 'hidden' : 'visible',
  );
  const rimVisibility = useTransform(bezelDrawn, (d) =>
    d >= 0.999 ? 'visible' : 'hidden',
  );
  const ringsOpacity = useTransform(
    phase,
    (p) => deviceFrame(p).screen.opacity * (1 - sceneryWeight(4, p)),
  );
  return (
    <g>
      <motion.path
        d={bezelD}
        opacity={bezelFill}
        className="fill-cyber-grape"
      />
      <motion.path
        d={screenD}
        opacity={screenOpacity}
        className="fill-navy-taupe"
      />
      <motion.path
        d={rimA}
        className={INK}
        strokeWidth={INK_WIDTH}
        style={{ pathLength: bezelDrawn, visibility: bezelVisibility }}
      />
      <motion.path
        d={rimB}
        className={INK}
        strokeWidth={INK_WIDTH}
        style={{ pathLength: bezelDrawn, visibility: bezelVisibility }}
      />
      <motion.path
        d={bezelD}
        className={INK}
        strokeWidth={INK_WIDTH}
        style={{ visibility: rimVisibility }}
      />
      <motion.g opacity={ringsOpacity}>
        <circle r={104} className="fill-white/4" />
        <circle r={70} className="fill-white/5" />
        <circle r={36} className="fill-white/6" />
      </motion.g>
    </g>
  );
}

// The interview: two voices in speech bubbles below the device, their tails
// rising to two people side by side at its near edge, and the slot on its
// screen that the participant's answer fills. Each voice is a solid bubble
// with its own outline, finer than the device's frame, so neither reads as
// part of the machine: the interviewer's is warm, in the device's light ink,
// and carries the prompt; the participant's is cool, softer and rounder, and
// carries the answer.

const PROMPT_OUTLINE = bubbleOutline(PROMPT_BUBBLE);
const ANSWER_OUTLINE = bubbleOutline(ANSWER_BUBBLE);

const PROMPT_FILL =
  'color-mix(in oklab, var(--color-neon-coral) 22%, var(--color-navy-taupe-dark))';
const ANSWER_FILL =
  'color-mix(in oklab, var(--color-slate-blue) 34%, var(--color-navy-taupe-dark))';
const ANSWER_INK = 'color-mix(in oklab, var(--color-slate-blue) 55%, white)';

// The question mark after the prompt's blank: a hook and a dot.
const QUESTION = (() => {
  const { x, y } = PROMPT.mark;
  return {
    hook: `M${x - 5.5} ${y - 4.5}C${x - 5.5} ${y - 11.5} ${x + 5.5} ${y - 11.5} ${x + 5.5} ${y - 4.5}C${x + 5.5} ${y} ${x} ${y - 0.5} ${x} ${y + 3.5}`,
    dot: { x, y: y + 9.5 },
  };
})();

/**
 * One voice: a speech bubble that opens from the tip of its tail, where its
 * speaker sits; as the camera pushes in to the list it fades and sinks
 * away. Its scale is a transform about that tip, written directly.
 */
function Voice({
  bubble,
  outline,
  scale,
  gone,
  fill,
  ink,
  inkWidth,
  children,
}: {
  bubble: Bubble;
  outline: string;
  scale: MotionValue<number>;
  gone: MotionValue<number>;
  fill: string;
  ink: { className?: string; stroke?: string };
  inkWidth: number;
  children: ReactNode;
}) {
  const ref = useRef<SVGGElement>(null);
  const { tip } = bubble.tail;
  const transform = useTransform(
    scale,
    (s) =>
      `translate(${tip.x} ${tip.y}) scale(${s.toFixed(4)}) translate(${-tip.x} ${-tip.y})`,
  );
  useMotionValueEvent(transform, 'change', (value) =>
    ref.current?.setAttribute('transform', value),
  );
  const opacity = useTransform(
    () => smoothstep(scale.get() / 0.3) * (1 - gone.get()),
  );
  const y = useTransform(gone, (g) => 20 * g);
  const visibility = useTransform(opacity, (o) =>
    o < 0.005 ? 'hidden' : 'visible',
  );
  return (
    <motion.g style={{ opacity, visibility, y }}>
      <g ref={ref} transform={transform.get()}>
        <path
          d={outline}
          className={ink.className}
          style={{ fill, stroke: ink.stroke }}
          strokeWidth={inkWidth}
          strokeLinejoin="round"
        />
        {children}
      </g>
    </motion.g>
  );
}

/**
 * The prompt the interviewer reads out: two lines of the question, then, as
 * it is asked, the blank it asks about, dashed as the person's slot on the
 * screen, and a question mark. Once the answer is recorded, the blank fills.
 */
function Prompt({
  ask,
  recorded,
  gradientId,
}: {
  ask: MotionValue<number>;
  recorded: MotionValue<number>;
  gradientId: (color: NodeColor) => string;
}) {
  const blank = useTransform(ask, (a) => bubbleOpen(asked(a)));
  const question = useTransform(ask, (a) => smoothstep((a - 0.35) / 0.35));
  const questionScale = useTransform(question, (q) => 0.6 + 0.4 * q);
  const filled = useTransform(recorded, bubbleOpen);
  const filledVisibility = useTransform(recorded, (r) =>
    r < 0.005 ? 'hidden' : 'visible',
  );
  return (
    <>
      {PROMPT.lines.map((line, i) => (
        <rect
          key={line.y}
          x={line.x}
          y={line.y - 5}
          width={line.w}
          height={10}
          rx={5}
          className={i === 0 ? 'fill-text/75' : 'fill-text/45'}
        />
      ))}
      <motion.circle
        cx={PROMPT.blank.x}
        cy={PROMPT.blank.y}
        r={SLOT_RADIUS}
        stroke={nodeColor(ANSWER_COLOR)}
        strokeWidth={SLOT_STROKE}
        pathLength={20}
        strokeDasharray="1.1 0.9"
        style={{ scale: blank }}
      />
      <motion.circle
        cx={PROMPT.blank.x}
        cy={PROMPT.blank.y}
        r={SLOT_RADIUS - SLOT_STROKE / 2 - 1.6}
        fill={`url(#${gradientId(ANSWER_COLOR)})`}
        style={{ scale: filled, visibility: filledVisibility }}
      />
      <motion.g
        className="stroke-text/75"
        style={{ opacity: question, scale: questionScale }}
      >
        <path
          d={QUESTION.hook}
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={QUESTION.dot.x}
          cy={QUESTION.dot.y}
          r={2.3}
          className="fill-text/75"
          strokeWidth={0}
        />
      </motion.g>
    </>
  );
}

/**
 * The interview's two voices. The interviewer's bubble arrives with the
 * device; then, as the card is read, the interviewer asks and the participant
 * answers (see interviewBeats). The participant's bubble opens with the
 * person named in it, the network's own node (see interviewPose), which
 * leaves it for the screen; the bubble keeps what was said.
 */
function Interview({
  phase,
  reading,
  gradientId,
}: {
  phase: MotionValue<number>;
  reading: MotionValue<number> | undefined;
  gradientId: (color: NodeColor) => string;
}) {
  const beats = useTransform(() =>
    interviewBeats(phase.get(), readingOf(reading)),
  );
  const ask = useTransform(beats, (b) => b.ask);
  const recorded = useTransform(() =>
    answerRecorded(phase.get(), readingOf(reading)),
  );
  const promptScale = useTransform(phase, (p) => bubbleOpen(promptArrived(p)));
  const answerScale = useTransform(beats, (b) => answerOpen(b.answer));
  const gone = useTransform(phase, voicesGone);
  return (
    <>
      <Voice
        bubble={PROMPT_BUBBLE}
        outline={PROMPT_OUTLINE}
        scale={promptScale}
        gone={gone}
        fill={PROMPT_FILL}
        ink={{ className: 'stroke-text/80' }}
        inkWidth={3}
      >
        <Prompt ask={ask} recorded={recorded} gradientId={gradientId} />
      </Voice>
      <Voice
        bubble={ANSWER_BUBBLE}
        outline={ANSWER_OUTLINE}
        scale={answerScale}
        gone={gone}
        fill={ANSWER_FILL}
        ink={{ stroke: ANSWER_INK }}
        inkWidth={2.6}
      >
        <rect
          x={ANSWER_LINE.x}
          y={ANSWER_LINE.y - 5}
          width={ANSWER_LINE.w}
          height={10}
          rx={5}
          style={{ fill: ANSWER_INK }}
          opacity={0.6}
        />
      </Voice>
    </>
  );
}

// The ring that marks the answer once it has landed: the node's own colour,
// a little clear of it, as the interview marks a selected node.
const MARK_RADIUS = ANSWER_SIZE + 6;

function TrailDot({
  index,
  phase,
  reading,
}: {
  index: number;
  phase: MotionValue<number>;
  reading: MotionValue<number> | undefined;
}) {
  const dot = ANSWER_TRAIL[index]!;
  const opacity = useTransform(() =>
    trailShown(index, phase.get(), readingOf(reading)),
  );
  const visibility = useTransform(opacity, (o) =>
    o < 0.005 ? 'hidden' : 'visible',
  );
  return (
    <motion.circle
      cx={dot.x}
      cy={dot.y}
      r={2.2}
      className="fill-text/40"
      style={{ opacity, visibility }}
    />
  );
}

/**
 * The person's place on the screen: an empty, dashed slot once the interview
 * asks about them, which hides the ends of their edges until the answer lands
 * on it; then a ring that marks the answer as the one just recorded, and a
 * dotted trail back to the participant who gave it.
 */
function AnswerSlot({
  phase,
  reading,
}: {
  phase: MotionValue<number>;
  reading: MotionValue<number> | undefined;
}) {
  const opacity = useTransform(() =>
    answerSlotShown(phase.get(), readingOf(reading)),
  );
  const visibility = useTransform(opacity, (o) =>
    o < 0.005 ? 'hidden' : 'visible',
  );
  const marked = useTransform(() =>
    answerMarked(phase.get(), readingOf(reading)),
  );
  const markScale = useTransform(marked, (m) => 0.8 + 0.2 * bubbleOpen(m));
  const markVisibility = useTransform(marked, (m) =>
    m < 0.005 ? 'hidden' : 'visible',
  );
  return (
    <>
      {ANSWER_TRAIL.map((dot, j) => (
        <TrailDot key={dot.u} index={j} phase={phase} reading={reading} />
      ))}
      <motion.circle
        cx={ANSWER_SLOT.x}
        cy={ANSWER_SLOT.y}
        r={SLOT_RADIUS}
        className={PAPER}
        stroke={nodeColor(ANSWER_COLOR)}
        strokeWidth={SLOT_STROKE}
        pathLength={20}
        strokeDasharray="1.1 0.9"
        style={{ opacity, visibility }}
      />
      <motion.circle
        cx={ANSWER_SLOT.x}
        cy={ANSWER_SLOT.y}
        r={MARK_RADIUS}
        stroke={nodeColor(ANSWER_COLOR)}
        strokeWidth={2.6}
        style={{
          opacity: marked,
          scale: markScale,
          visibility: markVisibility,
        }}
      />
    </>
  );
}

function NodeLayerPath({
  index,
  layer,
  part,
  frame,
  d,
  gradientId,
}: {
  index: number;
  layer: number;
  /** A definition is drawn in two parts: its page, and its dashed outline. */
  part?: 'page' | 'outline';
  frame: MotionValue<NodeFrame>;
  d: MotionValue<string>;
  gradientId: (color: NodeColor) => string;
}) {
  const spec = nodeLayers[index]![layer]!;
  const opacity = useTransform(frame, (f) => f.layers[layer] ?? 0);
  if (part === 'page') {
    return <motion.path d={d} opacity={opacity} className={PAPER} />;
  }
  if (part === 'outline') {
    // A definition: the type's dashed outline, on the page it is drawn on.
    return (
      <motion.path
        d={d}
        opacity={opacity}
        stroke={nodeColor(spec.color)}
        strokeWidth={4.4}
        strokeDasharray="6 4.6"
        strokeLinejoin="round"
      />
    );
  }
  return (
    <motion.path
      d={d}
      opacity={opacity}
      fill={`url(#${gradientId(spec.color)})`}
    />
  );
}

function NetworkNode({
  index,
  phase,
  reading,
  gradientId,
}: {
  index: number;
  phase: MotionValue<number>;
  reading: MotionValue<number> | undefined;
  gradientId: (color: NodeColor) => string;
}) {
  const frame = useTransform(() =>
    nodeFrame(index, phase.get(), readingOf(reading)),
  );
  const d = useTransform(frame, (f) => f.d);
  const x = useTransform(frame, (f) => f.x);
  const y = useTransform(frame, (f) => f.y);
  const scale = useTransform(frame, (f) => f.scale);
  const figure = useTransform(frame, (f) => f.figure);
  const figureVisibility = useTransform(figure, (v) =>
    v < 0.005 ? 'hidden' : 'visible',
  );
  const layers = nodeLayers[index]!;
  const layer = (part?: 'page' | 'outline') =>
    layers.map((spec, k) =>
      spec.outline === (part !== undefined) ? (
        <NodeLayerPath
          key={`${spec.key}-${part ?? 'fill'}`}
          index={index}
          layer={k}
          part={part}
          frame={frame}
          d={d}
          gradientId={gradientId}
        />
      ) : null,
    );
  // A definition's page lies beneath the fill it takes on, and its dashed
  // outline over it, so a definition fills in within its outline.
  return (
    <motion.g style={{ x, y, scale }}>
      {layer('page')}
      {layer()}
      {layer('outline')}
      <motion.path
        d={FIGURE}
        className="fill-white/85"
        style={{ opacity: figure, visibility: figureVisibility }}
      />
    </motion.g>
  );
}

function EdgeStroke({
  frame,
  d,
  width,
  style,
  stroke,
}: {
  frame: MotionValue<ReturnType<typeof edgeFrame>>;
  d: MotionValue<string>;
  width: MotionValue<number>;
  style: EdgeSpec['styles'][number];
  stroke: number;
}) {
  const opacity = useTransform(frame, (f) => f.strokes[stroke]?.opacity ?? 0);
  const drawn = useTransform(frame, (f) => f.strokes[stroke]?.drawn ?? 0);
  return (
    <motion.path
      d={d}
      opacity={opacity}
      strokeWidth={width}
      strokeLinecap="round"
      className={style.stroke}
      pathLength={drawn}
    />
  );
}

function NetworkEdge({
  edge,
  phase,
  reading,
}: {
  edge: EdgeSpec;
  phase: MotionValue<number>;
  reading: MotionValue<number> | undefined;
}) {
  const frame = useTransform(() =>
    edgeFrame(edge, phase.get(), readingOf(reading)),
  );
  const d = useTransform(frame, (f) => f.d);
  const width = useTransform(frame, (f) => f.width);
  return (
    <>
      {edge.styles.map((style, k) => (
        <EdgeStroke
          key={style.stroke}
          frame={frame}
          d={d}
          width={width}
          style={style}
          stroke={k}
        />
      ))}
    </>
  );
}

// The node list's entrance, after the interview's NodeList: each item springs
// up to full size from 60% scale and a fifth of its height below. The
// network's nodes fly to that starting pose as the reader scrolls, so each
// one is picked up by the spring where it lands; leaving, it hands straight
// back to its node, which sets off from where the item rests.
const listItem: Variants = {
  landed: { opacity: 1, ...LIST_ENTER },
  settled: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 500, damping: 20 },
  },
  leaving: { opacity: 0, transition: { duration: 0 } },
};

const listMask = (phase: number) =>
  LIST_SLOTS.reduce(
    (mask, _, i) => (inListSlot(i, phase) ? mask | (1 << i) : mask),
    0,
  );

function NodeList({
  phase,
  animated,
  gradientId,
}: {
  phase: MotionValue<number>;
  animated: boolean;
  gradientId: (color: NodeColor) => string;
}) {
  // Re-renders only when an item lands or leaves, not on every frame.
  const [mask, setMask] = useState(() => listMask(phase.get()));
  const maskRef = useRef(mask);
  useMotionValueEvent(phase, 'change', (p) => {
    const next = listMask(p);
    if (next !== maskRef.current) {
      maskRef.current = next;
      setMask(next);
    }
  });
  return (
    <AnimatePresence>
      {LIST_SLOTS.map((slot, i) =>
        mask & (1 << i) ? (
          <motion.path
            key={`${slot.x}-${slot.y}`}
            variants={listItem}
            initial={animated ? 'landed' : false}
            animate="settled"
            exit="leaving"
            d={listItemOutline(i)}
            fill={`url(#${gradientId(listItemColor(i))})`}
          />
        ) : null,
      )}
    </AnimatePresence>
  );
}

// The looping details (the workflow's pulse, the community's contributions)
// run only for the form on screen, only while the stage is in view, and not
// at all with reduced motion.
function syncLoops(svg: SVGSVGElement | null, form: number, onScreen: boolean) {
  if (!svg) return;
  svg.setAttribute('data-form', String(form));
  svg.setAttribute('data-loop', onScreen ? String(form) : 'off');
}

// Contributions travel in to the project along each institution's
// connection, this far apart (in world units): two or three at a time
// between the institution and the device. Each is a dot in the community's
// key colour with a short trail behind it, which says which way it goes.
const CONTRIBUTION_STEP = 36;
const TRAIL_BEHIND = 19;

/**
 * An institution's connection in to the project, which contributions travel
 * along. It runs from just inside the institution's outline to the
 * project's centre, beneath both the institution and the device, so it
 * shows only between them. It draws in as the institution gathers (see
 * institutionShown), and its contributions follow; they travel only while
 * motion is allowed, and otherwise stand along it.
 */
function InstitutionLink({
  index,
  phase,
}: {
  index: number;
  phase: MotionValue<number>;
}) {
  const { link } = INSTITUTIONS[index]!;
  const shown = useTransform(phase, (p) => institutionShown(index, p));
  // After the institution's outline, the connection draws, and then its
  // contributions come.
  const drawn = useTransform(shown, (v) => smoothstep((v - 0.3) / 0.5));
  const visibility = useTransform(drawn, (v) =>
    v < 0.005 ? 'hidden' : 'visible',
  );
  const contributions = useTransform(shown, (v) => smoothstep((v - 0.7) / 0.3));
  const connection = `M${link.x} ${link.y}L0 0`;
  return (
    <motion.g style={{ visibility }}>
      <motion.path
        d={connection}
        className="stroke-white/20"
        strokeWidth={5}
        strokeLinecap="round"
        style={{ pathLength: drawn }}
      />
      <motion.g
        className="stroke-sea-serpent"
        strokeLinecap="round"
        style={{ opacity: contributions }}
      >
        <path
          d={connection}
          strokeWidth={6}
          strokeDasharray={`10 ${CONTRIBUTION_STEP - 10}`}
          strokeDashoffset={TRAIL_BEHIND}
          opacity={0.45}
          className="group-data-[loop=6]/stage:motion-safe:animate-[nc-trail_1.2s_linear_infinite]"
        />
        <path
          d={connection}
          strokeWidth={13}
          strokeDasharray={`0.5 ${CONTRIBUTION_STEP - 0.5}`}
          className="group-data-[loop=6]/stage:motion-safe:animate-[nc-gather_1.2s_linear_infinite]"
        />
      </motion.g>
    </motion.g>
  );
}

/**
 * An institution's outline round its people, in a fill of its own that the
 * canvas's light does not tint. It gathers as its people land.
 */
function InstitutionBlob({
  index,
  phase,
}: {
  index: number;
  phase: MotionValue<number>;
}) {
  const { d } = INSTITUTIONS[index]!;
  const shown = useTransform(phase, (p) =>
    smoothstep(institutionShown(index, p) / 0.5),
  );
  const scale = useTransform(shown, (v) => 0.85 + 0.15 * v);
  const visibility = useTransform(shown, (v) =>
    v < 0.005 ? 'hidden' : 'visible',
  );
  return (
    <motion.path
      d={d}
      className="fill-navy-taupe stroke-white/10"
      strokeWidth={3}
      style={{ opacity: shown, scale, visibility }}
    />
  );
}

/** The project the community gathers round: a quiet disc on the device. */
function Project({ phase }: { phase: MotionValue<number> }) {
  const shown = useTransform(phase, projectShown);
  const visibility = useTransform(shown, (v) =>
    v < 0.005 ? 'hidden' : 'visible',
  );
  return (
    <motion.circle
      r={PROJECT_RADIUS}
      className={cn(INK, 'fill-white/8')}
      strokeWidth={INK_WIDTH}
      style={{ scale: shown, visibility }}
    />
  );
}

const SETTLED_DEVICE = deviceFrame(COMMUNITY_CONFIG);

/**
 * The device's frame, drawn again over the network while the people leave
 * the device for the community, so they pass beneath it, not across it.
 */
function DeviceFrameOver({ phase }: { phase: MotionValue<number> }) {
  const { bezel, screen } = SETTLED_DEVICE;
  const visibility = useTransform(phase, (p) =>
    p > WORKFLOW_CONFIG && p < COMMUNITY_CONFIG ? 'visible' : 'hidden',
  );
  return (
    <motion.g style={{ visibility }}>
      <path
        d={`${roundedRect(bezel.w, bezel.h, bezel.r)}${roundedRect(screen.w, screen.h, screen.r)}`}
        fillRule="evenodd"
        className="fill-cyber-grape"
      />
      <path
        d={roundedRect(bezel.w, bezel.h, bezel.r)}
        className={INK}
        strokeWidth={INK_WIDTH}
      />
    </motion.g>
  );
}

// A person's figure, drawn over a node at the unit size node outlines are
// drawn at (see nodeFrame), so it scales with the node.
const FIGURE =
  'M-4.65 -4.26a4.65 4.65 0 1 0 9.3 0a4.65 4.65 0 1 0 -9.3 0ZM-8.22 8.91C-8.22 3.22 -4.26 1.43 0 1.43C4.26 1.43 8.22 3.22 8.22 8.91Z';

// Spacing of the dots on the canvas surface, in world units.
const FIELD_STEP = 34;

// The light each form casts on the canvas: a tint of its key colour, centred
// on the canvas, where every form's camera centres its subject. The canvas
// waits half-lit for the network, and comes up as it grows.
const LIGHT_LEVELS = [0.35, 1, 1, 1, 1, 1, 1];
const LIGHT_STRENGTH = 16;
const lightLevel = (form: number) => LIGHT_LEVELS[form] ?? 1;
// Every key colour at one lightness and chroma, so each tints the canvas as
// strongly as the next, whatever its own brightness. The colours are written
// out from their hues, not derived from the key colours, since older Safari
// drops relative colours.
const tint = (form: number) =>
  `oklch(0.7 0.14 ${KEY_HUES[FORM_COLORS[form] ?? 'slate-blue']})`;
const lightFor = (form: number) =>
  `radial-gradient(ellipse 72% 62% at 50% 50%, color-mix(in oklab, ${tint(form)} ${LIGHT_STRENGTH}%, transparent), transparent)`;

/**
 * The canvas's light: between neighbouring colours it cross-fades, and
 * otherwise the outgoing form's colour goes out before the incoming one
 * comes up (see lightLevels). Two layers whose colours change only when the
 * move changes, and whose opacities are written directly, so a frame costs
 * two opacity writes.
 */
function CanvasLight({ phase }: { phase: MotionValue<number> }) {
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);
  const levels = lightLevels(phase.get());

  useMotionValueEvent(phase, 'change', (p) => {
    const next = lightLevels(p);
    const from = fromRef.current;
    const to = toRef.current;
    if (!from || !to) return;
    if (from.dataset.form !== String(next.from)) {
      from.dataset.form = String(next.from);
      from.style.backgroundImage = lightFor(next.from);
      to.style.backgroundImage = lightFor(next.to);
    }
    from.style.opacity = (next.out * lightLevel(next.from)).toFixed(3);
    to.style.opacity = (next.in * lightLevel(next.to)).toFixed(3);
  });

  return (
    <>
      <div
        ref={fromRef}
        data-form={levels.from}
        className="absolute inset-0 will-change-[opacity]"
        style={{
          backgroundImage: lightFor(levels.from),
          opacity: levels.out * lightLevel(levels.from),
        }}
      />
      <div
        ref={toRef}
        className="absolute inset-0 will-change-[opacity]"
        style={{
          backgroundImage: lightFor(levels.to),
          opacity: levels.in * lightLevel(levels.to),
        }}
      />
    </>
  );
}

/**
 * The scene on its canvas: the interview's own dark canvas, lit in the key
 * colour of the form on show. `phase` runs from 0 to 6, one form per
 * principle after the seed; `reading` is the reader's position through the
 * cards (in cards), which draws the workflow's line, or undefined to show it
 * complete; `animated` is false when the scene cuts between forms instead of
 * moving through them, and the list then skips its entrance.
 */
export function DesignPrinciplesScene({
  phase,
  reading,
  animated,
  className,
}: {
  phase: MotionValue<number>;
  reading?: MotionValue<number>;
  animated: boolean;
  className?: string;
}) {
  return (
    <ThemedRegion
      theme="interview"
      aria-hidden
      className={cn(
        'relative isolate overflow-hidden outline-1 -outline-offset-1 outline-white/10',
        className,
      )}
    >
      <div className="bg-navy-taupe-dark absolute inset-0" />
      <CanvasLight phase={phase} />
      <div className="absolute inset-0">
        <Scene phase={phase} reading={reading} animated={animated} />
      </div>
    </ThemedRegion>
  );
}

// The view is VIEW_WIDTH units wide; its height follows the canvas's shape,
// between these bounds, so a taller canvas shows more of the world rather than
// letterboxing it. The camera knows the height so a form that must keep its
// stations clear of the edges can frame them in whatever shape the canvas has.
const MIN_VIEW_HEIGHT = 360;
const MAX_VIEW_HEIGHT = 560;
const viewBox = (height: number) =>
  `${-VIEW_WIDTH / 2} ${(-height / 2).toFixed(1)} ${VIEW_WIDTH} ${height.toFixed(1)}`;

function Scene({
  phase,
  reading,
  animated,
}: {
  phase: MotionValue<number>;
  reading: MotionValue<number> | undefined;
  animated: boolean;
}) {
  const uid = useId().replace(/[^\w-]/g, '');
  const gradientId = (color: NodeColor) => `${uid}-n${color}`;

  const workflow = useTransform(() =>
    workflowLine(phase.get(), readingOf(reading)),
  );

  const svgRef = useRef<SVGSVGElement>(null);
  // The camera is one transform on the whole world, written directly so the
  // scene does not re-render as it moves.
  const cameraRef = useRef<SVGGElement>(null);
  const formRef = useRef(formAt(phase.get()));
  const onScreenRef = useRef(false);
  const viewHeightRef = useRef(MIN_VIEW_HEIGHT);

  useMotionValueEvent(phase, 'change', (p) => {
    cameraRef.current?.setAttribute(
      'transform',
      cameraTransform(p, viewHeightRef.current),
    );
    const form = formAt(p);
    if (form !== formRef.current) {
      formRef.current = form;
      syncLoops(svgRef.current, form, onScreenRef.current);
    }
  });

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const fit = () => {
      const { width, height } = svg.getBoundingClientRect();
      if (width === 0) return;
      const viewHeight = Math.min(
        MAX_VIEW_HEIGHT,
        Math.max(MIN_VIEW_HEIGHT, (VIEW_WIDTH * height) / width),
      );
      svg.setAttribute('viewBox', viewBox(viewHeight));
      viewHeightRef.current = viewHeight;
      cameraRef.current?.setAttribute(
        'transform',
        cameraTransform(phase.get(), viewHeight),
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [phase]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      onScreenRef.current = entry?.isIntersecting ?? false;
      syncLoops(svg, formRef.current, onScreenRef.current);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const badge = INTERVIEWER_BADGE;

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox(MIN_VIEW_HEIGHT)}
      fill="none"
      aria-hidden
      focusable="false"
      data-form={formAt(phase.get())}
      data-loop="off"
      className="group/stage size-full overflow-visible"
    >
      <style>{`
        @keyframes nc-gather { to { stroke-dashoffset: -${CONTRIBUTION_STEP}; } }
        @keyframes nc-trail {
          from { stroke-dashoffset: ${TRAIL_BEHIND}; }
          to { stroke-dashoffset: ${TRAIL_BEHIND - CONTRIBUTION_STEP}; }
        }
        @keyframes nc-pulse {
          0% { stroke-dashoffset: 0.04; }
          85%, 100% { stroke-dashoffset: -1; }
        }
      `}</style>
      <defs>
        <clipPath id={`${uid}-badge`}>
          <rect
            x={badge.x}
            y={badge.y}
            width={badge.size}
            height={badge.size}
            rx={badge.size * 0.22}
          />
        </clipPath>
        <pattern
          id={`${uid}-field`}
          width={FIELD_STEP}
          height={FIELD_STEP}
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx={FIELD_STEP / 2}
            cy={FIELD_STEP / 2}
            r={1.3}
            className="fill-white/10"
          />
        </pattern>
        {([0, 1, 2, 3, 4, 5, 6, 7, 8] as const).map((color) => (
          <TwoToneGradient
            key={color}
            id={gradientId(color)}
            color={nodeColor(color)}
          />
        ))}
      </defs>

      <g
        ref={cameraRef}
        transform={cameraTransform(phase.get(), MIN_VIEW_HEIGHT)}
      >
        {/* The canvas surface, fixed in the world, so the camera's moves
            read as travel over it. */}
        <rect
          x={-2400}
          y={-1800}
          width={4800}
          height={3600}
          fill={`url(#${uid}-field)`}
        />

        {/* End-to-end workflow: the protocol and the table, on either side
            of the device; the line runs behind the device between them. */}
        <Scenery configs={[5]} phase={phase}>
          <ProtocolPage workflow={workflow} />
          <DataTable workflow={workflow} />
        </Scenery>
        <WorkflowLine workflow={workflow} />

        {/* Community: each institution's connection to the project, beneath
            the device. */}
        {INSTITUTIONS.map((institution, index) => (
          <InstitutionLink
            key={institution.members.join('-')}
            index={index}
            phase={phase}
          />
        ))}

        <Device phase={phase} />

        <Project phase={phase} />

        {/* The device runs Interviewer. */}
        <Scenery configs={[5]} phase={phase}>
          <image
            href={INTERVIEWER_ICON}
            x={badge.x}
            y={badge.y}
            width={badge.size}
            height={badge.size}
            clipPath={`url(#${uid}-badge)`}
          />
        </Scenery>

        {/* In-person and interviewer-assisted: the interview's two voices,
            at the device's near side. */}
        <Interview phase={phase} reading={reading} gradientId={gradientId} />

        {/* An emphasis on design: a prompt, and a list to choose from. */}
        <Scenery configs={[4]} phase={phase}>
          <rect
            x={-78}
            y={-104}
            width={156}
            height={10}
            rx={5}
            className="fill-white/80"
          />
          <rect
            x={-50}
            y={-88}
            width={100}
            height={8}
            rx={4}
            className="fill-white/40"
          />
          <rect
            x={-98}
            y={-66}
            width={196}
            height={174}
            rx={16}
            className="fill-white/6"
          />
        </Scenery>

        {edges.map((edge) => (
          <NetworkEdge
            key={edge.key}
            edge={edge}
            phase={phase}
            reading={reading}
          />
        ))}

        <AnswerSlot phase={phase} reading={reading} />

        {/* Community: the institutions round the project. */}
        {INSTITUTIONS.map((institution, index) => (
          <InstitutionBlob
            key={institution.members.join('-')}
            index={index}
            phase={phase}
          />
        ))}

        {Array.from({ length: NODE_COUNT }, (_, index) => (
          <NetworkNode
            key={index}
            index={index}
            phase={phase}
            reading={reading}
            gradientId={gradientId}
          />
        ))}

        <DeviceFrameOver phase={phase} />

        <NodeList phase={phase} animated={animated} gradientId={gradientId} />
      </g>
    </svg>
  );
}
