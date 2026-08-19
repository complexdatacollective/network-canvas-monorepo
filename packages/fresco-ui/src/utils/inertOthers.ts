/**
 * Removes everything outside an open modal from the tab order AND the
 * accessibility tree, by setting the real `inert` attribute.
 *
 * WHY THIS EXISTS. Base UI already computes the correct "outside" set for an
 * open floating element and marks it — but with `aria-hidden` only
 * (`FloatingFocusManager` calls `markOthers(insideElements, { ariaHidden: modal,
 * mark: false })`; the `inert` branch of its `applyAttributeToOthers` is never
 * taken, and no prop opts into it). Two things follow, both observed in
 * Architect:
 *
 * UPSTREAM LIMITATION (checked against @base-ui/react 1.7). `markOthers` does
 * take an `{ inert: true }` option, so the work is already written — but it is
 * a private module that `@base-ui/react`'s exports map does not expose, and
 * nothing on `FloatingFocusManager` opts into it. Importing the original is
 * therefore not available; this reimplementation is. If a released version ever
 * exposes either the module or a prop, delete this file and use it.
 *
 * DRIFT. The catalogue pins `@base-ui/react` as `~1.7.0`, so any patch release
 * can move the portal structure, the marker attributes or the mount ordering
 * this file mirrors. `inertOthers.test.ts` cannot see that — it pins the
 * algorithm against hand-built synthetic HTML that no upgrade can invalidate.
 * `inertOthers.baseui.test.tsx` drives real nested Base UI dialogs for exactly
 * that reason; keep it passing, and read a failure there as "Base UI moved",
 * not as "the test is flaky".
 *
 * 1. `aria-hidden` hides a subtree from assistive technology but leaves its
 *    controls tabbable. Architect's "Return to start screen" button sits inside
 *    an `aria-hidden="true"` ancestor while a dialog is open and is still
 *    reachable with Tab — which is the WCAG `aria-hidden-focus` failure, and is
 *    how a Tab that starts from `<body>` walks straight out of an open dialog
 *    into the page behind it.
 * 2. A modal opened OVER another modal does not mark the one below it at all,
 *    so the parent dialog stays fully exposed while a child picker is open.
 *
 * WHAT IT DOES NOT DO. It does not re-derive the boundary by walking ancestors:
 * every modal in the app portals into one shared container, so an ancestor walk
 * never separates one modal from its sibling. It mirrors Base UI's own
 * algorithm instead — build the keep-set as the ancestor path of each inside
 * element, then walk `document.body` collecting every node that is not on that
 * path — with the inside element being the modal's own Base UI portal node.
 * That node contains the popup, its backdrop, and the focus guards, so the
 * guards keep working; every other portal node (a sibling modal, a stale one
 * still animating out) falls outside and is inerted.
 *
 * Popups opened AFTER the sweep — a Select, Combobox, Popover or Tooltip inside
 * the dialog — create their portal node later, so they are not in the snapshot
 * and are never inerted. This matches Base UI's own snapshot semantics.
 *
 * Live regions are exempt, exactly as Base UI exempts them: `inert` removes a
 * subtree from the accessibility tree, so sweeping them would silence the
 * announcements raised from INSIDE the dialog (ArrayField's add/remove/reorder
 * announcements mount their live region on `document.body`, outside the portal).
 */

/**
 * Elements whose content must keep reaching assistive technology while a modal
 * is open.
 *
 * Deliberately the SAME set Base UI exempts from its own `aria-hidden` marking,
 * and no wider. Base UI hides everything outside the popup with `aria-hidden`
 * except `[aria-live]`; anything this exempts that Base UI does not is hidden
 * from assistive technology by Base UI while remaining in the tab order here —
 * which is the `aria-hidden-focus` failure this file exists to remove. Widening
 * this to the implicit live-region roles did exactly that to `Alert`
 * (`role="status"`/`role="alert"` with no `aria-live`), leaving the install
 * banner's buttons tabbable from inside an open dialog.
 */
