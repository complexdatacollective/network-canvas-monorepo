'use client';

import { BookOpen, Check, Pause, Play, Repeat, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import {
  getMarkdownLabelText,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { Link as LocaleLink } from '~/navigation';

import {
  chapterStatus,
  firstBeatOf,
  resolveIndex,
  textFor,
  visibleBeats,
} from './sequence';
import type { Beat, Link, Progress, Tint, Walkthrough } from './types';
import { isAnimated, POP, SETTLE } from './visuals/motion';
import WalkthroughVisual from './WalkthroughVisual';

const BEAT_TEXT_ELEMENTS = ['strong', 'em', 'a'];

// The /updates page sets each illustration on a pale band of one brand color.
const BANDS: Record<Tint, string> = {
  serpent: 'bg-sea-serpent/12',
  purple: 'bg-purple-pizazz/12',
  green: 'bg-sea-green/15',
  blue: 'bg-cerulean-blue/12',
  coral: 'bg-neon-coral/12',
  mustard: 'bg-mustard/15',
};

// Steps slide in from the side the reader is heading towards.
const SLIDE = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 48 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -48 }),
};

// The caption follows the picture: label, text, then the actions.
const CAPTION = {
  enter: {},
  center: { transition: { delayChildren: 0.15, staggerChildren: 0.08 } },
};
const CAPTION_PART = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0, transition: SETTLE },
};

type WalkthroughPlayerProps = {
  walkthrough: Walkthrough;
  progress: Progress;
  onProgress: (next: Progress | null) => void;
  // Closes the dialog and takes the reader to a heading in this article.
  onGuide: (anchor: string) => void;
  onClose: () => void;
};

function GuideLink({
  target,
  onGuide,
  children,
  className,
}: {
  target: string;
  onGuide: (anchor: string) => void;
  children: ReactNode;
  className?: string;
}) {
  if (target.startsWith('#')) {
    return (
      <Button
        variant="text"
        size="sm"
        icon={<BookOpen aria-hidden className="size-4" />}
        onClick={() => onGuide(target.slice(1))}
        className={className}
      >
        {children}
      </Button>
    );
  }
  return (
    <Button
      asChild
      variant="text"
      size="sm"
      icon={<BookOpen aria-hidden className="size-4" />}
      className={className}
    >
      <LocaleLink href={target}>{children}</LocaleLink>
    </Button>
  );
}

function ExternalOrDocLink({ link }: { link: Link }) {
  if (link.href.startsWith('http')) {
    return (
      <NativeLink href={link.href} target="_blank" rel="noreferrer">
        {link.label}
      </NativeLink>
    );
  }
  return (
    <NativeLink render={<LocaleLink href={link.href} />}>
      {link.label}
    </NativeLink>
  );
}

