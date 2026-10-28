'use client';

import { AnimatePresence, motion, type Variants } from 'motion/react';
import { type ReactNode, useState } from 'react';

import {
  arrival,
  type ChangeStyle,
  MOTION,
  REDUCED,
  useHeaderChange,
} from './JoinedSlides';

type Part = {
  /** Stays the same while the part is shown, from one pair to the next. */
  id: string;
  content: ReactNode;
};

type PartStyle = ChangeStyle & {
  /** How many of the people arriving come in before this one. */
  step: number;
};

const personVariants: Variants = {
  enter: ({ reduced }: PartStyle) =>
    reduced ? { opacity: 0 } : { scale: MOTION.personScale, opacity: 0 },
  rest: ({ first, reduced, step }: PartStyle) => {
    if (reduced) {
      return {
        opacity: 1,
        transition: {
          delay: first ? 0 : REDUCED.out,
          duration: REDUCED.in,
          ease: 'linear',
        },
      };
    }
    const delay = arrival(
      MOTION.personIn.delay + step * MOTION.pair.step,
      first,
    );
    return {
      scale: 1,
      opacity: 1,
      transition: {
        delay,
        type: 'spring',
        stiffness: MOTION.personIn.stiffness,
        damping: MOTION.personIn.damping,
        opacity: { delay, ...MOTION.personIn.fade },
      },
    };
  },
  leave: ({ reduced }: ChangeStyle) => {
    if (reduced) {
      return {
        opacity: 0,
        transition: { duration: REDUCED.out, ease: 'linear' },
      };
    }
    const { scale, ...transition } = MOTION.personOut;
    // At once behind anyone moving to their place.
    return {
      scale,
      opacity: 0,
      zIndex: 0,
      transition: { ...transition, zIndex: { duration: 0 } },
    };
  },
};

/** Drawn from the first person to the second, and taken back the same way. */
const connectionVariants: Variants = {
  enter: ({ reduced }: ChangeStyle) =>
    reduced ? { opacity: 0 } : { scaleX: 0 },
  rest: ({ first, reduced }: ChangeStyle) => {
    if (reduced) {
      return {
        opacity: 1,
        transition: {
          delay: first ? 0 : REDUCED.out,
          duration: REDUCED.in,
          ease: 'linear',
        },
      };
    }
    const { delay, ...transition } = MOTION.pair.connect;
    return {
      scaleX: 1,
      transition: { delay: arrival(delay, first), ...transition },
    };
  },
  leave: ({ reduced }: ChangeStyle) =>
    reduced
      ? { opacity: 0, transition: { duration: REDUCED.out, ease: 'linear' } }
      : { scaleX: 0, transition: MOTION.pair.connectionOut },
};

type JoinedPairProps = {
  from: Part | null;
  to: Part | null;
  /** Between the two people, under the edge of each. */
  connection: Part;
};

/**
 * The header of a JoinedSlides form about connections: two people and the
 * connection between them, in reading order. Each part comes and goes on its
 * own, so a person in both one pair and the next stays and moves to their
 * place in it while the rest of the pair changes around them.
 */
export default function JoinedPair({ from, to, connection }: JoinedPairProps) {
  const change = useHeaderChange();
  const people = [from, to].filter((person) => person !== null);

  // Who was shown before this pair, to number only those arriving.
  const ids = people.map((person) => person.id);
  const [pairs, setPairs] = useState({ now: ids, before: [] as string[] });
  if (pairs.now.join(' ') !== ids.join(' ')) {
    setPairs({ now: ids, before: pairs.now });
  }
  const arriving = ids.filter((id) => !pairs.before.includes(id));

  const person = (part: Part) => (
    <motion.div
      key={part.id}
      // Above the connection, which reaches under their edge.
      className="relative z-1"
      // With reduced motion, Motion moves them to their place at once.
      layout="position"
      custom={{ ...change, step: Math.max(0, arriving.indexOf(part.id)) }}
      variants={personVariants}
      initial="enter"
      animate="rest"
      exit="leave"
      transition={{ layout: { type: 'spring', ...MOTION.pair.move } }}
    >
      {part.content}
    </motion.div>
  );

  return (
    // Those leaving are taken out of the row, so the people staying can move
    // to their place as soon as they go.
    <div className="relative flex items-center">
      <AnimatePresence mode="popLayout" custom={change}>
        {from && person(from)}
        <motion.div
          key={connection.id}
          className="ltr:origin-left rtl:origin-right"
          custom={change}
          variants={connectionVariants}
          initial="enter"
          animate="rest"
          exit="leave"
        >
          {connection.content}
        </motion.div>
        {to && person(to)}
      </AnimatePresence>
    </div>
  );
}
