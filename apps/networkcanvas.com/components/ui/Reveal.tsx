'use client';

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react';
import {
  Children,
  type ComponentProps,
  Fragment,
  isValidElement,
  type ReactNode,
  useRef,
} from 'react';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';

type RevealDirection = 'left' | 'right' | 'up' | 'zoom';

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: RevealDirection;
  distance?: number;
  duration?: number;
  easing?: [number, number, number, number];
  scrollLinked?: boolean;
  scrollStagger?: number;
} & Omit<
  ComponentProps<typeof motion.div>,
  'children' | 'initial' | 'transition' | 'viewport' | 'whileInView'
>;

type RevealContentProps = Omit<RevealProps, 'scrollLinked' | 'scrollStagger'>;

type ScrollLinkedRevealProps = RevealContentProps & {
  scrollStagger: number;
};

function RevealContent({ content }: { content: ReactNode }) {
  return Children.map(content, (child, index) => (
    <Fragment key={isValidElement(child) ? (child.key ?? index) : index}>
      {child}
    </Fragment>
  ));
}

function getEntryOffset(direction: RevealDirection, distance: number) {
  return {
    x: direction === 'left' ? -distance : direction === 'right' ? distance : 0,
    y: direction === 'up' || direction === 'zoom' ? distance : 0,
  };
}

function ScrollLinkedReveal({
  children,
  className,
  delay = 0,
  direction = 'up',
  distance = 24,
  duration: _duration,
  easing: _easing,
  scrollStagger,
  style,
  ...props
}: ScrollLinkedRevealProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  // This check stays, unlike the one `InViewReveal` used to carry. The
  // app-root `<MotionConfig reducedMotion="user">` can only neutralise
  // *animations* — it hands transform keys `type: false` inside
  // `animateTarget`, and zeroes layout-projection transitions. The scroll
  // transforms below are neither: they are `MotionValue`s bound straight to
  // `style`, so motion applies them verbatim however `reducedMotion` is set,
  // and a visitor who prefers reduced motion would still be scrubbed through a
  // full translate/scale by their own scrolling.
  //
  // `useHasHydrated()` is what keeps the preference out of the server markup:
  // it is `false` for the server render and the first client render alike, so
  // both agree on the plain `style` before the preference is ever consulted.
  const shouldReduceMotion = useReducedMotion();
  const hasHydrated = useHasHydrated();
  const motionEnabled = hasHydrated && shouldReduceMotion === false;
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ['start 92%', 'end 8%'],
  });
  const phaseShift = Math.min(0.14, delay * 0.18 * scrollStagger);
  const phases = [
    phaseShift,
    0.18 + phaseShift,
    0.78 - phaseShift,
    1 - phaseShift,
  ];
  const entryOffset = getEntryOffset(direction, distance);
  const opacity = useTransform(scrollYProgress, phases, [0, 1, 1, 0.12]);
  const x = useTransform(scrollYProgress, phases, [
    entryOffset.x,
    0,
    0,
    entryOffset.x * -0.65,
  ]);
  const y = useTransform(scrollYProgress, phases, [
    entryOffset.y,
    0,
    0,
    entryOffset.y * -0.65,
  ]);
  const scale = useTransform(
    scrollYProgress,
    phases,
    direction === 'zoom' ? [0.955, 1, 1, 0.975] : [1, 1, 1, 1],
  );

  return (
    <motion.div
      ref={targetRef}
      style={
        motionEnabled
          ? {
              ...style,
              opacity,
              scale,
              x,
              y,
            }
          : style
      }
      className={className}
      {...props}
    >
      <RevealContent content={children} />
    </motion.div>
  );
}

function InViewReveal({
  children,
  className,
  delay = 0,
  direction = 'up',
  distance = 24,
  duration = 0.5,
  easing,
  ...props
}: RevealContentProps) {
  const entryOffset = getEntryOffset(direction, distance);
  const initial = {
    opacity: 0,
    ...entryOffset,
    scale: direction === 'zoom' ? 0.955 : 1,
  };

  return (
    <motion.div
      // Nothing here consults the reduced-motion preference, and nothing may:
      // motion resolves `initial` into an inline style in the server markup,
      // and the server cannot know the preference (`useReducedMotion()` answers
      // `null` there and `true`/`false` on the client), so any prop that fed
      // off it would make this component a hydration mismatch for every visitor
      // who prefers reduced motion.
      //
      // The app-root `<MotionConfig reducedMotion="user">` honours the
      // preference instead, and does it where no markup is at stake: it gives
      // the transform keys in this animation (`x`/`y`/`scale`) `type: false`,
      // so they arrive at their target instantly, and leaves the opacity fade
      // — a simple animation, safe under the preference — to play.
      initial={initial}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -7% 0px' }}
      transition={{ duration, ease: easing ?? 'easeOut', delay }}
      className={className}
      {...props}
    >
      <RevealContent content={children} />
    </motion.div>
  );
}

export function Reveal({
  scrollLinked = false,
  scrollStagger = 1,
  ...props
}: RevealProps) {
  return scrollLinked ? (
    <ScrollLinkedReveal {...props} scrollStagger={scrollStagger} />
  ) : (
    <InViewReveal {...props} />
  );
}
