'use client';

import {
  animate,
  AnimatePresence,
  motion,
  MotionGlobalConfig,
  useMotionValue,
  useScroll,
  useTransform,
  type Variants,
} from 'motion/react';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { useShouldSkipAnimations } from '@codaco/fresco-ui/hooks/useSafeAnimate';
import Surface, {
  useSurfaceDepth,
  useSurfaceSeries,
} from '@codaco/fresco-ui/layout/Surface';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import { cx } from '@codaco/fresco-ui/utils/cva';

import type { Direction } from '../../types';

/**
 * Moving from one person to the next, in seconds from the moment the change
 * starts. The person and the answers move separately but stay joined: the
 * answers clear and the join lets go before the person leaves, and the next
 * answers appear once the next person has arrived and the join has taken
 * hold of them. The form is never joined to two people at once.
 */
const MOTION = {
  /** How far a person travels along the edge they are joined to, in px. */
  shift: 56,
  /** How far answers rise or settle as they go and come, in px. */
  lift: 12,
  answersOut: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  release: { delay: 0.06, duration: 0.22, ease: [0.65, 0, 0.35, 1] },
  scrollToTop: { duration: 0.52, ease: [0.65, 0, 0.35, 1] },
  /**
   * The card takes the next person's height while it is empty: from when
   * their answers are laid out, hidden, until just before they appear.
   */
  resize: { duration: 0.4, ease: [0.65, 0, 0.35, 1] },
  /** A person leaving or arriving is at this size at the far end. */
  personScale: 0.7,
  personOut: { delay: 0.2, duration: 0.22, ease: [0.55, 0, 1, 0.45] },
  personIn: {
    delay: 0.34,
    stiffness: 320,
    damping: 24,
    fade: { duration: 0.16, ease: [0, 0, 0.2, 1] },
  },
  grab: { delay: 0.56, duration: 0.26, ease: [0.34, 1.56, 0.64, 1] },
  /** Each question 40 ms after the one before, for at most five steps. */
  answersIn: {
    delay: 0.64,
    duration: 0.26,
    stagger: 0.04,
    maxSteps: 5,
    ease: [0, 0, 0.2, 1],
  },
  /**
   * The first person arrives on the same timeline, with nothing to clear
   * first: everything from the person arriving on is brought forward by this
   * much, so the person starts to move 100 ms after the form appears.
   */
  intro: { lead: 0.24 },
} as const;

/**
 * The join, in px. The disc behind the person reaches `ring` beyond them;
 * the person sits `beside` the card's start edge, or `above` its top edge.
 * Where the disc meets the card the outline curves in with fillets of
 * radius `fillet`. Letting go, the disc shrinks until it is `hidden` inside
 * the person's edge, so it never shows round a person who is not quite in
 * place; meanwhile the fillets stretch into a neck that thins and parts
 * once less than `letGo` of the ring still shows, so the neck never reaches
 * a disc that cannot be seen. The join reaches `tuck` under the card so no
 * seam shows at its edge.
 */
const JOIN = {
  ring: 14,
  hidden: 12,
  beside: 12,
  above: 8,
  fillet: 8,
  letGo: 0.15,
  tuck: 12,
} as const;

/**
 * With reduced motion nothing moves: the person and the answers fade out
 * and the next ones fade in, in place, and the join stays where it is.
 */
const REDUCED = { out: 0.15, in: 0.15 } as const;

type ChangeStyle = {
  /** The first person, arriving with the form. */
  first: boolean;
  /** 1 moving on, -1 going back. */
  forward: number;
  /** Along the edge the person is joined to, towards the Next side. */
  along: number;
  axis: 'x' | 'y';
  reduced: boolean;
};

/** When part of a person's arrival starts, in seconds. */
const arrival = (delay: number, first: boolean) =>
  first ? delay - MOTION.intro.lead : delay;

const offset = (axis: ChangeStyle['axis'], by: number) =>
  axis === 'x' ? { x: by } : { y: by };

