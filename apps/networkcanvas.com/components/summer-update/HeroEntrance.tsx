import { motion, type Variants } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';

type HeroEntrancePhase = 'apps' | 'brand' | 'copy' | 'cue' | 'lead';

const entranceSpring = {
  type: 'spring',
  stiffness: 100,
  damping: 20,
  mass: 0.8,
} as const;

const brandSpring = {
  type: 'spring',
  stiffness: 180,
  damping: 16,
  mass: 0.72,
} as const;

export const launchHeroHeaderVariants: Variants = {
  hidden: { opacity: 0, y: -12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ...entranceSpring,
      delay: 0.04,
    },
  },
};

export const launchHeroWeaveVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      ...entranceSpring,
      delay: 0.1,
    },
  },
};

const entranceVariants = {
  lead: {
    hidden: {
      opacity: 0,
      scaleY: 0.94,
      y: 28,
    },
    visible: {
      opacity: 1,
      scaleY: 1,
      y: 0,
      transition: {
        opacity: { delay: 0.18, duration: 0.18 },
        scaleY: { ...entranceSpring, delay: 0.18 },
        y: { ...entranceSpring, delay: 0.18 },
      },
    },
  },
  brand: {
    hidden: {
      opacity: 0,
      scale: 0.92,
      y: 26,
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        opacity: { delay: 0.5, duration: 0.18 },
        scale: { ...brandSpring, delay: 0.5 },
        y: { ...brandSpring, delay: 0.5 },
      },
    },
  },
  apps: {
    hidden: {
      opacity: 0,
      y: 24,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        opacity: { delay: 0.72, duration: 0.16 },
        y: { ...entranceSpring, delay: 0.72 },
      },
    },
  },
  copy: {
    hidden: {
      opacity: 0,
      y: 16,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        ...entranceSpring,
        delay: 1.02,
      },
    },
  },
  cue: {
    hidden: {
      opacity: 0,
      y: 8,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        ...entranceSpring,
        delay: 1.58,
      },
    },
  },
} satisfies Record<HeroEntrancePhase, Variants>;

export function HeroEntrance({
  as = 'div',
  children,
  className,
  phase,
  style,
}: {
  as?: 'div' | 'span';
  children: ReactNode;
  className?: string;
  phase: HeroEntrancePhase;
  style?: CSSProperties;
}) {
  const entranceClassName = ['entrance-motion-item', className]
    .filter(Boolean)
    .join(' ');

  if (as === 'span') {
    return (
      <motion.span
        data-hero-phase={phase}
        variants={entranceVariants[phase]}
        className={entranceClassName}
        style={style}
      >
        {children}
      </motion.span>
    );
  }

  return (
    <motion.div
      data-hero-phase={phase}
      variants={entranceVariants[phase]}
      className={entranceClassName}
      style={style}
    >
      {children}
    </motion.div>
  );
}
