'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
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

import { Button, IconButton } from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
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
const COMMUNITY_URL = 'https://community.networkcanvas.com';

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

function ChapterNode({
  number,
  done,
  className,
}: {
  number: number;
  done: boolean;
  className?: string;
}) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <span
      className={cx(
        'bg-neon-coral relative grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white tabular-nums',
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {done ? (
          <motion.span
            key="done"
            initial={reduceMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={POP}
          >
            <Check aria-hidden className="size-4" />
          </motion.span>
        ) : (
          <span key="number">{number}</span>
        )}
      </AnimatePresence>
    </span>
  );
}

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

function HelpButton() {
  const t = useTranslations('Walkthrough');
  return (
    <Popover>
      <PopoverTrigger
        render={
          <IconButton
            variant="text"
            color="dynamic"
            icon={<CircleHelp />}
            aria-label={t('help')}
            title={t('help')}
          />
        }
      />
      <PopoverContent align="end" className="grid max-w-80 gap-3">
        <Heading level="h3" margin="none" className="text-lg">
          {t('helpTitle')}
        </Heading>
        <Paragraph margin="none" className="text-sm">
          {t('helpBody')}
        </Paragraph>
        <NativeLink href={COMMUNITY_URL} target="_blank" rel="noreferrer">
          {t('helpLink')}
        </NativeLink>
      </PopoverContent>
    </Popover>
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
  const choiceGroup = useRef<HTMLDivElement>(null);

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
      actions.current?.querySelector<HTMLElement>('button, a') ??
      choiceGroup.current?.querySelector<HTMLElement>('button');
    target?.focus();
  });

  if (!current) return null;
  const { beat, chapter } = current;

  const rememberFocus = () => {
    focusWasInActions.current = [actions, choiceGroup].some(
      (region) => region.current?.contains(document.activeElement) ?? false,
    );
  };

  const chapterIndex = walkthrough.chapters.findIndex(
    (c) => c.id === chapter.id,
  );

  const startOver = () => {
    rememberFocus();
    onProgress(null);
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
        return null;
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
              <Button onClick={() => advance()}>{shown.skip}</Button>
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
    <div className="@container grid min-h-0 flex-1 @min-[56rem]:grid-cols-[20rem_1fr]">
      <ThemedRegion
        theme="interview"
        className="bg-surface text-text publish-colors hidden min-h-0 min-w-0 flex-col @min-[56rem]:flex"
      >
        <div className="grid gap-1 px-6 pt-8 pb-2">
          <Eyebrow>{t('label')}</Eyebrow>
          <BaseDialog.Title render={<Heading level="h2" margin="none" />}>
            {walkthrough.title}
          </BaseDialog.Title>
        </div>
        <nav aria-label={t('chapters')} className="min-h-0 flex-1">
          <ol className="flex h-full flex-col overflow-auto py-4">
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
                        'bg-neon-coral pointer-events-none absolute inset-s-8 w-1 -translate-x-1/2 rtl:translate-x-1/2',
                        isFirst
                          ? 'top-1/2 bottom-0'
                          : isLast
                            ? 'top-0 bottom-1/2'
                            : 'inset-y-0',
                      )}
                    />
                    <ChapterNode number={i + 1} done={status === 'done'} />
                    <span className="min-w-0 text-sm leading-tight font-bold">
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
            size="sm"
            color="dynamic"
            icon={<RotateCcw aria-hidden className="size-4" />}
            onClick={startOver}
            className="w-full"
          >
            {t('startOver')}
          </Button>
        </div>
      </ThemedRegion>

      <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 p-4 @min-[56rem]:p-6">
        <div className="flex items-center justify-end gap-2 @max-[56rem]:hidden">
          <GuideLink target={guideTarget} onGuide={onGuide}>
            {t('readGuide')}
          </GuideLink>
          <HelpButton />
          <BaseDialog.Close render={<CloseButton />} />
        </div>
        <div className="grid gap-3 @min-[56rem]:hidden">
          <div className="flex items-center gap-3">
            <ThemedRegion
              theme="interview"
              className="min-w-0 flex-1 rounded-full"
            >
              <DropdownMenu>
                <DropdownMenuTrigger className="bg-surface text-text publish-colors focusable flex w-full cursor-pointer items-center gap-3 rounded-full p-2 pe-5 text-start">
                  <ChapterNode
                    number={chapterIndex + 1}
                    done={false}
                    className="size-10 text-sm"
                  />
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="truncate font-bold">{chapter.title}</span>
                    <Eyebrow render={<span />}>
                      {t('chapterOf', {
                        current: chapterIndex + 1,
                        total: walkthrough.chapters.length,
                      })}
                    </Eyebrow>
                  </span>
                  <ChevronDown aria-hidden className="size-5 shrink-0" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {walkthrough.chapters.map((c, i) => {
                    const status = chapterStatus(beats, index, c.id);
                    return (
                      <DropdownMenuItem
                        key={c.id}
                        icon={
                          <ChapterNode
                            number={i + 1}
                            done={status === 'done'}
                          />
                        }
                        aria-current={status === 'current' ? 'step' : undefined}
                        onClick={() => goTo(firstBeatOf(beats, c.id))}
                      >
                        {c.title}
                        {status === 'done' && (
                          <span className="sr-only"> ({t('chapterDone')})</span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    icon={<RotateCcw aria-hidden className="size-4" />}
                    onClick={startOver}
                  >
                    {t('startOver')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </ThemedRegion>
            <HelpButton />
            <BaseDialog.Close render={<CloseButton />} />
          </div>
          <div aria-hidden className="flex gap-1.5">
            {walkthrough.chapters.map((c, i) => (
              <span
                key={c.id}
                className={cx(
                  'h-1.5 flex-1 rounded-full',
                  i <= chapterIndex ? 'bg-primary' : 'bg-current/10',
                )}
              />
            ))}
          </div>
        </div>

        <div
          className={cx(
            'relative grid min-h-0 rounded p-6 transition-colors duration-500',
            BANDS[chapter.tint],
            beat.type === 'choose' &&
              'grid-rows-[minmax(0,1fr)_auto] gap-6 pb-14',
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
          {beat.type === 'choose' && (
            <motion.div
              key={beat.id}
              ref={choiceGroup}
              role="group"
              aria-labelledby={textId}
              className="mx-auto grid w-full max-w-4xl grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4"
              variants={CAPTION_PART}
              initial={reduceMotion ? false : 'enter'}
              animate="center"
            >
              {beat.options.map((option, i) => {
                const chosen = progress.choices[beat.choice] === option.id;
                return (
                  <Button
                    key={option.id}
                    ref={i === 0 ? primaryAction : undefined}
                    size="xl"
                    color="primary"
                    icon={
                      chosen ? (
                        <Check aria-hidden className="size-5" />
                      ) : undefined
                    }
                    aria-pressed={chosen}
                    onClick={() => choose(beat.choice, option.id)}
                    className="elevation-medium w-full"
                  >
                    {option.label}
                  </Button>
                );
              })}
            </motion.div>
          )}
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
            <BaseDialog.Description
              id={textId}
              render={
                <Paragraph margin="none" className="text-xl text-balance" />
              }
            >
              <RenderMarkdown
                allowedElements={BEAT_TEXT_ELEMENTS}
                unwrapDisallowed
              >
                {text}
              </RenderMarkdown>
            </BaseDialog.Description>
            <div
              className={cx(
                'flex flex-wrap gap-x-4 gap-y-2',
                links.length === 0 && '@min-[56rem]:hidden',
              )}
            >
              {links.map((link) => (
                <ExternalOrDocLink key={link.href} link={link} />
              ))}
              <GuideLink
                target={guideTarget}
                onGuide={onGuide}
                className="@min-[56rem]:hidden"
              >
                {t('readGuide')}
              </GuideLink>
            </div>
          </motion.div>
          <motion.div
            variants={CAPTION_PART}
            ref={actions}
            className="ms-auto flex flex-wrap items-center justify-end gap-3"
          >
            {index > 0 && (
              <Button
                icon={<ArrowLeft aria-hidden className="size-4" />}
                onClick={back}
              >
                {t('back')}
              </Button>
            )}
            <div className="flex flex-wrap items-center justify-end gap-3">
              {renderActions(beat)}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
