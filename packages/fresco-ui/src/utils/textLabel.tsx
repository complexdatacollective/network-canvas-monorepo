import * as React from 'react';

const isText = (node: React.ReactNode) =>
  typeof node === 'string' || typeof node === 'number';

/**
 * Whether `children` is nothing but text — strings and numbers, alone or in
 * an array. Null, undefined, and booleans render nothing and are ignored.
 */
function hasOnlyTextContent(children: React.ReactNode): boolean {
  const nodes = React.Children.toArray(children);
  return nodes.length > 0 && nodes.every(isText);
}

/**
 * Wraps text-only content in a span carrying the `text-box-trim` utility
 * (tooling/tailwind/fresco/utilities.css), so that a flex control centres it
 * on its caps rather than on its line box. The utility is inert on a flex
 * container, so the span is what makes it take effect.
 *
 * Content that carries its own markup is returned untouched: the caller owns
 * that layout, and a wrapper would collapse whatever gap or alignment it
 * relies on.
 *
 * Adopted by the controls whose label centres against a fixed height or an
 * icon: Button, Badge, and Pill here, with SegmentedSwitcher and Tabs
 * trimming the label span they already had. Menu items, list rows, and
 * navigation links keep their line box on purpose — their height comes from
 * it, and stacked rows read by their leading rather than their caps. A call
 * site that applies `buttonVariants` to its own element gets no span and so
 * no trim; it needs `Button` (or `asChild`) for the label treatment.
 */
export function trimTextContent(children: React.ReactNode): React.ReactNode {
  if (!hasOnlyTextContent(children)) return children;
  return <span className="text-box-trim">{children}</span>;
}
