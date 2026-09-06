'use client';

import { createContext, type ReactNode, useContext } from 'react';

const HEADING_TAGS = ['h2', 'h3', 'h4', 'h5', 'h6'] as const;

export type HeadingTag = (typeof HEADING_TAGS)[number];

const EnclosingHeadingLevelContext = createContext<HeadingTag | null>(null);

/**
 * States the level of the heading a subtree sits under.
 *
 * A heading level is only ever correct relative to the heading above it, and a
 * component that can be rendered anywhere — a section, an alert — cannot know
 * what that is. On a page it can be inferred: a section derives its level from
 * Surface depth, because a section nested inside another section is one
 * Surface deeper. Inside an overlay that inference breaks. `DialogPopup`
 * restarts the Surface ladder at depth 1 so nested surfaces derive from the
 * overlay base rather than from wherever the dialog was opened, which left a
 * first-level section in a dialog an `h4` under the dialog's `h2` title. That
 * is an axe `heading-order` failure, and for anyone navigating by headings it
 * reads as a subsection that is not there.
 *
 * So the overlay that owns the enclosing heading says what it is, and what is
 * inside counts down from it. Only the ELEMENT changes: a section keeps the
 * type treatment its Surface depth gives it, and an alert title keeps the
 * small all-caps treatment that makes it read as one, because those are about
 * what the thing IS rather than where it sits in the document's outline.
 *
 * Absent — an ordinary page — nothing changes.
 */
export const EnclosingHeadingLevel = ({
  level,
  children,
}: {
  level: HeadingTag;
  children: ReactNode;
}) => (
  <EnclosingHeadingLevelContext.Provider value={level}>
    {children}
  </EnclosingHeadingLevelContext.Provider>
);

/** The heading this subtree sits under, or `null` outside any such subtree. */
export const useEnclosingHeadingLevel = () =>
  useContext(EnclosingHeadingLevelContext);

/**
 * The tag `depth` levels below an enclosing heading: one level below an `h2`
 * is an `h3`, and two is an `h4` — the same ladder a page gives, started from
 * the right rung. It stops at `h6`, which is as deep as HTML's outline goes.
 */
export const headingTagBelow = (
  enclosing: HeadingTag,
  depth: number,
): HeadingTag => {
  const level = HEADING_TAGS.indexOf(enclosing) + Math.max(depth, 1);

  return HEADING_TAGS[Math.min(level, HEADING_TAGS.length - 1)] ?? enclosing;
};