const LIVE_REGION_SELECTOR = '[aria-live], output';

/**
 * Live regions belonging to a DIFFERENT dialog are not exempt.
 *
 * `inert` is inherited and cannot be switched off again on a descendant, so
 * exempting a live region means keeping its whole ancestor path out of the
 * sweep — and any focusable ancestor on that path stays reachable by Tab. Every
 * fresco-ui dialog body contains a field-error live region inside its scroll
 * viewport, and the viewport is a tab stop whenever it overflows: exempting
 * those left the parent dialog's viewport tabbable from inside a child picker,
 * which is the containment break this exists to close.
 *
 * Excluding them costs nothing. The topmost modal's own live regions sit inside
 * the kept subtree and are never swept; the ones that matter to the reported
 * regression — ArrayField's announcer, which mounts on `document.body`, the app
 * update indicator, the interview's prompt announcements — are not inside a
 * dialog at all. A parent dialog that has been isolated has no business
 * announcing over the one in front of it, and it is restored on close.
 */
const OWNED_BY_ANOTHER_DIALOG = '[role="dialog"], [role="alertdialog"]';

/**
 * How many sweeps currently hold each element inert, so nested modals unwind
 * in any order: the count only reaches zero when the last sweep releases it.
 */
const inertCounts = new WeakMap<Element, number>();

/**
 * Elements that were ALREADY inert when a sweep first reached them. Their
 * `inert` belongs to whoever set it, and must survive our release.
 */
const preExistingInert = new WeakSet<Element>();

/**
 * Ancestors of an exempt live region, held out of the tab order for the
 * duration of a sweep. Same counting rules as `inertCounts`; `null` records
 * "had no tabindex of its own", so the attribute is removed rather than
 * restored to a value it never had.
 *
 * A snapshot is only good while nobody else writes the attribute. React does,
 * whenever a `tabIndex` PROP changes during the sweep — `ScrollArea`'s viewport
 * is a tab stop only while its content overflows, and Architect's upload
 * control drops out of the tab order while it is busy. Restoring a stale
 * snapshot over that new value strands the element: React's DOM cache already
 * holds the value it wrote, so it never writes it again, and the control stays
 * untabbable until it remounts. See the ownership check on release.
 */
const neutralisedTabIndex = new WeakMap<
  Element,
  { count: number; previous: string | null }
>();

const buildKeepSet = (targets: Element[]): Set<Node> => {
  const keep = new Set<Node>();
  for (const target of targets) {
    let node: Node | null = target;
    while (node && !keep.has(node)) {
      keep.add(node);
      node = node.parentNode;
    }
  }
  return keep;
};

const collectOutsideElements = (
  root: Element,
  keepElements: Set<Node>,
  stopElements: Set<Element>,
): Element[] => {
  const outside: Element[] = [];

  const walk = (parent: Element) => {
    if (stopElements.has(parent)) return;

    for (const node of Array.from(parent.children)) {
      // Scripts have nothing to hide and no focusable content.
      if (node.tagName === 'SCRIPT') continue;

      if (keepElements.has(node)) {
        walk(node);
      } else {
        outside.push(node);
      }
    }
  };

  walk(root);
  return outside;
};

/**
 * Marks everything outside `insideElements` inert until the returned function
 * is called. Safe to nest: sweeps are reference-counted per element.
 *
 * Returns a no-op cleanup when there is nothing to work with (no inside
 * element, or no document), so callers never have to branch.
 */
