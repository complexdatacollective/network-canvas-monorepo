/**
 * The row a list in a stage editor draws one protocol object in: a prompt, a
 * panel, a form field, a rule.
 *
 * Every such list keys its rows by the object's own id (`getId={rowId}`), and
 * `ArrayField` writes that id on the row, so a problem that names an object by
 * its id can be shown on the row that holds it however the list has been
 * reordered. A row that is leaving the list, or is behind a dialog, is not a
 * place to send anyone and is not found.
 */
export function findProtocolObjectRow(
  root: ParentNode | null | undefined,
  objectId: string,
): HTMLElement | undefined {
  if (!root) return undefined;
  const rows = root.querySelectorAll<HTMLElement>(
    `[data-item-id="${CSS.escape(objectId)}"]`,
  );
  return [...rows].find(
    (row) => !row.closest('[aria-hidden="true"]') && !row.closest('[inert]'),
  );
}

/**
 * Moves focus to a row and brings it into view.
 *
 * The row is the target rather than one of its controls: its controls are what
 * a researcher does to the row (reorder, edit, delete), and landing on one of
 * them reads as that action. Focused, the row reads out what it holds. It is
 * focusable only until focus leaves it, so it never joins the tab order.
 */
export function focusProtocolObjectRow(row: HTMLElement): void {
  if (!row.hasAttribute('tabindex')) {
    row.setAttribute('tabindex', '-1');
    row.addEventListener('blur', () => row.removeAttribute('tabindex'), {
      once: true,
    });
  }
  row.focus({ preventScroll: true });
  row.scrollIntoView({ block: 'center' });
}