const personVariants: Variants = {
  enter: ({ along, axis, reduced }: ChangeStyle) =>
    reduced
      ? { opacity: 0 }
      : {
          ...offset(axis, MOTION.shift * along),
          scale: MOTION.personScale,
          opacity: 0,
        },
  rest: ({ first, reduced }: ChangeStyle) =>
    reduced
      ? {
          opacity: 1,
          transition: {
            delay: first ? 0 : REDUCED.out,
            duration: REDUCED.in,
            ease: 'linear',
          },
        }
      : {
          x: 0,
          y: 0,
          scale: 1,
          opacity: 1,
          transition: {
            delay: arrival(MOTION.personIn.delay, first),
            type: 'spring',
            stiffness: MOTION.personIn.stiffness,
            damping: MOTION.personIn.damping,
            opacity: {
              delay: arrival(MOTION.personIn.delay, first),
              ...MOTION.personIn.fade,
            },
          },
        },
  leave: ({ along, axis, reduced }: ChangeStyle) =>
    reduced
      ? { opacity: 0, transition: { duration: REDUCED.out, ease: 'linear' } }
      : {
          ...offset(axis, -MOTION.shift * along),
          scale: MOTION.personScale,
          opacity: 0,
          transition: MOTION.personOut,
        },
};

const answersVariants: Variants = {
  rest: { opacity: 1, y: 0 },
  leave: ({ forward, reduced }: ChangeStyle) =>
    reduced
      ? { opacity: 0, transition: { duration: REDUCED.out, ease: 'linear' } }
      : {
          opacity: 0,
          y: -MOTION.lift * forward,
          transition: MOTION.answersOut,
        },
};

type Frame = {
  /** The stage is wider than it is tall: the person sits beside the form. */
  landscape: boolean;
  /** The form is taller than the stage, so it scrolls. */
  overflows: boolean;
  rtl: boolean;
  /** The person's width, in px. */
  size: number;
};

/**
 * Measures the scroll area, so the layout and the direction people move in
 * follow the same reading of the stage.
 */
function useFrame(
  scrollAreaRef: RefObject<HTMLElement | null>,
  bodyRef: RefObject<HTMLElement | null>,
  pinRef: RefObject<HTMLElement | null>,
) {
  const [frame, setFrame] = useState<Frame>({
    landscape: true,
    overflows: false,
    rtl: false,
    size: 0,
  });
  useLayoutEffect(() => {
    const viewport = scrollAreaRef.current;
    const body = bodyRef.current;
    const pin = pinRef.current;
    if (!viewport || !body || !pin) return undefined;
    const measure = () => {
      const next = {
        landscape: viewport.clientWidth > viewport.clientHeight,
        overflows: viewport.scrollHeight > viewport.clientHeight + 1,
        rtl: getComputedStyle(viewport).direction === 'rtl',
        size: pin.offsetWidth,
      };
      setFrame((known) =>
        known.landscape === next.landscape &&
        known.overflows === next.overflows &&
        known.rtl === next.rtl &&
        known.size === next.size
          ? known
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(body);
    observer.observe(pin);
    return () => observer.disconnect();
  }, [scrollAreaRef, bodyRef, pinRef]);
  return frame;
}

type JoinShape = {
  /** The person's radius. */
  person: number;
  /** The disc's radius when joined. */
  radius: number;
  /** From the person's centre to the card's edge. */
  reach: number;
  /** Half the neck's width where it is narrowest, when joined. */
  neck: number;
};

const joinShape = (size: number, landscape: boolean): JoinShape => {
  const radius = size / 2 + JOIN.ring;
  const reach = size / 2 + (landscape ? JOIN.beside : JOIN.above);
  const f = JOIN.fillet;
  return {
    person: size / 2,
    radius,
    reach,
    neck: Math.sqrt(Math.max(0, (radius + f) ** 2 - (reach - f) ** 2)) - f,
  };
};

const NO_NECK = 'M0 0';

/**
 * The join takes the card's colour, which comes from how deeply the card is
 * nested among Surfaces, by the same levels Surface uses.
 */
const JOIN_FILL = {
  default: [
    'fill-surface',
    'fill-surface-1',
    'fill-surface-2',
    'fill-surface-3',
    'fill-surface-4',
  ],
  accent: [
    'fill-surface-accent',
    'fill-surface-accent-1',
    'fill-surface-accent-2',
    'fill-surface-accent-3',
    'fill-surface-accent-4',
  ],
} as const;

/**
 * The neck between the disc and the card's edge, centred on the person with
 * the card's edge across +x at `reach`. Each side is a fillet: an arc
 * touching both the disc and the edge, whose radius is found from the
 * neck's width as the join lets go.
 */
/** The disc's radius, from hidden behind the person to joined. */
const discRadius = (held: number, { person, radius }: JoinShape) =>
  held <= 0 ? 0 : person - JOIN.hidden + (radius - person + JOIN.hidden) * held;

function neckPath(held: number, shape: JoinShape) {
  const { person, reach, neck } = shape;
  const r = discRadius(held, shape);
  // How much of the ring shows beyond the person.
  const showing = (r - person) / JOIN.ring;
  const w =
    neck * Math.min(1, Math.max(0, (showing - JOIN.letGo) / (1 - JOIN.letGo)));
  if (w <= 0) return NO_NECK;
  // A fillet of radius f centred at (reach - f, ±(w + f)) touches the edge
  // and, at distance r + f from the centre, the disc.
  const b = reach + r - w;
  const c = reach ** 2 + w ** 2 - r ** 2;
  if (b ** 2 < c) return NO_NECK;
  const f = b - Math.sqrt(b ** 2 - c);
  if (f <= 0) return NO_NECK;
  const across = w + f;
  const touchX = ((reach - f) * r) / (r + f);
  const touchY = (across * r) / (r + f);
  const edge = reach + JOIN.tuck;
  return [
    `M${edge} ${-across}`,
    `L${reach} ${-across}`,
    `A${f} ${f} 0 0 1 ${touchX} ${-touchY}`,
    `L${touchX} ${touchY}`,
    `A${f} ${f} 0 0 1 ${reach} ${across}`,
    `L${edge} ${across}Z`,
  ].join('');
}

type AnswersProps = {
  children: ReactNode;
  live: boolean;
  change: ChangeStyle;
  skip: boolean;
};

/**
 * One person's answers. They leave together; coming in, each question
 * follows the one before it.
 */
function Answers({ children, live, change, skip }: AnswersProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || skip) return undefined;
    const fields = [...root.querySelectorAll<HTMLElement>('[data-field-name]')];
    const questions = fields.filter(
      (field) =>
        !fields.some((other) => other !== field && other.contains(field)),
    );
    const targets = questions.length > 0 ? questions : [root];
    // Hidden before the first paint; the answers before them have only just
    // left.
    for (const target of targets) target.style.opacity = '0';
    if (change.reduced) {
      const controls = animate(
        targets,
        { opacity: [0, 1] },
        { duration: REDUCED.in, ease: 'linear' },
      );
      return () => controls.stop();
    }
    const { answersIn, answersOut, lift } = MOTION;
    // Counted from when these answers appear: with the form for the first
    // person, otherwise once the answers before have left.
    const start = change.first
      ? arrival(answersIn.delay, true)
      : answersIn.delay - answersOut.duration;
    const controls = animate(
      targets,
      { opacity: [0, 1], y: [lift * change.forward, 0] },
      {
        duration: answersIn.duration,
        ease: answersIn.ease,
        delay: (index) =>
          start + Math.min(index, answersIn.maxSteps) * answersIn.stagger,
      },
    );
    return () => controls.stop();
    // Once, as this person's answers arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      ref={ref}
      custom={change}
      variants={answersVariants}
      initial={false}
      animate="rest"
      exit="leave"
      inert={!live}
    >
      {children}
    </motion.div>
  );
}

