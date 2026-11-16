const CONTROLS =
  'input:not([type="hidden"]), select, textarea, button:not(:disabled)';

/**
 * Moves focus to the first control a refused save marked invalid, and says
 * whether there was one.
 *
 * For a form whose refusals are not all filed under a named field, where
 * fresco-ui's `focusFirstError` has no container to look up: a group marked
 * invalid as a whole hands focus to the first control inside it.
 */
export function focusFirstInvalidControl(root: ParentNode | null): boolean {
  const marked = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (marked === null || marked === undefined) return false;
  const control = marked.matches(CONTROLS)
    ? marked
    : marked.querySelector<HTMLElement>(CONTROLS);
  if (control === null) return false;
  control.focus();
  return true;
}
