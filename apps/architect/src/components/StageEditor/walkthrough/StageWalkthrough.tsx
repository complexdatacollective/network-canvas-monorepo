import { Check, Circle } from 'lucide-react';
import { motion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { Button } from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { stageWalkthrough } from '@codaco/protocol-builder/interfaces/walkthroughs/stageWalkthroughs';
import type {
  StageWalkthroughChoice,
  StageWalkthroughCondition,
  StageWalkthroughStep,
} from '@codaco/protocol-builder/interfaces/walkthroughs/walkthroughTypes';
import type {
  StageSection,
  StageSectionsStore,
} from '@codaco/protocol-builder/stage-editor-contract';
import { useStageEdit } from '@codaco/protocol-builder/stageEdit';
import type { Stage } from '@codaco/protocol-validation';

import { useStageDraft } from '../stageDraftBeacon';
import StepVisual from './StepVisual';
import {
  chooseInWalkthrough,
  closeWalkthrough,
  goToWalkthroughStep,
  useWalkthroughState,
} from './walkthroughStore';

const messages = defineMessages({
  label: {
    id: 'architect.stageEditor.walkthrough.label',
    defaultMessage: 'Walkthrough',
    description:
      'Accessible name of the panel that guides a researcher through the settings of the stage they are editing.',
  },
  progress: {
    id: 'architect.stageEditor.walkthrough.progress',
    defaultMessage: 'Step {index, number} of {total, number}',
    description:
      'Where the researcher is in the stage walkthrough, shown above the step title. index is one-based.',
  },
  optional: {
    id: 'architect.stageEditor.walkthrough.optional',
    defaultMessage: 'Optional',
    description:
      'Badge on a walkthrough step whose setting the researcher can leave alone.',
  },
  done: {
    id: 'architect.stageEditor.walkthrough.done',
    defaultMessage: 'Done',
    description:
      'Shown on a walkthrough step once the stage has the setting the step asks for.',
  },
  notDone: {
    id: 'architect.stageEditor.walkthrough.notDone',
    defaultMessage: 'Not set yet',
    description:
      'Shown on a walkthrough step while the stage does not yet have the setting the step asks for.',
  },
  summary: {
    id: 'architect.stageEditor.walkthrough.summary',
    defaultMessage: 'What the stage has so far',
    description:
      'Accessible name of the list, on the last walkthrough step, of the settings the walkthrough asked for and whether each is set.',
  },
  back: {
    id: 'architect.stageEditor.walkthrough.back',
    defaultMessage: 'Back',
    description: 'Button that returns to the previous walkthrough step.',
  },
  next: {
    id: 'architect.stageEditor.walkthrough.next',
    defaultMessage: 'Next',
    description: 'Button that moves to the next walkthrough step.',
  },
  finish: {
    id: 'architect.stageEditor.walkthrough.finish',
    defaultMessage: 'Finish',
    description: 'Button on the last walkthrough step that closes it.',
  },
});

/**
 * A guide that walks the researcher through each setting of the stage they
 * are editing, pointing at the real section or field as it goes. It takes the
 * place of the section list beside the form, which it already navigates.
 *
 * Non-modal on purpose: the point is to fill the settings in while reading
 * about them, so the form stays operable and the panel only holds focus when
 * it opens.
 */
export default function StageWalkthrough({
  sections,
  host,
}: Readonly<{
  sections: StageSectionsStore;
  /** The route's sidebar column, which the panel takes over while open. */
  host: HTMLElement | null;
}>) {
  const { identity } = useStageEdit();
  const { open } = useWalkthroughState();
  const steps =
    identity === undefined ? undefined : stageWalkthrough(identity.type);

  // The walkthrough belongs to the stage on screen; leaving it ends it.
  useEffect(() => () => closeWalkthrough({ restoreFocus: false }), []);

  if (!open || steps === undefined) return null;
  return createPortal(
    <WalkthroughPanel
      steps={steps}
      sections={sections}
      inSidebar={host !== null}
    />,
    host ?? document.body,
  );
}

type VisibleStep = Readonly<{
  step: StageWalkthroughStep;
  sectionId: string | undefined;
}>;

/**
 * The steps for the sections this stage is showing, each with the section it
 * points at. Steps for sections the stage is not showing are left out, so the
 * count the researcher reads is the count they will step through.
 *
 * Matched in order, because two sections can share a title — a composer has
 * "Editable attributes" for its nodes and again for its connections — and
 * the steps follow the editor's order: each step's section is the first with
 * its title at or after the previous step's.
 */
function visibleSteps(
  steps: readonly StageWalkthroughStep[],
  entries: readonly StageSection[],
  choices: Readonly<Record<string, string>>,
  format: (title: MessageDescriptor) => string,
): VisibleStep[] {
  const visible: VisibleStep[] = [];
  let cursor = 0;
  for (const step of steps) {
    if (!meets(step.when, choices)) continue;
    if (step.target === undefined) {
      visible.push({ step, sectionId: undefined });
      continue;
    }
    const title = format(step.target.section);
    const found = entries.findIndex(
      (entry, position) => position >= cursor && entry.title === title,
    );
    if (found === -1) continue;
    cursor = found;
    visible.push({ step, sectionId: entries[found]?.id });
  }
  return visible;
}

/**
 * Whether a step's conditions hold. A question left unanswered hides nothing:
 * skipping it shows every step that depended on it.
 */
function meets(
  when: StageWalkthroughCondition | undefined,
  choices: Readonly<Record<string, string>>,
) {
  if (when === undefined) return true;
  return Object.entries(when).every(
    ([choice, option]) =>
      choices[choice] === undefined || choices[choice] === option,
  );
}

function isDone(step: StageWalkthroughStep, stage: Stage | undefined) {
  return stage !== undefined && step.done?.(stage) === true;
}

/**
 * In the sidebar it stays put beside the form while the form scrolls, as the
 * section list does. Below the two-column breakpoint the sidebar is a row
 * above the form, so there it floats over the corner of the page instead.
 */
const SIDEBAR_LAYOUT =
  '@min-[60rem]:sticky @min-[60rem]:top-(--architect-nav-height) @min-[60rem]:max-h-[calc(100dvh-var(--architect-nav-height))] @max-[60rem]:fixed @max-[60rem]:end-6 @max-[60rem]:bottom-24 @max-[60rem]:z-50 @max-[60rem]:max-h-[calc(100dvh-8rem)] @max-[60rem]:w-[min(26rem,calc(100vw-3rem))] @max-[60rem]:border-2 @max-[60rem]:bg-surface-popover @max-[60rem]:text-surface-popover-contrast @max-[60rem]:shadow-xl';

const FLOATING_LAYOUT =
  'fixed end-6 bottom-24 z-50 max-h-[calc(100dvh-8rem)] w-[min(26rem,calc(100vw-3rem))]';

function WalkthroughPanel({
  steps,
  sections,
  inSidebar,
}: Readonly<{
  steps: readonly StageWalkthroughStep[];
  sections: StageSectionsStore;
  inSidebar: boolean;
}>) {
  const intl = useAppIntl();
  const headingId = useId();
  const statusId = useId();
  const nextRef = useRef<HTMLButtonElement>(null);
  const { stepIndex, choices } = useWalkthroughState();
  const stage = useStageDraft((beacon) => beacon.stage);
  const entries = useSyncExternalStore(
    sections.subscribe,
    sections.getSnapshot,
    sections.getServerSnapshot,
  );

  const visible = useMemo(
    () =>
      visibleSteps(steps, entries, choices, (title) =>
        intl.formatMessage(title),
      ),
    [choices, entries, intl, steps],
  );

  const index = Math.min(stepIndex, visible.length - 1);
  const current = visible[index];
  const isFirst = index === 0;
  const isLast = index === visible.length - 1;

  const target = useStepTarget(current?.sectionId, current?.step.target?.field);
  const reducedMotion = usePrefersReducedMotion() === true;

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    target?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [reducedMotion, target]);

  if (current === undefined) return null;
  const { step } = current;
  // A step the stage needs holds the researcher until it is done. Optional
  // steps, and questions, can always be passed.
  const blocked =
    step.done !== undefined && step.optional !== true && !isDone(step, stage);

  return (
    <>
      {target !== null && (
        <Spotlight target={target} reducedMotion={reducedMotion} />
      )}
      <Surface
        as="section"
        aria-label={intl.formatMessage(messages.label)}
        floating={!inSidebar}
        noContainer={inSidebar}
        shadow={inSidebar ? 'sm' : 'lg'}
        spacing="sm"
        onKeyDown={closeOnEscape}
        className={cx(
          'flex min-w-0 flex-col gap-4 overflow-y-auto',
          inSidebar ? SIDEBAR_LAYOUT : FLOATING_LAYOUT,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>
            {intl.formatMessage(messages.progress, {
              index: index + 1,
              total: visible.length,
            })}
          </Eyebrow>
          <CloseButton size="sm" onClick={() => closeWalkthrough()} />
        </div>
        <ProgressBar
          orientation="horizontal"
          percentProgress={((index + 1) / visible.length) * 100}
          label={intl.formatMessage(messages.progress, {
            index: index + 1,
            total: visible.length,
          })}
          className="h-1.5"
        />
        {step.visual !== undefined && (
          <StepVisual key={step.id} frames={step.visual} />
        )}
        <div aria-live="polite" aria-atomic className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Heading id={headingId} level="h4" margin="none">
              {intl.formatMessage(step.title)}
            </Heading>
            {step.optional === true && (
              <Badge tone="neutral" size="sm">
                {intl.formatMessage(messages.optional)}
              </Badge>
            )}
          </div>
          <RenderMarkdown
            allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
            render={<div />}
          >
            {intl.formatMessage(step.body)}
          </RenderMarkdown>
          {step.done !== undefined && (
            <DoneStatus id={statusId} done={isDone(step, stage)} />
          )}
        </div>
        {step.choose !== undefined && (
          <Choice
            choice={step.choose}
            picked={choices[step.choose.id]}
            labelledBy={headingId}
            onPick={(option) =>
              step.choose !== undefined &&
              chooseInWalkthrough(step.choose.id, option, index + 1)
            }
          />
        )}
        {isLast && (
          <Summary
            visible={visible}
            stage={stage}
            onPick={(i) => goToWalkthroughStep(i)}
          />
        )}
        <div className="flex items-center justify-end gap-2">
          {!isFirst && (
            <Button
              variant="text"
              size="sm"
              onClick={() => goToWalkthroughStep(index - 1)}
            >
              {intl.formatMessage(messages.back)}
            </Button>
          )}
          {/*
            `aria-disabled` rather than `disabled`: Next holds focus when a
            step opens, and a natively disabled button would drop it to the
            page. The status it points at says what is missing.
          */}
          <Button
            ref={nextRef}
            color="primary"
            size="sm"
            aria-disabled={blocked}
            aria-describedby={blocked ? statusId : undefined}
            onClick={() => {
              if (blocked) return;
              if (isLast) closeWalkthrough();
              else goToWalkthroughStep(index + 1);
            }}
          >
            {intl.formatMessage(isLast ? messages.finish : messages.next)}
          </Button>
        </div>
      </Surface>
    </>
  );
}

function Choice({
  choice,
  picked,
  labelledBy,
  onPick,
}: Readonly<{
  choice: StageWalkthroughChoice;
  picked: string | undefined;
  labelledBy: string;
  onPick: (option: string) => void;
}>) {
  const intl = useAppIntl();
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex gap-2">
      {choice.options.map((option) => (
        <Button
          key={option.id}
          color={picked === option.id ? 'primary' : 'default'}
          size="sm"
          aria-pressed={picked === option.id}
          onClick={() => onPick(option.id)}
        >
          {intl.formatMessage(option.label)}
        </Button>
      ))}
    </div>
  );
}

function DoneStatus({ id, done }: Readonly<{ id: string; done: boolean }>) {
  const intl = useAppIntl();
  const Icon = done ? Check : Circle;
  return (
    <p
      id={id}
      className={cx(
        'm-0 flex items-center gap-2 text-sm',
        done ? 'text-success' : 'opacity-70',
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {intl.formatMessage(done ? messages.done : messages.notDone)}
    </p>
  );
}

/**
 * The steps that set something, and whether each is set, so the researcher
 * can see what is left and go straight back to it.
 */
function Summary({
  visible,
  stage,
  onPick,
}: Readonly<{
  visible: readonly VisibleStep[];
  stage: Stage | undefined;
  onPick: (index: number) => void;
}>) {
  const intl = useAppIntl();
  const rows = visible.flatMap(({ step }, position) =>
    step.done === undefined ? [] : [{ step, position }],
  );
  if (rows.length === 0) return null;
  return (
    <ul
      aria-label={intl.formatMessage(messages.summary)}
      className="m-0 flex list-none flex-col gap-1 p-0"
    >
      {rows.map(({ step, position }) => {
        const done = isDone(step, stage);
        const Icon = done ? Check : Circle;
        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onPick(position)}
              className="focusable flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-start text-sm hover:bg-current/5"
            >
              <Icon
                aria-hidden
                className={cx(
                  'size-4 shrink-0',
                  done ? 'text-success' : 'opacity-70',
                )}
              />
              <span className="grow">{intl.formatMessage(step.title)}</span>
              <span className="sr-only">
                {intl.formatMessage(done ? messages.done : messages.notDone)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  closeWalkthrough();
}

/**
 * The element a step points at: the field when it is on screen, otherwise
 * the section that holds it. Followed through the page's mutations, since a
 * field appears once the section it lives in is switched on.
 */
function useStepTarget(
  sectionId: string | undefined,
  field: string | undefined,
): HTMLElement | null {
  const subscribe = useCallback((onChange: () => void) => {
    const observer = new MutationObserver(onChange);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const getSnapshot = useCallback(() => {
    if (sectionId === undefined) return null;
    const section = document.getElementById(sectionId);
    if (section === null || field === undefined) return section;
    return (
      section.querySelector<HTMLElement>(
        `[data-field-name="${CSS.escape(field)}"]`,
      ) ?? section
    );
  }, [field, sectionId]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** Padding between the spotlight ring and the element it surrounds. */
const SPOTLIGHT_INSET = 8;

/**
 * A ring drawn over the element a step points at. Drawn on its own layer
 * rather than by styling the element, so nothing in the form changes while
 * the walkthrough is open.
 */
function Spotlight({
  target,
  reducedMotion,
}: Readonly<{ target: HTMLElement; reducedMotion: boolean }>) {
  const [rect, setRect] = useState<DOMRect>(() =>
    target.getBoundingClientRect(),
  );

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setRect(target.getBoundingClientRect()),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [target]);

  return (
    <motion.div
      aria-hidden
      className="ring-primary pointer-events-none fixed z-40 rounded ring-4"
      initial={false}
      animate={{
        top: rect.top - SPOTLIGHT_INSET,
        left: rect.left - SPOTLIGHT_INSET,
        width: rect.width + SPOTLIGHT_INSET * 2,
        height: rect.height + SPOTLIGHT_INSET * 2,
      }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { type: 'spring', duration: 0.4, bounce: 0 }
      }
    />
  );
}
