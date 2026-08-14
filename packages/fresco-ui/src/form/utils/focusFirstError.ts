import { scrollParent } from '../../utils/scrollParent';
import type { FlattenedErrors } from '../store/types';

const FIELD_CONTAINER_SELECTOR = '[data-field-path], [data-field-name]';

/**
 * The field container an error key names.
 *
 * `data-field-path` is the store's own key and is unique, so it wins. A public
 * `data-field-name` is only trusted when exactly one element carries it —
 * several fields may share a public name across namespaces, and guessing
 * between them would scroll to the wrong question. The fallback is
 * load-bearing beyond form fields: Architect's whole-editor contradiction
 * alert carries `data-field-name` alone (and no focusable child), and is
 * reached only this way.
 */
const findFieldContainer = (
  candidates: HTMLElement[],
  fieldName: string,
): HTMLElement | undefined => {
  const pathMatch = candidates.find(
    (candidate) => candidate.getAttribute('data-field-path') === fieldName,
  );
  if (pathMatch) return pathMatch;

  const publicNameMatches = candidates.filter(
    (candidate) => candidate.getAttribute('data-field-name') === fieldName,
  );
  return publicNameMatches.length === 1 ? publicNameMatches[0] : undefined;
};

/**
 * The first candidate inside `container` that a person can actually operate.
 *
 * `input` has to be matched broadly (a control may carry no `tabindex` of its
 * own), which sweeps up the hidden proxy inputs several Base UI primitives
 * render alongside their real control — a Switch renders
 * `<button role="switch">` followed by an `aria-hidden`, `tabindex="-1"`
 * checkbox. Focusing that proxy leaves the person with no visible focus ring
 * and hands a screen reader a node marked as not existing.
 */
const findOperableControl = (container: HTMLElement): HTMLElement | undefined =>
  [
    ...container.querySelectorAll<HTMLElement>(
      'input, textarea, select, [tabindex]:not([tabindex="-1"])',
    ),
  ].find(
    (candidate) =>
      candidate.getAttribute('aria-hidden') !== 'true' &&
      candidate.getAttribute('tabindex') !== '-1' &&
      !candidate.hasAttribute('disabled') &&
      !candidate.closest('[aria-hidden="true"]'),
  );

/** The earliest of `containers` in document order. */
const earliestInDocument = (
  containers: HTMLElement[],
): HTMLElement | undefined =>
  containers.reduce<HTMLElement | undefined>(
    (earliest, candidate) =>
      earliest === undefined ||
      (earliest.compareDocumentPosition(candidate) &
        Node.DOCUMENT_POSITION_PRECEDING) !==
        0
        ? candidate
        : earliest,
    undefined,
  );

/**
 * Send the person filling in the form to the first thing that blocked
 * submission.
 *
 * "First" means first in DOCUMENT order, across every errored field — not the
 * arbitrary insertion order of the error map, which does not track the order
 * the questions are read in (and never did for multi-column or namespaced
 * forms).
 *
 * Focus is applied SYNCHRONOUSLY. Callers reach this from a layout effect
 * keyed on the form store's error state (`useForm`), which runs after React
 * has committed the render that produced those errors — and therefore after
 * any focus restoration React performs during that commit. Because there is
 * no deferral there is no window in which focus rests on `document.body`, and
 * no race for React's commit to win: the previous implementation waited for
 * `scrollend` or an 800 ms fallback, which left focus on `body` for the whole
 * wait and dropped it entirely whenever the commit had moved focus meanwhile.
 *
 * Focus is taken BEFORE the scroll, so ours is the last scroll issued. A
 * control that scrolls its own internals into view on focus — chromium does
 * this for a date input's segment selection even with `preventScroll` — can
 * then no longer leave the scroller somewhere other than where we put it.
 *
 * `root` scopes the search to one form's own markup. Two forms mounted at once
 * (a dialog over a page, two slides mid-transition) render the same field
 * paths, and without a scope the document-order rule would hand the earlier
 * form's control to the later form's failed submit. It falls back to the whole
 * document when the root contains none of the errored fields, so a form that
 * renders a field outside its own element still reaches it.
 */
export const focusFirstError = (
  errors: FlattenedErrors | null,
  root?: ParentNode | null,
) => {
  if (!errors) return;

  const fieldNames = Object.keys(errors.fieldErrors);
  if (fieldNames.length === 0) return;

  const resolveWithin = (scope: ParentNode): HTMLElement[] => {
    const candidates = Array.from(
      scope.querySelectorAll<HTMLElement>(FIELD_CONTAINER_SELECTOR),
    );
    return fieldNames
      .map((fieldName) => findFieldContainer(candidates, fieldName))
      .filter((candidate): candidate is HTMLElement => candidate !== undefined);
  };

  const scoped = root ? resolveWithin(root) : [];
  const containers = scoped.length > 0 ? scoped : resolveWithin(document);

  // If no errored field is in the DOM, prevent crash.
  const scrollTarget = earliestInDocument(containers);
  if (!scrollTarget) {
    // eslint-disable-next-line no-console
    console.warn(
      `focusFirstError(): no element found in DOM for ${fieldNames
        .map((fieldName) => `[data-field-name="${fieldName}"]`)
        .join(', ')}`,
    );
    return;
  }

  // Scroll to the topmost problem, but focus the topmost problem a person can
  // actually act on. Architect's whole-editor contradiction alert is a
  // container with no control in it, and it renders above every field: without
  // this split it would win document order and swallow the focus for the whole
  // submission, leaving nothing focused at all.
  const focusTarget = earliestInDocument(
    containers.filter((candidate) => findOperableControl(candidate)),
  );
  const focusableElement = focusTarget
    ? findOperableControl(focusTarget)
    : undefined;
  const ownerDocument = scrollTarget.ownerDocument;

  // Focus that already sits inside this field is left alone: the person is
  // mid-correction, and re-taking it would reset an in-progress selection
  // (a date input's segment, a text caret) for no gain.
  if (
    focusableElement &&
    focusTarget &&
    !focusTarget.contains(ownerDocument.activeElement)
  ) {
    focusableElement.focus({ preventScroll: true });
  }

  const scroller = scrollParent(scrollTarget) as unknown as HTMLElement;
  const scrollStart = scroller.scrollTop;
  const scrollerOffset = Number.parseInt(
    scroller.getBoundingClientRect().top.toString(),
    10,
  );
  const destinationOffset = Number.parseInt(
    scrollTarget.getBoundingClientRect().top.toString(),
    10,
  );

  // Subtract 200 to put more of the input in view.
  const scrollEnd = destinationOffset + scrollStart - scrollerOffset - 200;
  const prefersReducedMotion =
    ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')
      .matches ?? false;

  scroller.scrollTo({
    top: scrollEnd,
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });
};
