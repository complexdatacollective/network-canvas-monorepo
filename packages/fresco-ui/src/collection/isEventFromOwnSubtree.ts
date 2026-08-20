/**
 * Whether a React synthetic event was raised inside the DOM subtree of the
 * element the handler is attached to.
 *
 * React dispatches events through the REACT tree, not the DOM tree, so a popup
 * rendered through a portal (`Menu.Portal`, `Popover.Portal`, …) delivers its
 * focus and keyboard events to every React ancestor of the portal — including
 * the collection container and the collection item that rendered the trigger,
 * neither of which contains the popup in the DOM.
 *
 * A collection's focus and keyboard state describes its own subtree. Treating a
 * portalled popup's events as its own makes it believe focus is entering and
 * leaving it while the researcher is only moving between menu items, and lets
 * menu keystrokes drive list navigation, type-ahead and selection from inside
 * an overlay.
 *
 * Used to *ignore* foreign events, never to act on them, so a browser that
 * reports an unexpected `target` fails closed (the collection does nothing)
 * rather than acting on an event that is not its business.
 */
export const isEventFromOwnSubtree = (event: {
  currentTarget: EventTarget | null;
  target: EventTarget | null;
}): boolean => {
  const { currentTarget, target } = event;
  if (!(currentTarget instanceof Node) || !(target instanceof Node)) {
    return false;
  }
  return currentTarget.contains(target);
};
