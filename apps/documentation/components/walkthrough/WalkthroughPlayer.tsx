'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Pause,
  Play,
  Repeat,
  RotateCcw,
} from 'lucide-react';
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
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import {
  getMarkdownLabelText,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';
import Heading from '@codaco/fresco-ui/typography/Heading';
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
        variant="link"
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
      variant="link"
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
      case 'finish':
        return (
          <Button ref={primaryAction} color="primary" onClick={onClose}>
            {t('close')}
          </Button>
        );
      case 'explain':
      case 'do':
      case 'checkpoint':
      default:
        return (
          <>
            {shown.type === 'do' && shown.skip && (
              <Button variant="outline" onClick={() => advance()}>
                {shown.skip}
              </Button>
            )}
            <Button
              ref={primaryAction}
              color="primary"
              icon={<ArrowRight aria-hidden className="size-4" />}
              iconPosition="right"
              onClick={() => advance()}
            >
              {shown.confirm ?? t('continue')}
            </Button>
          </>
        );
    }
  };

  const links =
    beat.type === 'finish'
      ? (beat.links ?? [])
      : beat.type === 'checkpoint' && beat.help
        ? [beat.help]
        : [];

  return (
    <div className="@container grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] @min-[56rem]:grid-cols-[20rem_1fr] @min-[56rem]:grid-rows-1">
      <ThemedRegion
        theme="interview"
        className="bg-surface text-text publish-colors flex min-h-0 min-w-0 flex-col"
      >
        <div className="grid gap-1 px-6 pt-6 pb-2 @min-[56rem]:pt-8">
          <Eyebrow>{t('label')}</Eyebrow>
          <BaseDialog.Title render={<Heading level="h2" margin="none" />}>
            {walkthrough.title}
          </BaseDialog.Title>
        </div>
        <nav aria-label={t('chapters')} className="min-h-0 flex-1">
          <ol className="flex h-full overflow-auto py-4 @min-[56rem]:flex-col">
            {walkthrough.chapters.map((c, i) => {
              const status = chapterStatus(beats, index, c.id);
              const isFirst = i === 0;
              const isLast = i === walkthrough.chapters.length - 1;
              return (
                <li key={c.id} className="shrink-0">
                  <button
                    type="button"
                    aria-current={status === 'current' ? 'step' : undefined}
                    onClick={() => goTo(firstBeatOf(beats, c.id))}
                    className={cx(
                      'focusable relative flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-start transition-colors duration-200',
                      status === 'current'
                        ? 'bg-primary text-primary-contrast'
                        : 'hover:bg-accent',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        'bg-neon-coral pointer-events-none absolute inset-s-8 w-1 -translate-x-1/2 @max-[56rem]:hidden rtl:translate-x-1/2',
                        isFirst
                          ? 'top-1/2 bottom-0'
                          : isLast
                            ? 'top-0 bottom-1/2'
                            : 'inset-y-0',
                      )}
                    />
                    <span className="bg-neon-coral relative grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white tabular-nums">
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
                    <span className="min-w-0 text-sm leading-tight font-bold @max-[56rem]:sr-only">
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
        </nav>
        <div className="border-text/10 shrink-0 border-t p-4">
          <Button
            variant="outline"
            size="sm"
            color="dynamic"
            icon={<RotateCcw aria-hidden className="size-4" />}
            onClick={() => {
              rememberFocus();
              onProgress(null);
            }}
            className="w-full"
          >
            {t('startOver')}
          </Button>
        </div>
      </ThemedRegion>

      <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 p-4 @min-[56rem]:p-6">
        <div className="flex items-center justify-end gap-2">
          <GuideLink target={guideTarget} onGuide={onGuide}>
            {t('readGuide')}
          </GuideLink>
          <BaseDialog.Close render={<CloseButton />} />
        </div>

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

        <p aria-live="polite" className="sr-only">
          {getMarkdownLabelText(text)}
        </p>
        <motion.div
          key={beat.id}
          className="flex flex-wrap items-end gap-x-8 gap-y-4"
          variants={CAPTION}
          initial={reduceMotion ? false : 'enter'}
          animate="center"
        >
          <motion.div
            variants={CAPTION_PART}
            className="grid min-w-[min(100%,20rem)] flex-1 gap-3"
          >
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
            {links.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {links.map((link) => (
                  <ExternalOrDocLink key={link.href} link={link} />
                ))}
              </div>
            )}
          </motion.div>
          <motion.div
            variants={CAPTION_PART}
            className="ms-auto flex flex-wrap items-center justify-end gap-3"
          >
            {index > 0 && (
              <Button
                variant="outline"
                icon={<ArrowLeft aria-hidden className="size-4" />}
                onClick={back}
              >
                {t('back')}
              </Button>
            )}
            <div
              ref={actions}
              role={beat.type === 'choose' ? 'group' : undefined}
              aria-labelledby={beat.type === 'choose' ? textId : undefined}
              className="flex flex-wrap items-center justify-end gap-3"
            >
              {renderActions(beat)}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