export default function WalkthroughPlayer({
  walkthrough,
  progress,
  onProgress,
  onGuide,
  onClose,
}: WalkthroughPlayerProps) {
  const t = useTranslations('Walkthrough');
  const reduceMotion = usePrefersReducedMotion();
  const textId = useId();
  const primaryAction = useRef<HTMLButtonElement>(null);
  const actions = useRef<HTMLDivElement>(null);

  const beats = useMemo(
    () => visibleBeats(walkthrough, progress.choices),
    [walkthrough, progress.choices],
  );
  const index = resolveIndex(walkthrough, beats, progress.beat);
  const current = beats[index];

  const [motionState, setMotionState] = useState({ index, direction: 1 });
  if (motionState.index !== index) {
    setMotionState({ index, direction: index > motionState.index ? 1 : -1 });
  }
  const { direction } = motionState;
  const [replays, setReplays] = useState(0);
  // Which showing of a capture the reader paused, so a new step or a replay
  // starts playing again.
  const [pausedShowing, setPausedShowing] = useState<string | null>(null);

  // Advancing replaces the buttons the reader just used. Keep keyboard focus
  // in the action row so the next step is one key press away.
  const focusWasInActions = useRef(false);
  useEffect(() => {
    if (!focusWasInActions.current) return;
    focusWasInActions.current = false;
    const target =
      primaryAction.current ??
      actions.current?.querySelector<HTMLElement>('button, a');
    target?.focus();
  });

  if (!current) return null;
  const { beat, chapter } = current;

  const rememberFocus = () => {
    focusWasInActions.current =
      actions.current?.contains(document.activeElement) ?? false;
  };

  const goTo = (beatIdToShow: string | null, choices = progress.choices) => {
    rememberFocus();
    onProgress({ beat: beatIdToShow, choices });
  };

  const advance = (choices = progress.choices) => {
    const next = visibleBeats(walkthrough, choices);
    const at = next.findIndex((placed) => placed.beat.id === beat.id);
    const following = next[at + 1];
    if (!following) {
      onClose();
      return;
    }
    goTo(following.beat.id, choices);
  };

  const back = () => {
    const previous = beats[index - 1];
    if (previous) goTo(previous.beat.id);
  };

  const choose = (choice: string, option: string) => {
    advance({ ...progress.choices, [choice]: option });
  };

  const chapterBeats = beats.filter((placed) => placed.chapter === chapter);
  const stepInChapter =
    chapterBeats.findIndex((placed) => placed.beat === beat) + 1;
  const guideTarget = beat.guide ?? chapter.guide;
  const text = textFor(beat.text, progress.choices);
  const showing = `${beat.id}-${replays}`;
  const paused = pausedShowing === showing;

  const renderActions = (shown: Beat) => {
    switch (shown.type) {
      case 'choose':
        return shown.options.map((option, i) => (
          <Button
            key={option.id}
            ref={i === 0 ? primaryAction : undefined}
            color="primary"
            variant={
              progress.choices[shown.choice] === option.id
                ? 'default'
                : 'outline'
            }
            aria-pressed={progress.choices[shown.choice] === option.id}
            onClick={() => choose(shown.choice, option.id)}
          >
            {option.label}
          </Button>
        ));
      case 'do':
        return (
          <>
            <Button
              ref={primaryAction}
              color="primary"
              onClick={() => advance()}
            >
              {shown.confirm}
            </Button>
            {shown.skip && (
              <Button variant="outline" onClick={() => advance()}>
                {shown.skip}
              </Button>
            )}
          </>
        );
      case 'checkpoint':
        return (
          <>
            <Button
              ref={primaryAction}
              color="primary"
              onClick={() => advance()}
            >
              {shown.confirm}
            </Button>
            {shown.help && <ExternalOrDocLink link={shown.help} />}
          </>
        );
      case 'finish':
        return (
          <>
            <Button ref={primaryAction} color="primary" onClick={onClose}>
              {t('close')}
            </Button>
            {shown.links?.map((link) => (
              <ExternalOrDocLink key={link.href} link={link} />
            ))}
          </>
        );
      case 'explain':
      default:
        return (
          <Button ref={primaryAction} color="primary" onClick={() => advance()}>
            {shown.confirm ?? t('continue')}
          </Button>
        );
    }
  };

  return (
    <div className="@container grid h-[calc(100dvh-14rem)] max-h-[50rem] min-h-[30rem] grid-rows-[auto_minmax(0,1fr)] gap-6 @min-[56rem]:grid-cols-[15rem_1fr] @min-[56rem]:grid-rows-1">
      <nav
        aria-label={t('chapters')}
        className="flex min-w-0 items-center gap-4 @min-[56rem]:flex-col @min-[56rem]:items-stretch"
      >
        <ol className="flex min-w-0 gap-1 overflow-x-auto @min-[56rem]:grid">
          {walkthrough.chapters.map((c, i) => {
            const status = chapterStatus(beats, index, c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={status === 'current' ? 'step' : undefined}
                  onClick={() => goTo(firstBeatOf(beats, c.id))}
                  className={cx(
                    'focusable flex w-full shrink-0 items-center gap-3 rounded px-3 py-2 text-start transition-colors',
                    status === 'current'
                      ? 'bg-primary text-primary-contrast'
                      : 'hover:bg-current/10',
                  )}
                >
                  <span
                    className={cx(
                      'grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold',
                      status === 'done' && 'bg-success text-success-contrast',
                      status === 'upcoming' && 'border-2 border-current/40',
                      status === 'current' &&
                        'bg-primary-contrast text-primary',
                    )}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {status === 'done' ? (
                        <motion.span
                          key="done"
                          initial={reduceMotion ? false : { scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={POP}
                        >
                          <Check aria-hidden className="size-4" />
                        </motion.span>
                      ) : (
                        <span key="number">{i + 1}</span>
                      )}
                    </AnimatePresence>
                  </span>
                  <span
                    className={cx(
                      'font-heading min-w-0 font-bold',
                      '@max-[56rem]:sr-only',
                    )}
                  >
                    {c.title}
                    {status === 'done' && (
                      <span className="sr-only"> ({t('chapterDone')})</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <Button
          variant="text"
          size="sm"
          icon={<RotateCcw aria-hidden className="size-4" />}
          onClick={() => {
            rememberFocus();
            onProgress(null);
          }}
          className="ms-auto shrink-0 @min-[56rem]:ms-0 @min-[56rem]:mt-auto @min-[56rem]:self-start"
        >
          {t('startOver')}
        </Button>
      </nav>

      <div className="grid min-h-0 min-w-0 grid-rows-[1fr_auto] gap-6">
        <div
          className={cx(
            'relative grid min-h-0 rounded p-6 transition-colors duration-500',
            BANDS[chapter.tint],
          )}
        >
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={showing}
              className="grid size-full min-h-0 place-items-center overflow-y-auto"
              custom={reduceMotion ? 0 : direction}
              variants={SLIDE}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ ...SETTLE, opacity: { duration: 0.15 } }}
            >
              <WalkthroughVisual
                visual={beat.visual}
                paused={paused}
                onEnded={() => setPausedShowing(showing)}
              />
            </motion.div>
          </AnimatePresence>
          {beat.visual.kind === 'capture' && !reduceMotion && (
            <Button
              variant="text"
              size="sm"
              icon={
                paused ? (
                  <Play aria-hidden className="size-4" />
                ) : (
                  <Pause aria-hidden className="size-4" />
                )
              }
              onClick={() => setPausedShowing(paused ? null : showing)}
              className="absolute inset-s-2 bottom-2"
            >
              {paused ? t('play') : t('pause')}
            </Button>
          )}
          {isAnimated(beat.visual) && !reduceMotion && (
            <Button
              variant="text"
              size="sm"
              icon={<Repeat aria-hidden className="size-4" />}
              onClick={() => setReplays((count) => count + 1)}
              className="absolute inset-e-2 bottom-2"
            >
              {t('replay')}
            </Button>
          )}
        </div>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Eyebrow>
              {t('stepOf', {
                chapter: chapter.title,
                current: stepInChapter,
                total: chapterBeats.length,
              })}
            </Eyebrow>
            <ProgressBar
              orientation="horizontal"
              percentProgress={(stepInChapter / chapterBeats.length) * 100}
              nudge={false}
              label={chapter.title}
              className="h-1.5 max-w-40"
            />
          </div>
          <p aria-live="polite" className="sr-only">
            {getMarkdownLabelText(text)}
          </p>
          <motion.div
            key={beat.id}
            className="grid gap-4"
            variants={CAPTION}
            initial={reduceMotion ? false : 'enter'}
            animate="center"
          >
            <motion.div variants={CAPTION_PART}>
              <Paragraph
                id={textId}
                margin="none"
                className="text-xl text-balance"
              >
                <RenderMarkdown
                  allowedElements={BEAT_TEXT_ELEMENTS}
                  unwrapDisallowed
                >
                  {text}
                </RenderMarkdown>
              </Paragraph>
            </motion.div>
            <motion.div
              variants={CAPTION_PART}
              className="flex flex-wrap items-center gap-x-4 gap-y-2"
            >
              <div
                ref={actions}
                role={beat.type === 'choose' ? 'group' : undefined}
                aria-labelledby={beat.type === 'choose' ? textId : undefined}
                className="flex flex-wrap items-center gap-3"
              >
                {renderActions(beat)}
              </div>
              <div className="ms-auto flex flex-wrap items-center gap-2">
                {index > 0 && (
                  <Button variant="text" size="sm" onClick={back}>
                    {t('back')}
                  </Button>
                )}
                <GuideLink target={guideTarget} onGuide={onGuide}>
                  {t('readGuide')}
                </GuideLink>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
