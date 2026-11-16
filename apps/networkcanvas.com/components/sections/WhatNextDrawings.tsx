'use client';

import { motion, type Transition } from 'motion/react';
import { useId } from 'react';

import { entranceEase, popEase } from '~/components/ui/useOnceInView';

// The drawings that head the What next? panels, made of the network's own
// marks: nodes in Fresco's two-tone fills, edges and lines of text. The two
// large ones play their entrance once with their panels (`play`); `timing`
// is the section's, which collapses every transition under reduced motion.

type Timing = (transition: Transition) => Transition;
type DrawingProps = { play: boolean; timing: Timing };

type Tone = 'coral' | 'sea' | 'slate' | 'mustard';

const toneColor: Record<Tone, string> = {
  coral: 'neon-coral',
  sea: 'sea-green',
  slate: 'slate-blue',
  mustard: 'mustard',
};

/**
 * A node's two-tone fill, as SVG gradients: `url(#<prefix>-<tone>)`. Each
 * drawing renders its own, under its own id, so ids never collide.
 */
function ToneGradients({
  prefix,
  tones,
}: {
  prefix: string;
  tones: readonly Tone[];
}) {
  return (
    <defs>
      {tones.map((tone) => (
        <linearGradient
          key={tone}
          id={`${prefix}-${tone}`}
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0.5"
            style={{ stopColor: `var(--color-${toneColor[tone]})` }}
          />
          <stop
            offset="0.5"
            style={{ stopColor: `var(--color-${toneColor[tone]}-dark)` }}
          />
        </linearGradient>
      ))}
    </defs>
  );
}

function popIn(play: boolean, timing: Timing, delay: number) {
  return {
    initial: { scale: 0 },
    animate: { scale: play ? 1 : 0 },
    transition: timing({ duration: 0.45, ease: popEase, delay }),
  };
}

/** An outline of nodes: the documentation's contents. */
export function OutlineDrawing({ play, timing }: DrawingProps) {
  const id = useId();
  const fill = (tone: Tone) => `url(#${id}-${tone})`;
  const bar = (index: number) => ({
    style: { originX: 0 },
    initial: { scaleX: 0 },
    animate: { scaleX: play ? 1 : 0 },
    transition: timing({
      duration: 0.7,
      ease: entranceEase,
      delay: 0.3 + index * 0.12,
    }),
  });
  return (
    <svg
      aria-hidden
      viewBox="0 0 220 104"
      className="mb-7 h-26 w-55 overflow-visible"
    >
      <ToneGradients prefix={id} tones={['coral', 'sea', 'slate', 'mustard']} />
      <motion.path
        d="M14 14 V 90 M14 46 H 40 M14 70 H 40"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        className="stroke-text/25"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: play ? 1 : 0 }}
        transition={timing({ duration: 0.6, ease: entranceEase, delay: 0.15 })}
      />
      <motion.circle
        cx={14}
        cy={14}
        r={10}
        fill={fill('coral')}
        {...popIn(play, timing, 0.2)}
      />
      <motion.rect
        x={34}
        y={9}
        width={150}
        height={10}
        rx={5}
        className="fill-text/18"
        {...bar(0)}
      />
      <motion.rect
        x={40}
        y={37}
        width={18}
        height={18}
        rx={5}
        fill={fill('sea')}
        {...popIn(play, timing, 0.32)}
      />
      <motion.rect
        x={68}
        y={41}
        width={112}
        height={10}
        rx={5}
        className="fill-text/12"
        {...bar(1)}
      />
      <motion.g {...popIn(play, timing, 0.44)}>
        <rect
          x={42}
          y={62}
          width={15}
          height={15}
          rx={4}
          fill={fill('slate')}
          transform="rotate(45 49.5 69.5)"
        />
      </motion.g>
      <motion.rect
        x={68}
        y={65}
        width={84}
        height={10}
        rx={5}
        className="fill-text/12"
        {...bar(2)}
      />
      <motion.circle
        cx={14}
        cy={92}
        r={8}
        fill={fill('mustard')}
        {...popIn(play, timing, 0.56)}
      />
      <motion.rect
        x={34}
        y={87}
        width={128}
        height={10}
        rx={5}
        className="fill-text/18"
        {...bar(3)}
      />
    </svg>
  );
}

