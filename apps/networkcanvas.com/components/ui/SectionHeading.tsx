'use client';

import { inView, motion, type Variants } from 'motion/react';
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import { cn } from '~/lib/cn';

// Every section heading on the homepage plays an entrance the first time it
// comes into view, and then stays. Each word of the title sits behind its own
// mask and rises into view one after another, tipping level as it lands; the
// introduction then rises in. Only transforms and opacity move, so the
// browser can composite every frame without repainting the text.

const ease = [0.22, 1, 0.36, 1] as const;

const wordVariants: Variants = {
  hidden: { y: '1.25em', rotate: 7, opacity: 0 },
  shown: (index: number) => ({
    y: 0,
    rotate: 0,
    opacity: 1,
    transition: { duration: 0.8, ease, delay: index * 0.07 },
  }),
};

const bodyVariants: Variants = {
  hidden: { y: 28, opacity: 0 },
  shown: (words: number) => ({
    y: 0,
    opacity: 1,
    transition: { duration: 0.8, ease, delay: 0.25 + words * 0.07 },
  }),
};

// How far in from the top and bottom of the screen a title has to come
// before its entrance plays: 12% of the screen's height.
const INSET = 0.12;

/** The observer margin that keeps a title's entrance off the screen's edges. */
export function headingMargin(viewportHeight: number) {
  const inset = Math.round(viewportHeight * INSET);
  return `${-inset}px 0px ${-inset}px 0px` as const;
}

type SectionHeadingProps = {
  title: string;
  children?: ReactNode;
  className?: string;
  headingClassName?: string;
  bodyClassName?: string;
  id?: string;
};

export function SectionHeading({
  title,
  children,
  className,
  headingClassName,
  bodyClassName,
  id,
}: SectionHeadingProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const element = titleRef.current;
    if (!element) return undefined;
    // The title counts as seen once half of it is inside the middle of the
    // screen, so the entrance plays where it can be watched rather than at
    // the very edge. Once seen, it stays. The inset is a share of the
    // screen's height, in px: a percentage would be resolved against its
    // width, and on a wide, short window leave nowhere to be seen.
    let stop = () => {};
    const observe = () => {
      stop();
      stop = inView(
        element,
        () => {
          setShown(true);
          stop();
          window.removeEventListener('resize', observe);
        },
        { amount: 0.5, margin: headingMargin(window.innerHeight) },
      );
    };
    observe();
    window.addEventListener('resize', observe);
    return () => {
      stop();
      window.removeEventListener('resize', observe);
    };
  }, []);
  const state = shown ? 'shown' : 'hidden';

  const words = title.split(/\s+/).filter(Boolean);

  return (
    <div className={cn('mx-auto max-w-2xl text-center', className)}>
      <Heading
        ref={titleRef}
        // The words are split for the animation; assistive technology reads
        // the title whole.
        aria-label={title}
        level="h2"
        variant="section-heading"
        margin="none"
        id={id}
        className={cn('text-text', headingClassName)}
      >
        <span aria-hidden className="block">
          {/* The spaces stay between the words, so the title still wraps. */}
          {words.map((word, index) => (
            <Fragment key={`${word}-${index}`}>
              {index > 0 ? ' ' : null}
              {/* The mask is a clip path rather than overflow, which would
                  move the word's baseline; it reaches past the box for
                  ascenders and descenders. */}
              <span className="inline-block [clip-path:inset(-0.3em_-0.2em_-0.15em_-0.2em)]">
                <motion.span
                  className="inline-block origin-bottom-left rtl:origin-bottom-right"
                  variants={wordVariants}
                  custom={index}
                  initial="hidden"
                  animate={state}
                >
                  {word}
                </motion.span>
              </span>
            </Fragment>
          ))}
        </span>
      </Heading>
      {children ? (
        <motion.div
          variants={bodyVariants}
          custom={words.length}
          initial="hidden"
          animate={state}
          className={cn(
            'text-text/80 tablet-landscape:text-lg mt-5 text-base',
            bodyClassName,
          )}
        >
          {children}
        </motion.div>
      ) : null}
    </div>
  );
}
