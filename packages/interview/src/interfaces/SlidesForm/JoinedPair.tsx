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
    reduced
      ? { opacity: 0 }
      : { y: -MOTION.shift, scale: MOTION.personScale, opacity: 0 },
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
      y: 0,
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
    return { scale, opacity: 0, transition };
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
 * own, so a person in the same place in one pair and the next stays while the
 * rest of the pair changes around them. A person who changes place leaves and
 * arrives like anyone else: moving across, they would seem to be the other
 * person taking their place.
 */
export default function JoinedPair({ from, to, connection }: JoinedPairProps) {
  const change = useHeaderChange();
  // Who was shown where before this pair, to number only those arriving.
  const ids = [from, to].map((person, place) =>
    person ? `${place}:${person.id}` : null,
  );
  const [pairs, setPairs] = useState({
    now: ids,
    before: [] as (string | null)[],
  });
  if (pairs.now.join(' ') !== ids.join(' ')) {
    setPairs({ now: ids, before: pairs.now });
  }
  const arriving = ids.filter(
    (id) => id !== null && !pairs.before.includes(id),
  );

  const person = (part: Part, place: number) => {
    const id = `${place}:${part.id}`;
    return (
      <motion.div
        key={id}
        // Above the connection, which reaches under their edge.
        className="relative z-1"
        custom={{ ...change, step: Math.max(0, arriving.indexOf(id)) }}
        variants={personVariants}
        initial="enter"
        animate="rest"
        exit="leave"
      >
        {part.content}
      </motion.div>
    );
  };

  return (
    // Those leaving are taken out of the row, so those arriving take their
    // place in it as they go.
    <div className="relative flex items-center">
      <AnimatePresence mode="popLayout" custom={change}>
        {from && person(from, 0)}
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
        {to && person(to, 1)}
      </AnimatePresence>
    </div>
  );
}
