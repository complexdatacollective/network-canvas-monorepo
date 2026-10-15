'use client';

import {
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import { messages } from '../messages';

const FIELD_SELECTOR = '[data-field-name]';
const TEXT_SELECTOR =
  'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"]';

/** Space left above the next question, so the end of the last one shows. */
const LEAD_IN = 32;

const isShown = (field: Element) => field.getClientRects().length > 0;

const isRequired = (field: Element) =>
  field.querySelector('[aria-required="true"], [id$="-required"]') !== null;

/** Every option of the question is disabled, so it cannot be answered. */
const isClosed = (field: Element) => {
  const options = [
    ...field.querySelectorAll('[role="radio"], [role="checkbox"]'),
  ];
  return (
    options.length > 0 &&
    options.every(
      (option) =>
        option.hasAttribute('disabled') ||
        option.getAttribute('aria-disabled') === 'true' ||
        option.hasAttribute('data-disabled'),
    )
  );
};

/** Reads a question's value from the form, by the path its field stamps. */
type ReadValue = (path: string) => unknown;

const isEmptyValue = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

/**
 * Whether a question still waits for an answer. A question the form holds is
 * read from its value, so every kind of control counts alike (a slider shows
 * a position before it is answered; a date picker has no text box). Without
 * the form, the markup is read; a question whose kind cannot be read from it
 * counts as waiting, so the form stops there rather than passing it by.
 */
const isUnanswered = (field: Element, read?: ReadValue) => {
  const path = field.getAttribute('data-field-path');
  if (read && path !== null) return isEmptyValue(read(path));
  if (field.querySelector('[role="radio"]')) {
    return !field.querySelector('[role="radio"][aria-checked="true"]');
  }
  if (field.querySelector('[role="checkbox"], input[type="checkbox"]')) {
    return !field.querySelector(
      '[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked',
    );
  }
  const text = field.querySelector<HTMLElement>(TEXT_SELECTOR);
  if (text) {
    const value =
      text instanceof HTMLInputElement || text instanceof HTMLTextAreaElement
        ? text.value
        : (text.textContent ?? '');
    return value.trim() === '';
  }
  return true;
};

const scrollerOf = (element: Element): HTMLElement | null => {
  let current = element.parentElement;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll') return current;
    current = current.parentElement;
  }
  return null;
};

/** The control a person moving to a question is handed. */
const controlOf = (field: Element) =>
  field.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
  field.querySelector<HTMLElement>(
    '[role="radio"]:not([disabled]):not([data-disabled])',
  ) ??
  field.querySelector<HTMLElement>(TEXT_SELECTOR) ??
  field.querySelector<HTMLElement>(
    'select:not([disabled]), [role="checkbox"]:not([disabled]), button:not([disabled])',
  );

/** The questions after `field` still waiting for an answer, in order. */
const waitingAfter = (root: Element, field: Element, read?: ReadValue) =>
  [...root.querySelectorAll(FIELD_SELECTOR)].filter(
    (candidate) =>
      Boolean(
        field.compareDocumentPosition(candidate) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ) &&
      !field.contains(candidate) &&
      isShown(candidate) &&
      !isClosed(candidate) &&
      isUnanswered(candidate, read),
  );

/** Scrolls `next` into view, unless all of it already shows. */
const bringIntoView = (next: Element) => {
  const scroller = scrollerOf(next);
  if (!scroller) return;
  const view = scroller.getBoundingClientRect();
  const box = next.getBoundingClientRect();
  if (box.top >= view.top && box.bottom <= view.bottom) return;

  const reduceMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  scroller.scrollTo({
    top: scroller.scrollTop + box.top - view.top - LEAD_IN,
    behavior: reduceMotion ? 'auto' : 'smooth',
  });
};

const STEP_SELECTOR = '[data-question-step]';

/** How long a chosen answer shows before the next step replaces it. */
const STEP_DELAY = 350;

type StepState = 'answered' | 'optional' | 'required';

/** The first question in `step` whose answer the form refuses. */
const firstInvalid = (step: Element) =>
  step.querySelector('[aria-invalid="true"]')?.closest(FIELD_SELECTOR) ??
  undefined;

/**
 * Whether every question in a step is answered, or what still waits. An
 * answer the form refuses holds the step like a required question left
 * unanswered.
 */
