import type { Transition, Variants } from 'motion/react';

const entranceSpring: Transition = {
  type: 'spring',
  stiffness: 100,
  damping: 20,
  mass: 0.8,
};

export function createHeroEntrance(reduceMotion: boolean) {
  // The header enters first. It sits outside `<main>` and the hero inside, so
  // the hero waits for it rather than sharing a parent's stagger.
  const heroVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        delayChildren: reduceMotion ? 0 : 0.16,
        staggerChildren: reduceMotion ? 0 : 0.12,
      },
    },
  };
  const itemVariants: Variants = reduceMotion
    ? {
        hidden: { opacity: 1, y: 0 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0 },
        },
      }
    : {
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: entranceSpring,
        },
      };

  // An opacity below 1 forms a Backdrop Root, so translucent surfaces need
  // entrance motion that never prevents them from sampling the page weave.
  const backdropItemVariants: Variants = reduceMotion
    ? {
        hidden: { opacity: 1, visibility: 'visible', y: 0 },
        visible: {
          opacity: 1,
          visibility: 'visible',
          y: 0,
          transition: { duration: 0 },
        },
      }
    : {
        hidden: { opacity: 1, visibility: 'hidden', y: 16 },
        visible: {
          opacity: 1,
          visibility: 'visible',
          y: 0,
          transition: entranceSpring,
        },
      };

  return {
    backdropItemVariants,
    initial: reduceMotion ? false : 'hidden',
    heroVariants,
    itemVariants,
  };
}
