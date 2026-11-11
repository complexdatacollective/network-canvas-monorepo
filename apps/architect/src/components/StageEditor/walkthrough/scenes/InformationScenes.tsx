import { Pause, Volume2, VolumeX } from 'lucide-react';

import { backOut, segment } from '@codaco/art/illustration/motion';

import { Card } from './InterpreterScenes';
import {
  Chip,
  Click,
  defineScene,
  lerp,
  NEXT_BUTTON,
  pivot,
  pressAt,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  TextBar,
  type Point,
} from './parts';

const TEXT = {
  welcome: 'Welcome to the study',
  aboutStudy: 'About this study',
  watch: 'Watch and listen',
  nothing: 'Nothing is recorded',
  unchanged: 'No nodes, edges or attributes',
  text: 'Text',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  muted: 'Muted, on a loop',
  starts: 'Starts by itself',
  sizes: ['Full size', 'Small', 'Medium', 'Large'],
} as const;

/** The page: one raised surface, centered, with its heading on top. */
const PAGE = {
  x: STAGE_CENTER_X - 220,
  width: 440,
  y: STAGE.y + 14,
} as const;
const INNER = { x: PAGE.x + 30, width: PAGE.width - 60 } as const;

function Heading({ text, y }: { text: string; y: number }) {
  return (
    <text
      x={STAGE_CENTER_X}
      y={y}
      textAnchor="middle"
      fontSize={26}
      fontWeight={900}
      className="fill-white"
    >
      {text}
    </text>
  );
}

/** A paragraph of text, as bars, each popping in from `at`. */
function Paragraph({
  y,
  widths,
  at = [],
  t = 0,
}: {
  y: number;
  widths: readonly number[];
  at?: readonly number[];
  t?: number;
}) {
  return (
    <>
      {widths.map((width, i) => {
        const start = at[i];
        const k = start === undefined ? 1 : smooth(segment(t, start, 0.3));
        if (k <= 0) return null;
        return (
          <TextBar key={width} x={INNER.x} y={y + i * 22} width={width * k} />
        );
      })}
    </>
  );
}

/** An image block: a landscape, centered, at the size it is drawn. */
function Picture({
  clip,
  y,
  width,
  height,
  k = 1,
}: {
  clip: string;
  y: number;
  width: number;
  height: number;
  k?: number;
}) {
  if (k <= 0) return null;
  const x = STAGE_CENTER_X - width / 2;
  return (
    <g transform={pivot(STAGE_CENTER_X, y + height / 2, k)}>
      <clipPath id={clip}>
        <rect x={x} y={y} width={width} height={height} rx={8} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          className="fill-sea-serpent"
        />
        <circle
          cx={x + width * 0.74}
          cy={y + height * 0.3}
          r={height * 0.14}
          className="fill-mustard"
        />
        <path
          d={`M ${x} ${y + height} L ${x + width * 0.34} ${y + height * 0.45} L ${x + width * 0.58} ${y + height * 0.76} L ${x + width * 0.8} ${y + height * 0.56} L ${x + width} ${y + height} Z`}
          className="fill-sea-green"
        />
      </g>
    </g>
  );
}

/** A video block playing: its picture moves and its progress loops. */
function VideoBlock({
  clip,
  t,
  y,
  height,
  muted = true,
  k = 1,
}: {
  clip: string;
  t: number;
  y: number;
  height: number;
  muted?: boolean;
  k?: number;
}) {
  if (k <= 0) return null;
  const { x, width } = INNER;
  const loop = (t % 2.5) / 2.5;
  const bar = y + height - 22;
  const Volume = muted ? VolumeX : Volume2;
  return (
    <g transform={pivot(STAGE_CENTER_X, y + height / 2, k)}>
      <clipPath id={clip}>
        <rect x={x} y={y} width={width} height={height} rx={8} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          className="fill-charcoal"
        />
        <circle
          cx={lerp(x + 40, x + width - 40, loop)}
          cy={y + height * 0.42 - Math.abs(Math.sin(loop * Math.PI * 3)) * 24}
          r={18}
          className="fill-neon-coral"
        />
        <rect
          x={x}
          y={bar - 14}
          width={width}
          height={36}
          className="fill-navy-taupe/80"
        />
      </g>
      <Pause
        x={x + 10}
        y={bar - 8}
        width={16}
        height={16}
        strokeWidth={2.6}
        className="text-white"
      />
      <line
        x1={x + 38}
        y1={bar}
        x2={x + width - 46}
        y2={bar}
        className="stroke-white/30"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <line
        x1={x + 38}
        y1={bar}
        x2={lerp(x + 38, x + width - 46, loop)}
        y2={bar}
        className="stroke-white"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Volume
        x={x + width - 32}
        y={bar - 9}
        width={18}
        height={18}
        strokeWidth={2.4}
        className="text-white"
      />
    </g>
  );
}

const AUDIO_WIDTH = 300;