const stateOf = (step: Element, read?: ReadValue): StepState => {
  if (firstInvalid(step)) return 'required';
  const waiting = [...step.querySelectorAll(FIELD_SELECTOR)].filter(
    (field) => !isClosed(field) && isUnanswered(field, read),
  );
  if (waiting.some(isRequired)) return 'required';
  return waiting.length > 0 ? 'optional' : 'answered';
};

const firstWaiting = (step: Element, read?: ReadValue) =>
  [...step.querySelectorAll(FIELD_SELECTOR)].find(
    (field) => isShown(field) && !isClosed(field) && isUnanswered(field, read),
  );

const firstRequiredWaiting = (step: Element, read?: ReadValue) =>
  [...step.querySelectorAll(FIELD_SELECTOR)].find(
    (field) =>
      isShown(field) &&
      isRequired(field) &&
      !isClosed(field) &&
      isUnanswered(field, read),
  );

/** The steps holding at least one question, in the order they show. */
const stepsIn = (root: Element) =>
  [...root.querySelectorAll(STEP_SELECTOR)].filter(
    (step) => step.querySelector(FIELD_SELECTOR) !== null,
  );

type QuestionFlowProps = {
  className?: string;
  children: ReactNode;
  /**
   * Shows the form a step at a time: each element marked
   * `data-question-step` is one step. Without it, or without `navigation`,
   * the whole form shows, and only the scrolling below applies.
   */
  stepped?: boolean;
  /** Where the step buttons go (the panel's footer). */
  navigation?: HTMLElement | null;
  /** The control that ends the last step (the panel's Save button). */
  finish?: ReactNode;
};

/**
 * Carries the participant through the form.
 *
 * Within what shows, a question answered with a single choice brings the
 * next question still waiting for an answer into view, so nobody has to
 * scroll to find it. Only a chosen option moves the form on: typed answers,
 * ticked boxes and arrow keys (which move through the options of one
 * question) leave it where it is, and nothing moves when every later
 * question is already answered, so going back to change an answer does not
 * jump away.
 *
 * Stepped, the form shows one group of questions at a time. Answering the
 * last question still waiting in a step with a single choice moves on to the
 * next step by itself, once nothing required is left in it. The step's own
 * button continues, reading "Skip" while optional questions are left
 * unanswered; a required question left unanswered keeps the step open and
 * takes the focus instead. Back returns to the step before. An answer the
 * form refuses on saving opens the step holding it.
 */
