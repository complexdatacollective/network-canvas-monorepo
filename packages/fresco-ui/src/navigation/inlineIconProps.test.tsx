/* oxlint-disable direction/inline-arrow-turns -- the test hands each listed component an arrow to see it turn */
import { render } from '@testing-library/react';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import inlineIconProps from './inlineIconProps.json';
import NavItem from './NavItem';

/**
 * The lint rule `direction/inline-arrow-turns` accepts an arrow handed to a
 * component prop listed in inlineIconProps.json without asking the caller to
 * turn it. That is only safe while each listed component really does, so
 * every entry is drawn here with an arrow: an entry for a component that
 * stopped turning it fails, and so does an entry with nothing here to draw it.
 */
const drawWith: Record<
  string,
  Record<string, (icon: LucideIcon) => ReactNode>
> = {
  NavItem: {
    icon: (icon) => (
      <ul>
        <NavItem href="/study" label="Back to study" icon={icon} />
      </ul>
    ),
  },
};

const entries = Object.entries(inlineIconProps.components).flatMap(
  ([component, props]) => props.map((prop) => [component, prop] as const),
);

describe('components listed as turning the icons they are handed', () => {
  it.each(entries)('%s turns an arrow passed as %s', (component, prop) => {
    const draw = drawWith[component]?.[prop];
    expect(
      draw,
      `inlineIconProps.json lists ${component}.${prop}; add a way to draw it here`,
    ).toBeDefined();
    const { container } = render(draw?.(ArrowLeft));
    expect(container.querySelector('svg.lucide-arrow-left')).toHaveClass(
      'rtl:-scale-x-100',
    );
  });
});