/** An audio block: the browser's player, already playing. */
function AudioBlock({
  y,
  progress,
  k = 1,
}: {
  y: number;
  progress: number;
  k?: number;
}) {
  if (k <= 0) return null;
  const x = INNER.x;
  const mid = y + 22;
  return (
    <g transform={pivot(x + AUDIO_WIDTH / 2, mid, k)}>
      <rect
        x={x}
        y={y}
        width={AUDIO_WIDTH}
        height={44}
        rx={22}
        className="fill-white/15"
      />
      <Pause
        x={x + 14}
        y={mid - 8}
        width={16}
        height={16}
        strokeWidth={2.6}
        className="text-white"
      />
      <line
        x1={x + 44}
        y1={mid}
        x2={x + AUDIO_WIDTH - 50}
        y2={mid}
        className="stroke-white/30"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <line
        x1={x + 44}
        y1={mid}
        x2={lerp(x + 44, x + AUDIO_WIDTH - 50, progress)}
        y2={mid}
        className="stroke-white"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Volume2
        x={x + AUDIO_WIDTH - 36}
        y={mid - 9}
        width={18}
        height={18}
        strokeWidth={2.4}
        className="text-white"
      />
    </g>
  );
}

/**
 * Shows an information stage where a page appears with a heading, then lines of
 * text and an image, and the participant clicks Next to move on.
 */
export const InformationIntroScene = defineScene(5.2, ({ t, id }) => {
  const title = TEXT.welcome.slice(
    0,
    Math.round(TEXT.welcome.length * segment(t, 0.5, 0.9)),
  );
  const leave = smooth(segment(t, 4.4, 0.5));
  return {
    rail: { progress: 0.05, press: pressAt(t, [4.2]) },
    body: (
      <g
        transform={`translate(0 ${-leave * 60})`}
        opacity={(1 - leave) * smooth(segment(t, 0.2, 0.3))}
      >
        <Card x={PAGE.x} y={PAGE.y} width={PAGE.width} height={300} />
        <Heading text={title} y={PAGE.y + 46} />
        <Paragraph
          y={PAGE.y + 84}
          widths={[380, 340, 250]}
          at={[1.5, 1.7, 1.9]}
          t={t}
        />
        <Picture
          clip={`${id}-intro-image`}
          y={PAGE.y + 150}
          width={224}
          height={136}
          k={backOut(segment(t, 2.4, 0.4))}
        />
      </g>
    ),
    overlay: <Click t={t} stops={[{ to: NEXT_BUTTON, at: 4.2 }]} leave={4.6} />,
  };
});

/**
 * Shows an information stage where the participant moves on from a page of text
 * and video, and nothing is recorded: no nodes, edges or attributes.
 */
export const InformationDataScene = defineScene(5.4, ({ t, id }) => {
  const leave = smooth(segment(t, 2.4, 0.5));
  return {
    rail: { progress: 0.05, press: pressAt(t, [2.2]) },
    body: (
      <>
        <g transform={`translate(0 ${-leave * 60})`} opacity={1 - leave}>
          <Card x={PAGE.x} y={PAGE.y} width={PAGE.width} height={300} />
          <Heading text={TEXT.aboutStudy} y={PAGE.y + 46} />
          <Paragraph y={PAGE.y + 84} widths={[380, 300]} />
          <VideoBlock
            clip={`${id}-data-video`}
            t={t}
            y={PAGE.y + 128}
            height={150}
          />
        </g>
        <Chip
          x={STAGE_CENTER_X}
          y={STAGE.y + 150}
          text={TEXT.nothing}
          size={22}
          fill="fill-cyber-grape"
          ink="fill-white"
          k={backOut(segment(t, 3.1, 0.4))}
        />
        <text
          x={STAGE_CENTER_X}
          y={STAGE.y + 210}
          textAnchor="middle"
          fontSize={17}
          fontWeight={700}
          className="fill-white/70"
          opacity={smooth(segment(t, 3.6, 0.4))}
        >
          {TEXT.unchanged}
        </text>
      </>
    ),
    overlay: <Click t={t} stops={[{ to: NEXT_BUTTON, at: 2.2 }]} leave={2.6} />,
  };
});

/**
 * Shows an information stage where a text block, an image, a video and an audio
 * player are added down the page in order, and the page then scrolls to show
 * them all.
 */
