import { resolveFieldContainer } from '@codaco/fresco-ui/form/utils/focusFirstError';

type FlattenedIssue = {
  /**
   * Identity of this row, distinct from the field it points at: one field can
   * fail several rules, so `field` alone does not tell two rows apart. Consumers
   * key list items and per-row lookups by `id`, and keep `field` for anchoring.
   * Qualified by the field (not a bare index) so identity survives a change in
   * `Object.entries` order.
   */
  id: string;
  issue: string;
  field: string;
};

/**
 * One entry per message in the form store's field errors.
 *
 * The store already keys errors by resolved field name (`prompts`,
 * `introductionPanel.title`) with an array of messages, so this only has to
 * pair each message with its field and give it a stable identity.
 */
const flattenIssues = (
  fieldErrors: Record<string, string[] | undefined>,
): FlattenedIssue[] =>
  Object.entries(fieldErrors).flatMap(([field, messages]) =>
    (messages ?? []).map((issue, index) => ({
      id: `${field}#${index}`,
      issue,
      field,
    })),
  );

const getFieldId = (field: string) => {
  // Needs to be safe for urls and ids
  const safeFieldName = encodeURIComponent(field.replace(/\[|\]|\./g, '_'));
  return `field_${safeFieldName}`;
};

// Ordered candidate ids for an issue path: exact match first, then progressively
// trimmed ancestors (each also tried with `._error`), so the nearest mounted
// anchor can be found when the exact field isn't in the DOM.
const candidateIdsFor = (field: string): string[] => {
  const ids: string[] = [];
  const push = (p: string) => {
    ids.push(getFieldId(p));
    // Skip the synthetic `._error` variant when the path already targets an
    // `_error` node, which would otherwise yield a dead `..._error._error` id.
    if (!p.endsWith('._error')) {
      ids.push(getFieldId(`${p}._error`));
    }
  };
  let path = field;
  push(path);
  while (/[.[]/.test(path)) {
    const next = path.replace(/(\.[^.[\]]+|\[\d+\])$/, '');
    if (!next || next === path) {
      break;
    }
    path = next;
    push(path);
  }
  return ids;
};

/** The first mounted legacy `IssueAnchor` for an issue path, if there is one. */
const findAnchorElement = (field: string): HTMLElement | null => {
  for (const id of candidateIdsFor(field)) {
    const element = document.getElementById(id);
    if (element instanceof HTMLElement) return element;
  }
  return null;
};

/**
 * The label element a field is named by, and nothing nested inside it.
 *
 * `BaseField` renders exactly one `FieldLabel` — a `<label>` carrying an id of
 * its own — ahead of the control it names. A composite field draws whole
 * fields of its own inside that control (an `ArrayField`'s rows, a picker's
 * window), and each of those has a `<label>` too, so "the first label in the
 * container" is only the field's own until the field has rows in it. Scoped by
 * the field seam instead: a label belongs to THIS field when the nearest field
 * container above it is this one.
 */
const fieldLabelElement = (container: HTMLElement): HTMLElement | null => {
  for (const label of container.querySelectorAll('label')) {
    if (label.closest('[data-field-path], [data-field-name]') === container) {
      return label;
    }
  }
  return null;
};

/**
 * What an element says once the parts that are not its name are taken out.
 *
 * The required marker inside a label is `aria-hidden` — it is punctuation, and
 * a field called "Prompts *" is a field nothing on screen calls that.
 */
const visibleText = (element: HTMLElement): string | null => {
  const clone = element.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return null;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  return clone.textContent?.trim() || null;
};

/** What an issue row needs to know about the field it is about. */
type IssueTarget = {
  /** The element to scroll the researcher to. */
  element: HTMLElement;
  /**
   * A mounted id for the row's `href`, so the row is a link to something that
   * exists. `undefined` when the field owns no element with an id — the row is
   * then not a link at all rather than one pointing nowhere.
   */
  anchorId: string | undefined;
  /**
   * What the researcher calls this field. `undefined` when nothing on screen
   * names it, which is the only case a row falls back to the store's own key.
   */
  label: string | undefined;
};

/**
 * The field one issue is about, as it exists on screen right now.
 *
 * Resolved through the field seam `Field` stamps (`data-field-path`, the
 * store's own key) rather than through an id the panel composes, because the
 * stage editor's fields come from `@codaco/protocol-builder` and render no
 * anchor of Architect's. Composing `field_prompts` and looking it up found
 * nothing for every field in the editor: rows linked to a dead fragment and,
 * with no anchor to read a `data-name` off, named their field by the store's
 * internal path — "prompts", "quickAdd", "subject" — which is the same defect
 * #1400 fixed for the fields Architect still renders itself.
 *
 * The legacy anchor stays as a second tier for those: Architect's own dialog
 * forms (`ArchitectField`, `NewVariableWindow`) still render one, and it
 * carries a name for surfaces that are not a `Field` at all.
 */
const resolveIssueTarget = (field: string): IssueTarget | null => {
  const container = resolveFieldContainer(field);
  if (container) {
    const label = fieldLabelElement(container);
    return {
      element: container,
      anchorId: label?.id || undefined,
      label: (label ? visibleText(label) : null) ?? undefined,
    };
  }

  const anchor = findAnchorElement(field);
  if (!anchor) return null;
  return {
    element: anchor,
    anchorId: anchor.id || undefined,
    label: anchor.getAttribute('data-name') ?? visibleText(anchor) ?? undefined,
  };
};

export { flattenIssues, getFieldId, resolveIssueTarget, type IssueTarget };