export function inertOthers(insideElements: Element[]): () => void {
  const anchor = insideElements[0];
  const body = anchor?.ownerDocument.body;

  if (!anchor || !body) return () => undefined;

  // Anything detached from this document cannot define a boundary within it.
  const inside = insideElements.filter((element) => body.contains(element));
  if (inside.length === 0) return () => undefined;

  const exempt = Array.from(body.querySelectorAll(LIVE_REGION_SELECTOR)).filter(
    (region) => !region.closest(OWNED_BY_ANOTHER_DIALOG),
  );
  const keepElements = [...inside, ...exempt];

  const keepSet = buildKeepSet(keepElements);
  const outside = collectOutsideElements(body, keepSet, new Set(keepElements));

  /**
   * The ancestors an exempt live region drags out of the sweep with it.
   *
   * They cannot be inerted — `inert` is inherited, so inerting an ancestor
   * would silence the very region being exempted — but leaving them alone
   * leaves a hole in the containment: the stage editor's scroll container is on
   * that path, and Chrome makes scroll containers keyboard-focusable in their
   * own right (with no `tabindex` to reveal it), so Tab from inside a dialog
   * walked straight onto it. Their non-kept children are already inert, so
   * removing the path itself from the tab order closes the hole without hiding
   * anything from assistive technology.
   */
  const neutralise = [...keepSet].filter(
    (node): node is Element =>
      node instanceof Element &&
      node !== body &&
      // `buildKeepSet` walks to the top of the tree, so <html> is always on the
      // path. Making the document element focusable would be worse than the
      // hole being closed: it becomes a tab stop for the life of every dialog,
      // and `getFirstTabbableElement(<html>)` resolves to the first tabbable
      // element in the whole document.
      node !== node.ownerDocument.documentElement &&
      !keepElements.some((target) => target.contains(node)),
  );

  const held: Element[] = [];
  const heldTabIndex: Element[] = [];

  for (const element of neutralise) {
    const record = neutralisedTabIndex.get(element);
    if (record) {
      record.count += 1;
    } else {
      neutralisedTabIndex.set(element, {
        count: 1,
        previous: element.getAttribute('tabindex'),
      });
      element.setAttribute('tabindex', '-1');
    }
    heldTabIndex.push(element);
  }

  for (const element of outside) {
    const count = (inertCounts.get(element) ?? 0) + 1;
    inertCounts.set(element, count);
    held.push(element);

    if (count > 1) continue;

    if (element.hasAttribute('inert')) {
      preExistingInert.add(element);
      continue;
    }

    element.setAttribute('inert', '');
  }

  let released = false;

  return () => {
    // A React StrictMode double-invoke (or a defensive caller) must not
    // decrement a count it no longer holds.
    if (released) return;
    released = true;

    for (const element of held) {
      const count = (inertCounts.get(element) ?? 1) - 1;
      inertCounts.set(element, count);
      if (count > 0) continue;

      if (preExistingInert.has(element)) {
        preExistingInert.delete(element);
        continue;
      }

      element.removeAttribute('inert');
    }

    for (const element of heldTabIndex) {
      const record = neutralisedTabIndex.get(element);
      if (!record) continue;
      record.count -= 1;
      if (record.count > 0) continue;

      neutralisedTabIndex.delete(element);

      // Only put back what this sweep still owns. Anything other than the
      // `-1` written on the way in means another owner (React, re-rendering
      // the element with a different `tabIndex`) has taken the attribute over
      // since, and their value is the current one — restoring the snapshot
      // would overwrite it with a value nothing will ever write again.
      //
      // Ownership is inferred from the value, so an owner who coincidentally
      // sets exactly `-1` mid-sweep is indistinguishable from this sweep and
      // has its value overwritten by the snapshot. Left as is deliberately:
      // the alternative is observing every neutralised element for the life of
      // every dialog, and the failure it would prevent (an element restored to
      // being tabbable that its owner wanted out of the tab order) is the one
      // this file's release path has always produced.
      if (element.getAttribute('tabindex') !== '-1') continue;

      if (record.previous === null) {
        element.removeAttribute('tabindex');
      } else {
        element.setAttribute('tabindex', record.previous);
      }
    }
  };
}