export default function QuestionFlow({
  className,
  children,
  stepped: steppedWanted = false,
  navigation,
  finish,
}: QuestionFlowProps) {
  const intl = useAppIntl();
  const store = useContext(FormStoreContext);
  const read = useMemo<ReadValue | undefined>(
    () => (store ? (path) => store.getState().getValue(path) : undefined),
    [store],
  );
  // Steps need somewhere for their buttons; without it the whole form shows.
  const stepped = steppedWanted && navigation != null;
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [steps, setSteps] = useState<readonly Element[]>([]);
  const [current, setCurrent] = useState(0);
  const [state, setState] = useState<StepState>('answered');
  const moved = useRef(false);
  const saving = useRef(false);
  const advanceTimer = useRef<number | undefined>(undefined);

  const index = Math.min(current, Math.max(steps.length - 1, 0));
  const step = steps[index];
  const isLast = index >= steps.length - 1;

  const survey = useCallback(() => {
    if (!root || !stepped) return;
    const next = stepsIn(root);
    setSteps((known) =>
      known.length === next.length &&
      known.every((entry, at) => entry === next[at])
        ? known
        : next,
    );
  }, [root, stepped]);

  // Only the current step shows; the others stay in the form, hidden, so
  // their answers are kept and saved with the rest.
  useEffect(() => {
    if (!stepped) return;
    steps.forEach((element, at) => {
      if (!(element instanceof HTMLElement)) return;
      element.hidden = at !== index;
      element.inert = at !== index;
    });
    if (step) setState(stateOf(step, read));
  }, [stepped, steps, index, step, read]);

  const goTo = useCallback((target: number) => {
    window.clearTimeout(advanceTimer.current);
    saving.current = false;
    moved.current = true;
    setCurrent(target);
  }, []);

  // A new step starts at its top, with the focus on its first question still
  // waiting for an answer.
  useEffect(() => {
    if (!moved.current || !step) return;
    moved.current = false;
    const scroller = scrollerOf(step);
    if (scroller) scroller.scrollTop = 0;
    const field =
      firstWaiting(step, read) ?? step.querySelector(FIELD_SELECTOR);
    if (field) controlOf(field)?.focus({ preventScroll: true });
  }, [step, read]);

  // The steps change as answers bring questions in or take them away, and
  // the step button's label with every answer.
  useEffect(() => {
    if (!root || !stepped) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        survey();
        const shown = root.querySelector(`${STEP_SELECTOR}:not([hidden])`);
        if (shown) setState(stateOf(shown, read));
      });
    };
    const observer = new MutationObserver((records) => {
      // An answer refused on saving opens the step that holds it. Answers
      // that become invalid otherwise (one answer taking back another) wait
      // in their step until the participant gets there.
      const refused = !saving.current
        ? undefined
        : records.find(
            (record) =>
              record.attributeName === 'aria-invalid' &&
              record.target instanceof Element &&
              record.target.getAttribute('aria-invalid') === 'true' &&
              record.target.closest(`${STEP_SELECTOR}[hidden]`),
          );
      if (refused?.target instanceof Element) {
        const holder = refused.target.closest(STEP_SELECTOR);
        const at = stepsIn(root).findIndex((entry) => entry === holder);
        if (at >= 0) goTo(at);
        saving.current = false;
      }
      schedule();
    });
    const form = root.closest('form');
    // An answer refused before its step was left shows no change on
    // saving, so once the form has validated, a step still holding a refused
    // answer is opened too.
    const onSubmit = () => {
      saving.current = true;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!saving.current) return;
          const at = stepsIn(root).findIndex(
            (entry) => entry.hasAttribute('hidden') && firstInvalid(entry),
          );
          if (at >= 0) goTo(at);
        }),
      );
    };
    form?.addEventListener('submit', onSubmit, true);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-checked', 'aria-invalid', 'disabled'],
    });
    root.addEventListener('input', schedule);
    // Answers given through controls that change no watched markup (a
    // slider, a date picker) reach the form's values.
    const unsubscribe = store?.subscribe(schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      form?.removeEventListener('submit', onSubmit, true);
      root.removeEventListener('input', schedule);
      unsubscribe?.();
    };
  }, [root, stepped, survey, goTo, store, read]);

  const proceed = useCallback(() => {
    if (!step) return;
    const missing = firstRequiredWaiting(step, read) ?? firstInvalid(step);
    if (missing) {
      controlOf(missing)?.focus({ preventScroll: true });
      bringIntoView(missing);
      return;
    }
    if (!isLast) goTo(index + 1);
  }, [step, isLast, index, goTo, read]);

  // A chosen option moves the form on, once the answer has rendered along
  // with any question it brings in.
  useEffect(() => {
    if (!root) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[role="radio"]')) return;
      const field = target.closest(FIELD_SELECTOR);
      if (!field) return;
      requestAnimationFrame(() => {
        if (!field.isConnected || isUnanswered(field, read)) return;
        const [next] = waitingAfter(root, field, read);
        if (next) {
          bringIntoView(next);
          return;
        }
        const holder = field.closest(STEP_SELECTOR);
        if (
          stepped &&
          holder &&
          holder === step &&
          !isLast &&
          stateOf(holder, read) !== 'required'
        ) {
          window.clearTimeout(advanceTimer.current);
          advanceTimer.current = window.setTimeout(
            () => goTo(index + 1),
            STEP_DELAY,
          );
        }
      });
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [root, stepped, step, isLast, index, goTo, read]);

  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  // Enter in a typed answer continues to the next step rather than saving
  // the form from its first page.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!stepped || isLast || event.key !== 'Enter') return;
    if (!(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    proceed();
  };

  const showsSteps = stepped && steps.length > 1;

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Enter is handled for the inputs inside, which keep their own semantics.
    <div ref={setRoot} className={className} onKeyDown={onKeyDown}>
      {children}
      {stepped &&
        navigation &&
        createPortal(
          <>
            {showsSteps && index > 0 && (
              <Button
                type="button"
                variant="text"
                onClick={() => goTo(index - 1)}
              >
                {intl.formatMessage(commonMessages.back)}
              </Button>
            )}
            {showsSteps && !isLast ? (
              <Button type="button" color="primary" onClick={proceed}>
                {intl.formatMessage(
                  state === 'optional'
                    ? messages.skipStep
                    : commonMessages.continue,
                )}
              </Button>
            ) : (
              finish
            )}
          </>,
          navigation,
        )}
    </div>
  );
}