type JoinedSlidesProps = {
  /** The person shown. */
  index: number;
  /** Which way the last change went; null until there has been one. */
  direction: Direction | null;
  renderPerson: (index: number) => ReactNode;
  /**
   * One person's answers, laid out without a frame of their own. `live` is
   * false until the answers may be answered.
   */
  renderAnswers: (
    index: number,
    scrollAreaRef: RefObject<HTMLElement | null>,
    live: boolean,
  ) => ReactNode;
  /** The person shown, first or changed to, can now be answered. */
  onSettled: () => void;
};

/**
 * The per-person form with the person joined to it. The card stays where it
 * is as the participant moves between people; only the person, the join and
 * the answers change.
 *
 * While the stage is wider than it is tall the person sits beside the form,
 * on the reading-start side, in the middle of the form's height (of the
 * stage's, while the form is too tall to fit); otherwise above it, in the
 * middle of its width. The person stays in view as the form scrolls, and
 * moves along the edge they are joined to, in the direction of the Next
 * button.
 */
export default function JoinedSlides({
  index,
  direction,
  renderPerson,
  renderAnswers,
  onSettled,
}: JoinedSlidesProps) {
  const scrollAreaRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  // The card below is rendered at this depth and series.
  const surfaceDepth = useSurfaceDepth();
  const surfaceSeries = useSurfaceSeries();
  const joinFill =
    JOIN_FILL[surfaceSeries][Math.min(Math.max(surfaceDepth, 0), 4)];
  const bodyRef = useRef<HTMLDivElement>(null);
  const { landscape, overflows, rtl, size } = useFrame(
    scrollAreaRef,
    bodyRef,
    pinRef,
  );
  // Beside a form that scrolls, the person holds the middle of the stage
  // (within the form's height) rather than of the form.
  const holdMiddle = landscape && overflows;
  const middle = `calc(50% - ${size / 2}px)`;

  // Skipped outright by automated hosts; reduced to fades for people who ask
  // for less motion.
  const skip = Boolean(MotionGlobalConfig.skipAnimations);
  const reduced = useShouldSkipAnimations() && !skip;

  const forward = direction === 'backwards' ? -1 : 1;
  const change: ChangeStyle = {
    first: direction === null,
    forward,
    // Above the form, the Next side is the reading-end side.
    along: forward * (!landscape && rtl ? -1 : 1),
    axis: landscape ? 'y' : 'x',
    reduced,
  };

  // The answers for a person can be given once they start to appear, the
  // first person's included.
  const [liveIndex, setLiveIndex] = useState<number | null>(
    skip || reduced ? index : null,
  );
  const live = liveIndex === index;
  const settled = useRef(onSettled);
  useLayoutEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  // 1 while joined to a person, 0 between people. The first person is
  // joined as they arrive.
  const join = useMotionValue(skip || reduced ? 1 : 0);
  const shape = useMotionValue(joinShape(size, landscape));
  useLayoutEffect(() => {
    shape.set(joinShape(size, landscape));
  }, [shape, size, landscape]);
  const disc = useTransform(() => discRadius(join.get(), shape.get()));
  const neck = useTransform(() => neckPath(join.get(), shape.get()));

  useEffect(() => {
    if (skip || reduced) {
      settled.current();
      return undefined;
    }
    const { grab, answersIn } = MOTION;
    const first = index;
    join.set(0);
    const controls = animate(join, 1, {
      delay: arrival(grab.delay, true),
      duration: grab.duration,
      ease: grab.ease,
    });
    const timer = window.setTimeout(
      () => {
        setLiveIndex((known) => known ?? first);
        settled.current();
      },
      arrival(answersIn.delay, true) * 1000,
    );
    return () => {
      controls.stop();
      window.clearTimeout(timer);
      join.set(1);
    };
    // Once, as the form appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { scrollY } = useScroll({ container: scrollAreaRef });
  // Above the form the person shrinks as the form scrolls under them, and
  // the join, which would cover the questions, fades.
  const shrink = useTransform(scrollY, [0, 150], [1, 0.75]);
  const joinFade = useTransform(scrollY, [0, 12], [1, 0]);

  // The card follows its answers' height, except while moving between people:
  // then it holds the height it had and eases to the next person's, since
  // their questions can be worded for them and so run longer or shorter.
  const answersRef = useRef<HTMLDivElement>(null);
  const cardHeight = useMotionValue<number | 'auto'>('auto');
  const cardOverflow = useTransform(() =>
    cardHeight.get() === 'auto' ? 'visible' : 'clip',
  );

  const shown = useRef(index);
  useEffect(() => {
    if (shown.current === index) return undefined;
    shown.current = index;

    let changing = true;
    let resizing: (() => void) | undefined;
    let observer: ResizeObserver | undefined;
    // The next person can be answered once the change is over and the card
    // has finished resizing, when it goes back to following their answers.
    // Until then the card may be shorter than the answers, so the form is
    // not yet laid out as the participant will see it.
    let finished = false;
    const finishWhenStill = () => {
      if (finished || changing || resizing) return;
      finished = true;
      observer?.disconnect();
      cardHeight.set('auto');
      setLiveIndex(index);
      settled.current();
    };
    const answers = answersRef.current;
    if (answers && !skip && !reduced) {
      cardHeight.set(answers.offsetHeight);
      observer = new ResizeObserver(() => {
        const to = answers.offsetHeight;
        if (to === cardHeight.get()) return;
        resizing?.();
        resizing = animate(cardHeight, to, {
          ...MOTION.resize,
          onComplete: () => {
            resizing = undefined;
            finishWhenStill();
          },
        }).stop;
      });
      observer.observe(answers);
    }

    const finish = () => {
      changing = false;
      finishWhenStill();
    };
    const viewport = scrollAreaRef.current;
    if (skip) {
      if (viewport) viewport.scrollTop = 0;
      const frame = requestAnimationFrame(finish);
      return () => cancelAnimationFrame(frame);
    }

    const timers: number[] = [];
    const stops: (() => void)[] = [];
    if (reduced) {
      // Back to the top while nothing shows.
      timers.push(
        window.setTimeout(() => {
          if (viewport) viewport.scrollTop = 0;
        }, REDUCED.out * 1000),
      );
      timers.push(window.setTimeout(finish, REDUCED.out * 1000));
    } else {
      const { release, grab, scrollToTop, answersIn } = MOTION;
      const end = grab.delay + grab.duration;
      const at = (seconds: number) => seconds / end;
      stops.push(
        animate(join, [1, 1, 0, 0, 1], {
          duration: end,
          times: [
            0,
            at(release.delay),
            at(release.delay + release.duration),
            at(grab.delay),
            1,
          ],
          ease: ['linear', release.ease, 'linear', grab.ease],
        }).stop,
      );
      if (viewport && viewport.scrollTop > 0) {
        stops.push(
          animate(viewport.scrollTop, 0, {
            ...scrollToTop,
            onUpdate: (top) => {
              viewport.scrollTop = top;
            },
          }).stop,
        );
      }
      timers.push(window.setTimeout(finish, answersIn.delay * 1000));
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      for (const stop of stops) stop();
      observer?.disconnect();
      resizing?.();
      join.set(1);
      cardHeight.set('auto');
    };
  }, [index, skip, reduced, join, cardHeight]);

  // The join is drawn towards +x, then turned to face the card.
  const facing = landscape ? (rtl ? 'scale(-1 1)' : '') : 'rotate(90)';

  return (
    <ScrollArea
      ref={scrollAreaRef}
      className="size-full"
      viewportClassName="flex flex-col items-center size-full p-4"
    >
      <div
        ref={bodyRef}
        className={cx(
          'my-auto w-full',
          // Beside the form, the outer columns share the leftover width, so
          // the form stays centred with the person against its start edge.
          // When the person no longer fits in its share, the form moves along.
          landscape
            ? 'grid grid-cols-[1fr_minmax(auto,42rem)_1fr] gap-x-3'
            : 'flex flex-col items-center gap-2',
        )}
      >
        {/* Above the form, this column sticks to the top of the scroll area.
            It is the form's previous sibling, where QuestionFlow looks for a
            stuck header that a question must not be brought in under. Beside
            the form it runs the form's height and the person sticks within
            it, so it is not taken for a header above the questions. */}
        <div
          className={cx(
            'pointer-events-none',
            landscape
              ? 'flex flex-col justify-center self-stretch justify-self-end py-7'
              : 'tablet-portrait:min-w-lg sticky top-0 z-10 flex w-full max-w-2xl justify-center',
          )}
        >
          <motion.div
            ref={pinRef}
            data-slide-header
            className={cx(
              // Above the card, so the join covers the card's shadow where
              // they meet.
              'tablet-portrait:size-32 relative z-10 size-28 shrink-0 origin-top',
              holdMiddle && 'sticky',
            )}
            style={{
              scale: landscape ? 1 : shrink,
              top: holdMiddle ? middle : undefined,
              bottom: holdMiddle ? middle : undefined,
            }}
          >
            <motion.svg
              aria-hidden
              className={cx(
                'absolute inset-0 size-full overflow-visible',
                joinFill,
              )}
              style={{ opacity: landscape ? 1 : joinFade }}
            >
              <g transform={`translate(${size / 2} ${size / 2}) ${facing}`}>
                <motion.circle r={disc} />
                <motion.path d={neck} />
              </g>
            </motion.svg>
            <AnimatePresence custom={change}>
              <motion.div
                key={index}
                // The column lets presses through to the form; the person
                // takes them, to reveal a name too long to show in full.
                className="pointer-events-auto absolute inset-0 flex items-center justify-center"
                custom={change}
                variants={personVariants}
                initial="enter"
                animate="rest"
                exit="leave"
              >
                {renderPerson(index)}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
        <Surface
          noContainer
          className="tablet-portrait:min-w-lg w-full max-w-2xl shrink-0"
          spacing="lg"
          shadow="lg"
        >
          <motion.div style={{ height: cardHeight, overflow: cardOverflow }}>
            <div ref={answersRef}>
              <AnimatePresence mode="wait" initial={false} custom={change}>
                <Answers key={index} live={live} change={change} skip={skip}>
                  {renderAnswers(index, scrollAreaRef, live)}
                </Answers>
              </AnimatePresence>
            </div>
          </motion.div>
        </Surface>
      </div>
    </ScrollArea>
  );
}
