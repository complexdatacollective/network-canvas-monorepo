/** Marks the container a `Collection` renders its `footer` into. */
export const COLLECTION_FOOTER_ATTRIBUTE = 'data-collection-footer';

/**
 * Whether a React synthetic event was raised inside THIS collection's footer.
 *
 * A footer scrolls with the items, so it lives inside the element carrying
 * `role="listbox"` and the collection's keyboard and focus handlers — but it is
 * not part of the collection. Its own controls are ordinary buttons and links,
 * and their keystrokes bubble to those handlers like any other: Arrow keys
 * would be taken as list navigation, printable characters as type-ahead, and
 * either would move `focusedKey` and pull focus out of the control the
 * researcher is actually on. Focus reaching a footer control has likewise left
 * the items, so the collection must stop claiming it holds focus.
 *
 * `collectionElement` is what keeps a nested collection working. A `Collection`
 * rendered INSIDE a footer sits below that footer's marker in the DOM, so the
 * nearest marker above one of its own items is the OUTER collection's — and
 * matching on that alone would have the inner collection dismiss its own
 * events, losing arrow navigation, type-ahead and focus delegation entirely.
 * The marker only counts when it is inside the collection asking, which is true
 * for the outer collection (its footer is its own child) and false for the
 * inner one (that footer is its ancestor).
 *
 * Used only to *ignore* events, so an unexpected `target`, or no element to
 * scope against, fails closed — the collection treats the event as its own,
 * which is exactly its behaviour when no footer is present.
 */
export const isEventFromFooter = (
  event: { target: EventTarget | null },
  collectionElement: Element | null,
): boolean => {
  if (!(event.target instanceof Element) || collectionElement === null) {
    return false;
  }

  const footer = event.target.closest(`[${COLLECTION_FOOTER_ATTRIBUTE}]`);
  return footer !== null && collectionElement.contains(footer);
};