/** Linked speech bubbles and a cursor: the community forum. */
export function ForumDrawing({ play, timing }: DrawingProps) {
  const id = useId();
  const bubble = (index: number, from: 'left' | 'right') => ({
    style: { originX: from === 'left' ? 0 : 1, originY: 1 },
    initial: { scale: 0.4, opacity: 0 },
    animate: play ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 },
    transition: timing({
      scale: { duration: 0.5, ease: popEase, delay: 0.3 + index * 0.26 },
      opacity: { duration: 0.2, delay: 0.3 + index * 0.26 },
    }),
  });
  return (
    <svg
      aria-hidden
      viewBox="0 0 220 104"
      className="mb-7 h-26 w-55 overflow-visible"
    >
      <ToneGradients prefix={id} tones={['sea', 'slate']} />
      <path
        d="M118 27 C 130 22, 140 16, 152 14 M96 46 C 110 52, 118 56, 128 60"
        fill="none"
        strokeWidth={2}
        strokeDasharray="3 5"
        strokeLinecap="round"
        className="stroke-text/22"
      />
      <motion.g {...bubble(0, 'left')}>
        <rect
          x={6}
          y={8}
          width={112}
          height={38}
          rx={19}
          fill={`url(#${id}-sea)`}
        />
        <path d="M18 40 l-12 16 l26 -12 z" className="fill-sea-green-dark" />
        <circle cx={28} cy={27} r={7} className="fill-white/95" />
        <rect
          x={42}
          y={23}
          width={58}
          height={8}
          rx={4}
          className="fill-white/70"
        />
      </motion.g>
      <motion.g {...bubble(1, 'right')}>
        <rect
          x={112}
          y={60}
          width={100}
          height={36}
          rx={18}
          strokeWidth={1.5}
          className="fill-surface stroke-text/14"
        />
        <path d="M194 92 l14 10 v-16 z" className="fill-surface" />
        {[146, 162, 178].map((cx) => (
          <circle key={cx} cx={cx} cy={78} r={4} className="fill-text/40" />
        ))}
      </motion.g>
      <motion.g {...bubble(2, 'right')}>
        <rect
          x={152}
          y={0}
          width={60}
          height={28}
          rx={14}
          fill={`url(#${id}-slate)`}
        />
        <rect
          x={166}
          y={10}
          width={32}
          height={8}
          rx={4}
          className="fill-white/75"
        />
      </motion.g>
      <motion.path
        d="M80 38 l0 26 l7 -6 l5 11 l5 -2 l-5 -11 l9 0 z"
        strokeWidth={2}
        strokeLinejoin="round"
        className="fill-text stroke-surface"
        initial={{ opacity: 0, x: 14, y: 10 }}
        animate={
          play ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: 14, y: 10 }
        }
        transition={timing({
          x: { duration: 0.6, ease: entranceEase, delay: 1.2 },
          y: { duration: 0.6, ease: entranceEase, delay: 1.2 },
          opacity: { duration: 0.3, delay: 1.2 },
        })}
      />
    </svg>
  );
}

/** Three nodes in a triangle: collaboration. Still. */
export function TriadDrawing() {
  const id = useId();
  return (
    <svg aria-hidden viewBox="0 0 64 64" className="size-16">
      <ToneGradients prefix={id} tones={['mustard', 'slate', 'coral']} />
      <path
        d="M32 14 L12 48 L52 48 Z"
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        className="stroke-text/28"
      />
      <circle cx={32} cy={14} r={10} fill={`url(#${id}-mustard)`} />
      <rect
        x={3}
        y={39}
        width={18}
        height={18}
        rx={5}
        fill={`url(#${id}-slate)`}
      />
      <rect
        x={44}
        y={40}
        width={16}
        height={16}
        rx={4}
        fill={`url(#${id}-coral)`}
        transform="rotate(45 52 48)"
      />
    </svg>
  );
}
