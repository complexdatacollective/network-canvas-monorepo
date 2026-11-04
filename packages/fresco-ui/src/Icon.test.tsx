import { render } from '@testing-library/react';
import { Icon as LucideIconBase, icons } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import Icon, { isInterviewerIconName } from './Icon';
import {
  getLucideIconNames,
  getLucideIconSource,
  isLucideIconName,
} from './icons/lucideIconNames';

const lucideNames = Object.keys(icons).filter(isLucideIconName);

describe('isInterviewerIconName', () => {
  it('uses the exact custom and Lucide registries the renderer uses', () => {
    expect(isInterviewerIconName('add-a-person')).toBe(true);
    expect(isInterviewerIconName('Circle')).toBe(true);
    expect(isInterviewerIconName('not-a-rendered-icon')).toBe(false);
    expect(isInterviewerIconName('__proto__')).toBe(false);
  });

  it('accepts exactly the names in Lucide’s `icons` export', () => {
    expect(getLucideIconNames().toSorted()).toEqual(
      Object.keys(icons).toSorted(),
    );
    expect(lucideNames).toHaveLength(Object.keys(icons).length);
    expect(isInterviewerIconName('AlarmCheck')).toBe(false);
    expect(isInterviewerIconName('Grid2X2')).toBe(false);
  });
});

describe('Lucide icon loading', () => {
  it('loads the same drawing as Lucide’s own component for every icon', async () => {
    const props = { className: 'size-6', strokeWidth: 1.5 };
    const mismatches: string[] = [];
    for (const name of lucideNames) {
      const { __iconData } = await getLucideIconSource(name).load();
      const expected = renderToStaticMarkup(createElement(icons[name], props));
      const actual = renderToStaticMarkup(
        createElement(LucideIconBase, { icon: __iconData, ...props }),
      );
      if (actual !== expected) mismatches.push(name);
    }
    expect(mismatches).toEqual([]);
  });

  it('holds the icon’s box while loading, then draws it', async () => {
    const { container, findByTestId } = render(
      <Icon name="Grid2x2" data-testid="icon" className="size-6" size={18} />,
    );
    const placeholder = container.querySelector('svg');
    expect(placeholder).toHaveClass('lucide', 'lucide-grid-2x2', 'size-6');
    expect(placeholder).toHaveAttribute('width', '18');
    expect(placeholder).toHaveAttribute('height', '18');
    expect(placeholder).toHaveAttribute('viewBox', '0 0 24 24');
    expect(placeholder).toHaveAttribute('aria-hidden', 'true');
    expect(placeholder?.childElementCount).toBe(0);

    const loaded = await findByTestId('icon');
    await expect.poll(() => loaded.childElementCount).toBeGreaterThan(0);
    expect(container.innerHTML).toBe(
      renderToStaticMarkup(
        <icons.Grid2x2 data-testid="icon" className="size-6" size={18} />,
      ),
    );
  });

  it('draws an icon that has already loaded on its first render', async () => {
    const first = render(<Icon name="Anchor" />);
    await expect
      .poll(() => first.container.querySelector('svg')?.childElementCount)
      .toBeGreaterThan(0);
    first.unmount();

    const { container } = render(<Icon name="Anchor" />);
    expect(container.querySelector('svg')?.childElementCount).toBeGreaterThan(
      0,
    );
  });
});