export const InformationBlocksScene = defineScene(6.2, ({ t, id }) => {
  const blocks = [
    { at: 0.6, label: TEXT.text, top: 72, grow: 64 },
    { at: 1.5, label: TEXT.image, top: 152, grow: 136 },
    { at: 2.4, label: TEXT.video, top: 288, grow: 136 },
    { at: 3.3, label: TEXT.audio, top: 434, grow: 72 },
  ] as const;
  const shown = blocks.map((b) => backOut(segment(t, b.at, 0.4)));
  const height = blocks.reduce(
    (h, b) => h + b.grow * smooth(segment(t, b.at, 0.3)),
    92,
  );
  const scroll = smooth(segment(t, 4.0, 1.0)) * 188;
  const top = PAGE.y - scroll;
  const clip = `${id}-blocks-scroll`;
  const labelX = PAGE.x + PAGE.width + 46;
  return {
    rail: { progress: 0.05 },
    body: (
      <>
        <clipPath id={clip}>
          <rect
            x={STAGE.x}
            y={STAGE.y}
            width={STAGE.right - STAGE.x}
            height={STAGE.bottom - STAGE.y}
          />
        </clipPath>
        <g clipPath={`url(#${clip})`}>
          <Card x={PAGE.x} y={top} width={PAGE.width} height={height} />
          <Heading text={TEXT.aboutStudy} y={top + 46} />
          {(shown[0] ?? 0) > 0 ? (
            <g opacity={Math.min(1, shown[0] ?? 0)}>
              <Paragraph y={top + 84} widths={[380, 330, 260]} />
            </g>
          ) : null}
          <Picture
            clip={`${id}-blocks-image`}
            y={top + 152}
            width={200}
            height={120}
            k={shown[1] ?? 0}
          />
          <VideoBlock
            clip={`${id}-blocks-video`}
            t={t}
            y={top + 288}
            height={130}
            k={shown[2] ?? 0}
          />
          <AudioBlock
            y={top + 434}
            progress={segment(t, 3.3, 10)}
            k={shown[3] ?? 0}
          />
          {blocks.map((b, i) => (
            <Chip
              key={b.label}
              x={labelX}
              y={top + b.top + (b.grow - 16) / 2}
              text={b.label}
              size={14}
              k={shown[i] ?? 0}
            />
          ))}
        </g>
      </>
    ),
  };
});

/**
 * Shows an information stage where a video and an audio player start playing as
 * the page opens, with the video muted and looping until the participant clicks
 * to unmute it.
 */
export const InformationMediaScene = defineScene(5.6, ({ t, id }) => {
  const videoTop = PAGE.y + 66;
  const videoHeight = 170;
  const audioTop = videoTop + videoHeight + 18;
  const unmute: Point = [
    INNER.x + INNER.width - 23,
    videoTop + videoHeight - 22,
  ];
  return {
    rail: { progress: 0.05 },
    body: (
      <>
        <Card x={PAGE.x} y={PAGE.y} width={PAGE.width} height={328} />
        <Heading text={TEXT.watch} y={PAGE.y + 44} />
        <VideoBlock
          clip={`${id}-media-video`}
          t={t}
          y={videoTop}
          height={videoHeight}
          muted={t < 3.6}
        />
        <AudioBlock y={audioTop} progress={Math.min(1, t / 10)} />
        <Chip
          x={INNER.x + INNER.width - 150}
          y={videoTop + 24}
          text={TEXT.muted}
          size={13}
          align="start"
          k={backOut(segment(t, 1.0, 0.4)) * (1 - segment(t, 3.6, 0.3))}
        />
        <Chip
          x={INNER.x + AUDIO_WIDTH + 12}
          y={audioTop + 22}
          text={TEXT.starts}
          size={13}
          align="start"
          k={backOut(segment(t, 1.8, 0.4))}
        />
      </>
    ),
    overlay: <Click t={t} stops={[{ to: unmute, at: 3.6 }]} leave={4.2} />,
  };
});

/**
 * Shows an information stage where an image changes between the Full size,
 * Small, Medium and Large display sizes, getting shorter or taller but keeping
 * its proportions.
 */
export const InformationSizeScene = defineScene(6.2, ({ t, id }) => {
  const heights = [200, 70, 120, 170] as const;
  const changes = [1.2, 2.6, 4.0] as const;
  let height: number = heights[0];
  let current = 0;
  changes.forEach((at, i) => {
    const k = smooth(segment(t, at, 0.4));
    if (k > 0) height = lerp(heights[i] ?? 0, heights[i + 1] ?? 0, k);
    if (t >= at + 0.2) current = i + 1;
  });
  const imageTop = PAGE.y + 70;
  return {
    rail: { progress: 0.05 },
    body: (
      <>
        <Card
          x={PAGE.x}
          y={PAGE.y}
          width={PAGE.width}
          height={70 + height + 62}
        />
        <Heading text={TEXT.aboutStudy} y={PAGE.y + 46} />
        <Picture
          clip={`${id}-size-image`}
          y={imageTop}
          width={height * 1.6}
          height={height}
        />
        <Chip
          key={current}
          x={STAGE_CENTER_X}
          y={imageTop + height + 32}
          text={TEXT.sizes[current] ?? ''}
          size={15}
          k={
            current === 0
              ? 1
              : backOut(segment(t, changes[current - 1] ?? 0, 0.4))
          }
        />
      </>
    ),
  };
});
