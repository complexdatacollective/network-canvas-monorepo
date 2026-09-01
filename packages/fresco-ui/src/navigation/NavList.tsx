'use client';

import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactNode,
} from 'react';

import { headingVariants } from '../typography/Heading';
import { cx } from '../utils/cva';

/*
 * LIST SEMANTICS
 * ==============
 *
 * A grouped navigation region is rendered as SIBLING lists — one `<ul>` per
 * group, each labelled by its own visible heading — and never as one list with
 * headings inside it, or as lists nested in lists. The two rejected shapes and
 * what a screen reader makes of them:
 *
 *   One `<ul>`, headings between the sections. `<ul>` may only contain `<li>`,
 *   so each heading has to become an `<li>` — and then it is counted. NVDA and
 *   JAWS announce "list, 15 items" for an eleven-destination sidebar, and
 *   arrowing down the list lands on four rows that go nowhere. Marking those
 *   `<li>`s `role="presentation"` fixes the count and leaves the group name
 *   floating inside the list rather than naming anything.
 *
 *   Nested lists — a group as an `<li>` wrapping its own `<ul>`. This is the
 *   shape for a genuine hierarchy, and it says so: NVDA announces "level 2",
 *   VoiceOver "nested list", and each destination is announced as a child of
 *   its heading. Studio's sidebar has no hierarchy. Every destination is a
 *   peer; DESIGN and COLLECT sort them by when in a study they are used, and
 *   `/study/$id/participants` is no more a child of COLLECT than of the study.
 *
 *   Sibling lists, which is what this renders. Each `<ul>` reports its own
 *   accurate count ("Design, list, 2 items"), takes the group's name from the
 *   heading through `aria-labelledby`, and states no depth — because there
 *   isn't any. Ungrouped destinations either side of the groups get a list of
 *   their own, which is the truth about them too.
 *
 * The group heading is NOT an `<h2>`. The area's `<nav>` is already a landmark
 * with its own name, and the sidebar precedes `<main>` in the DOM, so heading
 * elements here would put the same four chrome entries at the top of the
 * heading rotor on every single route, ahead of the route's `<h1>`. The rotor
 * is what a screen-reader user skims a page with, and it should describe the
 * page. The group name still reaches assistive technology — as the accessible
 * name of the list it labels, which is where it applies.
 */

/*
 * `role="list"` is redundant in the abstract, which is what the lint rule
 * objects to, but not on a Tailwind page: preflight sets `list-style: none` on
 * every `ul`, and Safari drops list semantics from an unstyled list. Without it
 * VoiceOver announces neither a group's name nor its count — which is the whole
 * mechanism the grouping above relies on. Same reason, same fix as fresco-ui's
 * `ArrayField` and Architect's `Timeline`.
 */
const LIST_CLASSES = 'flex list-none flex-col gap-1';

export type NavListGroupProps = {
  /**
   * The group's name, as one whole translated string. It is displayed above
   * the group and is the accessible name of the group's list, so it is never
   * assembled from fragments.
   */
  heading: string;
  /** The group's `NavItem`s. */
  children: ReactNode;
  className?: string;
};

/**
 * A named group of destinations within a `NavList` — one labelled list.
 *
 * ```tsx
 * <NavListGroup heading={t('design')}>
 *   <NavItem … />
 * </NavListGroup>
 * ```
 */
export const NavListGroup = ({
  heading,
  children,
  className,
}: NavListGroupProps) => {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div
        className={cx(
          headingVariants({
            level: 'h4',
            variant: 'all-caps',
            margin: 'none',
          }),
          // Set below the destinations' own size: the group name orients, the
          // destinations are what the researcher is looking for. Quieter than
          // them in size and weight rather than in contrast: at 12.6px this is
          // normal text as far as WCAG 1.4.3 is concerned, not large text, so
          // it has to clear 4.5:1 like any other label. `text-text/60` measured
          // 3.87:1 and did not.
          'text-text/70 px-4 text-xs',
        )}
      >
        {heading}
      </div>
      {/*
        Named by `aria-label` rather than `aria-labelledby`, even though the
        heading is right there. Chromium folds `text-transform` into the
        accessible name, so pointing at the `all-caps` heading exposes the
        list as "DESIGN" — which a screen reader may spell out letter by
        letter. `aria-label` takes the string as written. No test can catch
        this: jsdom and Testing Library's browser mode both compute names
        through `dom-accessibility-api`, which does not apply
        `text-transform`, so both agree with the visual source and disagree
        with the browser. Verified against Chromium's platform accessibility
        tree.

        See LIST_CLASSES above for why the redundant role is here. The
        disable must be the line directly above the element — anything
        between them and `oxlint --fix` strips the role, which is how the
        Safari list semantics were lost once already.
      */}
      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ul role="list" aria-label={heading} className={LIST_CLASSES}>
        {children}
      </ul>
    </div>
  );
};

