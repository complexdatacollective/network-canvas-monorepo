import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Node from './Node';

describe('Node label layout', () => {
  it('keeps an unbroken label inside fixed square node geometry', () => {
    const label = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    render(<Node label={label} shape="circle" size="sm" />);

    const node = screen.getByRole('button', { name: label });
    const visibleLabel = within(node).getByText(label);

    expect(node).toHaveClass('aspect-square', 'min-w-0', 'shrink-0', 'size-24');
    expect(visibleLabel).toHaveClass(
      'w-[80%]',
      'min-w-0',
      'hyphens-auto',
      'wrap-anywhere',
      'line-clamp-3',
    );
    expect(visibleLabel).toHaveTextContent(label);
  });

  it.each([
    ['xxs', 'line-clamp-1'],
    ['xs', 'line-clamp-2'],
    ['sm', 'line-clamp-3'],
    ['md', 'line-clamp-3'],
    ['lg', 'line-clamp-3'],
  ] as const)(
    'uses a height-safe line clamp at %s size',
    (size, clampClass) => {
      const label = `Long label for ${size}`;

      render(<Node label={label} size={size} />);

      expect(screen.getByText(label)).toHaveClass(clampClass);
    },
  );

  it('preserves the complete accessible name when the visual label is clamped', () => {
    const label =
      'Alexandra Müller-Lüdenscheidt with an intentionally extended name';

    render(<Node label={label} lang="de" size="sm" />);

    expect(screen.getByRole('button', { name: label })).toHaveAttribute(
      'lang',
      'de',
    );
    expect(screen.getByText(label)).toHaveTextContent(label);
  });
});
