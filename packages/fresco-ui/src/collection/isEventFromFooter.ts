/** Marks the container a `Collection` renders its `footer` into. */
export const COLLECTION_FOOTER_ATTRIBUTE = 'data-collection-footer';

/**
 * Whether a React synthetic event was raised inside a collection's footer.
 *
 * A footer scrolls with the items, so it lives inside the element carrying
 * `role="listbox"` and the collection's keyboard and focus handlers — but it is
 * not part of the collection. Its own controls are ordinary buttons and links,
 * and their keystrokes bubble to those handlers like any other: Arrow keys
 * would be taken as list navigation, printable characters as type-ahead, and
 * either would move `focusedKey` and pull focus out of the control the
 * researcher is actually on. Focus arriving from outside the collection reads
 * the same way, delegating to the first item and yanking focus off the footer.
 *
 * Used only to *ignore* events, so an unexpected `target` fails closed (the
 * collection treats it as its own, which is the behaviour without a footer).
 */
export const isEventFromFooter = (event: {
  target: EventTarget | null;
}): boolean =>
  event.target instanceof Element &&
  event.target.closest(`[${COLLECTION_FOOTER_ATTRIBUTE}]`) !== null;