export type NavListProps = {
  /**
   * `NavItem`s and `NavListGroup`s, in the order they should appear. Items
   * outside a group are fine either side of the groups — a run of them becomes
   * a list of its own.
   */
  children: ReactNode;
  className?: string;
};

const isGroup = (node: ReactNode) =>
  isValidElement(node) && node.type === NavListGroup;

/**
 * The children, with fragments opened out.
 *
 * Grouping is decided by looking at what each child IS, and a fragment hides
 * that: `Children.toArray(<><NavItem/><NavListGroup/></>)` is one node, not
 * two, so the group inside it would be swept into a list of ungrouped
 * destinations. Fragments are how anyone assembles a sidebar — a component per
 * section, a conditional block — so they are opened out here rather than
 * forbidden in a doc comment nobody reads until it has already gone wrong.
 * Arrays need no help: React flattens those itself, keys and all.
 *
 * Keys are re-prefixed with the fragment's own key on the way out, because two
 * sibling fragments each hand back children keyed `.0`, `.1` — which collide
 * once they are siblings in the same list.
 */
const flattenFragments = (children: ReactNode, prefix = ''): ReactNode[] =>
  Children.toArray(children).flatMap((node) => {
    if (!isValidElement<{ children?: ReactNode }>(node)) return [node];

    const key = `${prefix}${node.key ?? ''}`;

    if (node.type === Fragment) {
      return flattenFragments(node.props.children, `${key}/`);
    }

    return [prefix === '' ? node : cloneElement(node, { key })];
  });

/**
 * A navigation region's contents: destinations, optionally divided into named
 * groups.
 *
 * ```tsx
 * <NavList>
 *   <NavItem href={studyHref} label={t('overview')} current={…} />
 *   <NavListGroup heading={t('design')}>
 *     <NavItem href={editorHref} label={t('editor')} />
 *     <NavItem href={versionsHref} label={t('versions')} count={6} />
 *   </NavListGroup>
 *   <NavItem href={settingsHref} label={t('studySettings')} />
 * </NavList>
 * ```
 *
 * It renders the contents only — no `<nav>` and no accessible name. The
 * labelled `<nav>` belongs to the area that owns the sidebar (`layout/AppArea`),
 * which is also what renders this list into a drawer on a narrow container.
 *
 * See the note at the top of this file for the list semantics and why grouping
 * is sibling lists rather than one list or nested lists. Consecutive children
 * that are not groups are collected into a list of their own, so ordering is
 * exactly the order they were written in.
 *
 * Fragments and arrays are opened out first, so a sidebar assembled from
 * per-section components or conditional blocks groups exactly as a hand-written
 * one does.
 *
 * This component makes no size-dependent layout decision and so establishes no
 * container query context of its own. A navigation list is one column at every
 * width: rows carry a touch-target floor that does not vary with the space
 * available, and labels wrap rather than truncate so a translation that runs a
 * third longer cannot be clipped. The one wide/narrow decision in this region —
 * sidebar or drawer — belongs to `AppArea`, which reads `AppFrame`'s `app-area`
 * container. A container here would also impose inline-size containment on a
 * sidebar that sizes to its content, collapsing it to its floor.
 */
const NavList = ({ children, className }: NavListProps) => {
  const sections: ReactNode[] = [];
  let run: ReactNode[] = [];

  const flushRun = () => {
    if (run.length === 0) return;

    // Keyed from the first child rather than by position, so adding or
    // removing a group above does not renumber the lists below it and remount
    // links the researcher may currently be tabbing through.
    const first = run[0];
    const key =
      isValidElement(first) && first.key !== null
        ? `items-${first.key}`
        : `items-${sections.length}`;

    sections.push(
      // oxlint-disable-next-line jsx-a11y/no-redundant-roles
      <ul key={key} role="list" className={LIST_CLASSES}>
        {run}
      </ul>,
    );
    run = [];
  };

  for (const node of flattenFragments(children)) {
    if (isGroup(node)) {
      flushRun();
      sections.push(node);
      continue;
    }

    run.push(node);
  }

  flushRun();

  return <div className={cx('flex flex-col gap-5', className)}>{sections}</div>;
};

export default NavList;
