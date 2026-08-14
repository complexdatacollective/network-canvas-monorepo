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
 * Where an invalid field wants focus sent, in priority order.
 *
 * The tiers exist because `querySelector` with a comma list answers in DOCUMENT
 * ORDER, not selector order: widening one selector to include `button` would
 * silently change which element wins in any field that renders a button ahead
 * of its real control. Each tier is queried separately so the established
 * behaviour (a native form control) always wins, and the wider matches are only
 * consulted when a field has no native control at all.
 *
 * `data-field-focus-target` lets a composite field name its own control
 * explicitly — the variable picker's "Select variable" button is the control
 * that actually resolves its error, and it is not the first button in the
 * field.
 *
 * The last tier is what reaches a Base UI Switch. Its real control is a bare
 * `<button role="switch">` carrying no `tabindex` of its own, so the three
 * tiers above it match only the `aria-hidden` proxy checkbox beside it — which
 * `isOperable` then rejects, leaving nothing at all. A form that refuses to
 * submit has to put focus somewhere the researcher can act.
 */
const FOCUS_TARGET_TIERS = [
  '[data-field-focus-target]',
  'input:not([type="hidden"]), textarea, select, [contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
  'button:not(:disabled), a[href]',
];

/**
 * Rejects candidates that exist in the DOM but are not something a person can
 * be handed.
 *
 * `input` has to be matched broadly (a control may carry no `tabindex` of its
 * own), which sweeps up the hidden proxy inputs several Base UI primitives
 * render alongside their real control — a Switch renders `<button role="switch">`
 * followed by an `aria-hidden`, `tabindex="-1"` checkbox. Focusing that proxy
 * leaves the researcher with no visible focus ring and hands a screen reader a
 * node marked as not existing.
 *
 * `[inert]` is included for the same reason: an inert subtree cannot take focus
 * at all, so calling `focus()` on something inside one silently leaves focus on
 * `<body>`.
 */
const isOperable = (candidate: HTMLElement) =>
  candidate.getAttribute('aria-hidden') !== 'true' &&
  candidate.getAttribute('tabindex') !== '-1' &&
  !candidate.hasAttribute('disabled') &&
  !candidate.closest('[aria-hidden="true"]') &&
  !candidate.closest('[inert]');

/**
 * The first control inside `container` that a person can actually operate,
 * taking the tiers in priority order.
 *
 * Deliberately PURE — it is also used as a predicate to decide which errored
 * field wins, and a predicate that mutated the DOM would stamp every errored
 * container it merely inspected.
 */
const findOperableControl = (
  container: HTMLElement,
): HTMLElement | undefined => {
  for (const selector of FOCUS_TARGET_TIERS) {
    const match = [...container.querySelectorAll<HTMLElement>(selector)].find(
      isOperable,
    );
    if (match) return match;
  }

  return undefined;
};

/**
 * Last resort: make the field container itself take the focus.
 *
 * A field with nothing focusable in it at all still has to take focus, or the
 * submit that produced the error leaves focus on `<body>` and the error is
 * never announced. Making the container programmatically focusable is the
 * standard fallback; `-1` keeps it out of the tab sequence.
 *
 * Returns undefined when the container cannot take focus either. Field
 * containers are looked up across the whole document, so a background form's
 * field can win while a dialog is open; focusing something inert is a silent
 * no-op that would leave focus on `<body>` AND permanently mutate a background
 * element.
 */
const makeContainerFocusable = (
  container: HTMLElement,
): HTMLElement | undefined => {
  if (!isOperable(container)) return undefined;

  if (!container.hasAttribute('tabindex')) {
    container.setAttribute('tabindex', '-1');
  }
  return container;
};

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
  // submission, parking the researcher on a heading with every offending
  // control still to be found by hand.
  let focusTarget = earliestInDocument(
    containers.filter((candidate) => findOperableControl(candidate)),
  );
  let focusableElement = focusTarget
    ? findOperableControl(focusTarget)
    : undefined;

  // Only when NO errored field owns a control does the container itself become
  // the target. Ordered after the search above, never merged into it: a
  // container fallback that competed on equal terms would let the contradiction
  // alert win document order over the real fields below it, which is the case
  // the split exists to prevent.
  if (!focusableElement) {
    focusTarget = earliestInDocument(containers.filter(isOperable));
    focusableElement = focusTarget
      ? makeContainerFocusable(focusTarget)
      : undefined;
  }

  const ownerDocument = scrollTarget.ownerDocument;

  // Focus that already sits inside this field is left alone: the person is
  // mid-correction, and re-taking it would reset an in-progress selection
  // (a date input's segment, a text caret) for no gain.
  //
  // Focus resting on `<body>` or the document element is not a person
  // mid-correction — it is focus that has been LOST, which is exactly what
  // happens when the submit button that held it is disabled for the submit and
  // the browser blurs it. That must never read as "leave it alone"; it is the
  // case this function exists for.
  const active = ownerDocument.activeElement;
  const focusWasLost =
    active === null ||
    active === ownerDocument.body ||
    active === ownerDocument.documentElement;
  const personIsMidCorrection =
    !focusWasLost && focusTarget !== undefined && focusTarget.contains(active);

  if (focusableElement && !personIsMidCorrection) {
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
