import { motion, useReducedMotion } from 'motion/react';
import type { Transition } from 'motion/react';
import { useEffect, useState } from 'react';

// Inert metal tone the device shows before the wand "activates" it.
const PLATINUM = '#b9bec9';

// Moment (ms after mount) the wand's wave "hits" and the device energizes.
const ACTIVATION_DELAY_MS = 1600;

// High-fidelity spot illustration for the wizard intro. On mount the scene
// springs in piece by piece (weighty spring feel), the wand waves and casts a
// star burst that turns the 3D tablet from platinum to its theme colour, then
// a check badge springs in. Shading comes from white/black gradient overlays
// on top of currentColor fills, so the artwork follows the theme's
// primary/accent tokens in both light and dark modes.
export default function SetupGlyph() {
  const reduceMotion = useReducedMotion() ?? false;
  const [activated, setActivated] = useState(reduceMotion);

  useEffect(() => {
    const timer = activated
      ? undefined
      : setTimeout(() => setActivated(true), ACTIVATION_DELAY_MS);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [activated]);

  const spring = (delay: number): Transition =>
    reduceMotion
      ? { duration: 0 }
      : { type: 'spring', stiffness: 200, damping: 15, mass: 1.2, delay };

  const popIn = reduceMotion ? false : { scale: 0, opacity: 0 };
  const settled = { scale: 1, opacity: 1 };
  const fillBox = {
    transformBox: 'fill-box',
    transformOrigin: 'center',
  } as const;

  return (
    <svg
      viewBox="0 0 220 130"
      aria-hidden="true"
      className="mx-auto h-auto w-full max-w-xs self-center"
    >
      <defs>
        <radialGradient id="setup-glyph-sphere" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="white" stopOpacity={0.45} />
          <stop offset="45%" stopColor="white" stopOpacity={0} />
          <stop offset="100%" stopColor="black" stopOpacity={0.25} />
        </radialGradient>
        <linearGradient
          id="setup-glyph-shade"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="white" stopOpacity={0.22} />
          <stop offset="45%" stopColor="white" stopOpacity={0} />
          <stop offset="100%" stopColor="black" stopOpacity={0.22} />
        </linearGradient>
      </defs>

      <motion.path
        initial={popIn}
        animate={settled}
        transition={spring(0)}
        style={fillBox}
        className="text-primary"
        fill="currentColor"
        fillOpacity={0.07}
        d="M115 16 C160 14 198 38 196 70 C194 100 158 118 112 118 C66 118 32 100 32 68 C32 36 70 18 115 16 Z"
      />

      <motion.g
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={
          reduceMotion ? { duration: 0 } : { duration: 0.4, delay: 0.5 }
        }
      >
        <ellipse
          cx={56}
          cy={112}
          rx={14}
          ry={3.5}
          fill="black"
          fillOpacity={0.1}
        />
        <ellipse
          cx={142}
          cy={117}
          rx={36}
          ry={6}
          fill="black"
          fillOpacity={0.12}
        />
      </motion.g>

      <motion.g
        initial={reduceMotion ? false : { y: 26, scale: 0.85, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={spring(0.1)}
        style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}
      >
        <g
          className="text-primary transition-colors duration-700"
          style={activated ? undefined : { color: PLATINUM }}
          transform="rotate(4 142 70)"
        >
          <rect
            x={113}
            y={27}
            width={64}
            height={86}
            rx={10}
            fill="currentColor"
          />
          <rect
            x={113}
            y={27}
            width={64}
            height={86}
            rx={10}
            fill="black"
            fillOpacity={0.35}
          />
          <rect
            x={110}
            y={24}
            width={64}
            height={86}
            rx={10}
            fill="currentColor"
          />
          <rect
            x={110}
            y={24}
            width={64}
            height={86}
            rx={10}
            fill="url(#setup-glyph-shade)"
          />
          <rect
            x={116}
            y={31}
            width={52}
            height={60}
            rx={6}
            fill="white"
            fillOpacity={0.8}
          />
          <g stroke="currentColor" strokeWidth={2} strokeOpacity={0.45}>
            <path d="M128 52 L154 46" />
            <path d="M154 46 L148 72" />
            <path d="M128 52 L148 72" />
          </g>
          <circle cx={128} cy={52} r={5} fill="currentColor" />
          <circle cx={128} cy={52} r={5} fill="url(#setup-glyph-sphere)" />
          <circle cx={154} cy={46} r={4.5} fill="currentColor" />
          <circle cx={154} cy={46} r={4.5} fill="url(#setup-glyph-sphere)" />
          <g
            className="text-accent transition-colors duration-700"
            style={activated ? undefined : { color: 'inherit' }}
          >
            <circle cx={148} cy={72} r={5.5} fill="currentColor" />
            <circle cx={148} cy={72} r={5.5} fill="url(#setup-glyph-sphere)" />
          </g>
          <path
            d="M116 60 L168 40 V49 L116 72 Z"
            fill="white"
            fillOpacity={0.15}
          />
          <path
            d="M134 100 h16"
            stroke="white"
            strokeOpacity={0.6}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
      </motion.g>

      <g className="text-accent">
        <motion.g
          initial={
            reduceMotion ? false : { x: -28, y: 20, rotate: -30, opacity: 0 }
          }
          animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          transition={spring(0.3)}
          style={fillBox}
        >
          <motion.g
            initial={false}
            animate={
              reduceMotion ? { rotate: 0 } : { rotate: [0, -18, 12, -8, 0] }
            }
            transition={{ duration: 0.9, ease: 'easeInOut', delay: 0.7 }}
            style={{ transformBox: 'fill-box', transformOrigin: '12% 88%' }}
          >
            <g transform="rotate(-45 68 80)">
              <rect
                x={38}
                y={76}
                width={56}
                height={8}
                rx={4}
                fill="currentColor"
              />
              <rect
                x={38}
                y={76}
                width={56}
                height={8}
                rx={4}
                fill="url(#setup-glyph-shade)"
              />
              <rect x={82} y={76} width={12} height={8} rx={4} fill="white" />
            </g>
          </motion.g>
        </motion.g>
        <motion.g
          initial={popIn}
          animate={settled}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { delay: 1.15, type: 'spring', stiffness: 260, damping: 13 }
          }
          style={fillBox}
        >
          <circle
            cx={98}
            cy={46}
            r={16}
            fill="currentColor"
            fillOpacity={0.15}
          />
          <path
            d="M98 37 C98.7 43.3 100.7 45.3 107 46 C100.7 46.7 98.7 48.7 98 55 C97.3 48.7 95.3 46.7 89 46 C95.3 45.3 97.3 43.3 98 37 Z"
            fill="currentColor"
          />
          <path
            d="M98 37 C98.7 43.3 100.7 45.3 107 46 C100.7 46.7 98.7 48.7 98 55 C97.3 48.7 95.3 46.7 89 46 C95.3 45.3 97.3 43.3 98 37 Z"
            fill="url(#setup-glyph-sphere)"
          />
          <circle cx={109} cy={36} r={2} fill="currentColor" />
          <circle
            cx={115.5}
            cy={29.5}
            r={1.5}
            fill="currentColor"
            fillOpacity={0.8}
          />
          <circle
            cx={121}
            cy={24}
            r={1}
            fill="currentColor"
            fillOpacity={0.6}
          />
        </motion.g>
      </g>

      <motion.g
        className="text-accent"
        initial={false}
        animate={{ scale: activated ? 1 : 0, opacity: activated ? 1 : 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { delay: 0.3, type: 'spring', stiffness: 300, damping: 15 }
        }
        style={fillBox}
      >
        <circle cx={186} cy={28} r={10} fill="currentColor" />
        <path
          d="M182 28.4 l2.8 2.8 l6 -6"
          stroke="white"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </motion.g>

      <motion.g
        initial={reduceMotion ? false : { y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={spring(1.5)}
        className="text-accent"
        fill="currentColor"
      >
        <path d="M36 19.8 C36.2 21.4 36.6 21.8 38.2 22 C36.6 22.2 36.2 22.6 36 24.2 C35.8 22.6 35.4 22.2 33.8 22 C35.4 21.8 35.8 21.4 36 19.8 Z" />
        <circle cx={24} cy={60} r={1.6} />
      </motion.g>
      <motion.g
        initial={reduceMotion ? false : { y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={spring(1.65)}
        className="text-primary"
        fill="currentColor"
      >
        <path d="M58 28.8 C58.3 31.2 58.8 31.7 61.2 32 C58.8 32.3 58.3 32.8 58 35.2 C57.7 32.8 57.2 32.3 54.8 32 C57.2 31.7 57.7 31.2 58 28.8 Z" />
        <circle cx={196} cy={58} r={1.6} />
        <circle
          cx={204}
          cy={84}
          r={4}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeWidth={2}
        />
      </motion.g>
    </svg>
  );
}
