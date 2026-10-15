'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';

import { messages } from '../messages';

const FIELD_SELECTOR = '[data-field-name]';
const TEXT_SELECTOR =
  'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"]';

/** Space left above the next question, so the end of the last one shows. */
const LEAD_IN = 32;

const nameOf = (field: Element) => field.getAttribute('data-field-name') ?? '';

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

/**
 * Whether a question still waits for an answer. A question whose kind cannot
 * be read from its markup counts as waiting, so the form stops there rather
 * than passing it by.
 */
const isUnanswered = (field: Element) => {
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
    '[role="checkbox"]:not([disabled]), button:not([disabled])',
  );

/** The questions after `field` still waiting for an answer, in order. */
const waitingAfter = (
  root: Element,
  field: Element,
  skipped: ReadonlySet<string>,
) =>
  [...root.querySelectorAll(FIELD_SELECTOR)].filter(
    (candidate) =>
      Boolean(
        field.compareDocumentPosition(candidate) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ) &&
      !field.contains(candidate) &&
      isShown(candidate) &&
      !isClosed(candidate) &&
      !skipped.has(nameOf(candidate)) &&
      isUnanswered(candidate),
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

/** Where a question's skip link goes: below its answers, above its errors. */
const slots = new WeakMap<Element, HTMLElement>();
const slotOf = (field: Element) => {
  let slot = slots.get(field);
  if (!slot?.isConnected) {
    slot = document.createElement('div');
    slot.className = 'mt-2 flex';
    (field.firstElementChild ?? field).after(slot);
    slots.set(field, slot);
  }
  return slot;
};

type Skippable = { field: Element; labelId: string | undefined };

/**
 * Carries the participant down the form. Once a question is answered with a
 * single choice, the next question still waiting for an answer is brought
 * into view, so nobody has to scroll to find it. Only a chosen option moves
 * the form on: typed answers, ticked boxes and arrow keys (which move through
 * the options of one question) leave it where it is, and nothing moves when
 * every later question is already answered, so going back to change an
 * answer does not jump away. Focus stays on the answer just given.
 *
 * A question that may be left unanswered offers a link to skip it, which
 * moves on the same way and hands focus to the next question. A skipped
 * question can still be answered; it is only passed over when moving on.
 * The first question has none, since the participant starts there.
 */
export default function QuestionFlow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const intl = useAppIntl();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const skipped = useRef(new Set<string>());
  const [skippable, setSkippable] = useState<readonly Skippable[]>([]);

  const survey = useCallback(() => {
    if (!root) return;
    const fields = [...root.querySelectorAll(FIELD_SELECTOR)].filter(isShown);
    const next = fields
      .slice(1)
      .filter(
        (field) =>
          !isRequired(field) &&
          !isClosed(field) &&
          !skipped.current.has(nameOf(field)) &&
          isUnanswered(field) &&
          waitingAfter(root, field, skipped.current).length > 0,
      )
      .map((field) => ({
        field,
        labelId: field.querySelector('[id$="-label"]')?.id,
      }));
    setSkippable((current) =>
      current.length === next.length &&
      current.every((entry, index) => entry.field === next[index]?.field)
        ? current
        : next,
    );
  }, [root]);

  // What can be skipped changes with every answer and every question the
  // answers bring in or take away.
  useEffect(() => {
    if (!root) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(survey);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-checked', 'disabled', 'data-disabled', 'hidden'],
    });
    root.addEventListener('input', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener('input', schedule);
    };
  }, [root, survey]);

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
        if (!field.isConnected || isUnanswered(field)) return;
        const [next] = waitingAfter(root, field, skipped.current);
        if (next) bringIntoView(next);
      });
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [root]);

  const skip = (field: Element) => {
    if (!root) return;
    skipped.current.add(nameOf(field));
    const [next] = waitingAfter(root, field, skipped.current);
    survey();
    if (!next) return;
    controlOf(next)?.focus({ preventScroll: true });
    bringIntoView(next);
  };

  return (
    <div ref={setRoot} className={className}>
      {children}
      {skippable.map(({ field, labelId }) =>
        createPortal(
          <Button
            type="button"
            variant="link"
            size="sm"
            aria-describedby={labelId}
            onClick={() => skip(field)}
          >
            {intl.formatMessage(messages.skipQuestion)}
          </Button>,
          slotOf(field),
          nameOf(field),
        ),
      )}
    </div>
  );
}
