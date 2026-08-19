/**
 * Finding ARIA attributes that reference an element ID which is not in the
 * document.
 *
 * A dangling IDREF is not a no-op. `aria-describedby` is dropped wholesale by
 * some screen readers when any of its IDs is unresolvable, and a dangling
 * `aria-labelledby` outranks the control's own `aria-label` in the
 * accessible-name computation — so a control that looks named in the markup
 * can be announced with no name at all.
 *
 * The failure is invisible in the browser and in ordinary tests, because
 * nothing throws and nothing looks different. Assert on it directly instead:
 *
 * ```ts
 * expect(findDanglingIdReferences(container)).toEqual([]);
 * ```
 */

/**
 * ARIA attributes whose value is an element ID, or a space-separated list of
 * them. `aria-activedescendant` takes a single ID; the rest take lists, which
 * the same whitespace split handles.
 */
export const ID_REFERENCE_ATTRIBUTES = [
  'aria-activedescendant',
  'aria-controls',
  'aria-describedby',
  'aria-details',
  'aria-errormessage',
  'aria-flowto',
  'aria-labelledby',
  'aria-owns',
] as const;

export type DanglingIdReference = {
  /** The referencing element's tag name, plus its own id when it has one. */
  element: string;
  /** The attribute carrying the reference, e.g. `aria-describedby`. */
  attribute: string;
  /** The referenced ID that resolves to no element. */
  id: string;
};

function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  return element.id ? `${tag}#${element.id}` : tag;
}

/**
 * Every ARIA ID reference under `root` (inclusive) that resolves to no element
 * in the owning document. An empty array means every reference is live.
 *
 * `root` is usually a Testing Library `container`, but any element works —
 * pass a single control to check just that control.
 */
export function findDanglingIdReferences(
  root: Element | Document,
): DanglingIdReference[] {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const selector = ID_REFERENCE_ATTRIBUTES.map(
    (attribute) => `[${attribute}]`,
  ).join(',');

  const candidates: Element[] = [];
  if (root instanceof Element && root.matches(selector)) {
    candidates.push(root);
  }
  candidates.push(...root.querySelectorAll(selector));

  const dangling: DanglingIdReference[] = [];
  for (const element of candidates) {
    for (const attribute of ID_REFERENCE_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value === null) continue;
      for (const id of value.split(/\s+/).filter(Boolean)) {
        // `getElementById` is the exact lookup user agents perform, including
        // the "first element in document order" rule for duplicate IDs.
        if (doc.getElementById(id) === null) {
          dangling.push({ element: describeElement(element), attribute, id });
        }
      }
    }
  }
  return dangling;
}
