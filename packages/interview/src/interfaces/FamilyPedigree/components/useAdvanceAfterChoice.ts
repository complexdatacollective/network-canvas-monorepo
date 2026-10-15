import { useCallback } from 'react';

const FIELD_SELECTOR = '[data-field-name]';
const TEXT_SELECTOR =
  'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"]';

/** Space left above the next question, so the end of the last one shows. */
const LEAD_IN = 32;

const isShown = (field: Element) => field.getClientRects().length > 0;

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
  const text = field.querySelector<
    HTMLInputElement | HTMLTextAreaElement | HTMLElement
  >(TEXT_SELECTOR);
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

const advanceFrom = (form: HTMLElement, field: Element) => {
  // After the answer has rendered, along with any question it brings in.
  requestAnimationFrame(() => {
    if (!field.isConnected || isUnanswered(field)) return;

    const next = [...form.querySelectorAll(FIELD_SELECTOR)].find(
      (candidate) =>
        Boolean(
          field.compareDocumentPosition(candidate) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ) &&
        !field.contains(candidate) &&
        isShown(candidate) &&
        !isClosed(candidate) &&
        isUnanswered(candidate),
    );
    if (!next) return;

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
  });
};

/**
 * Brings the next unanswered question into view once the one before it is
 * answered with a single choice, so a participant working down the form never
 * has to scroll to find it. Only a chosen option moves the form on: typed
 * answers, ticked boxes and arrow keys (which move through the options of one
 * question) leave it where it is, and nothing moves when every later question
 * is already answered, so going back to change an answer does not jump away.
 * Focus stays on the answer just given.
 *
 * Returns a ref for the element holding the form's questions.
 */
export default function useAdvanceAfterChoice() {
  return useCallback((form: HTMLElement | null) => {
    if (!form) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[role="radio"]')) return;
      const field = target.closest(FIELD_SELECTOR);
      if (field) advanceFrom(form, field);
    };
    form.addEventListener('click', onClick);
    return () => form.removeEventListener('click', onClick);
  }, []);
}
