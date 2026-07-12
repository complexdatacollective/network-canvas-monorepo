import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import HomePage from '~/app/page';

vi.mock('~/components/ui/PageBackground', () => ({
  PageBackground: () => <div data-testid="page-background" />,
}));

vi.mock('~/components/ui/Reveal', () => ({
  Reveal: ({ children }: { children: ReactNode }) => children,
}));

describe('HomePage background composition', () => {
  it('places one background behind the complete page content', () => {
    const { container } = render(<HomePage />);
    const main = container.querySelector('main');
    const background = screen.getByTestId('page-background');
    const foreground = background.nextElementSibling;

    expect(screen.getAllByTestId('page-background')).toHaveLength(1);
    expect(main).toHaveClass('homepage-body', 'relative', 'isolate');
    expect(background.parentElement).toBe(main);
    expect(foreground).toHaveClass('relative', 'z-10');
    expect(foreground).toContainElement(
      screen.getByRole('heading', {
        level: 1,
        name: 'Simplifying complex network data collection.',
      }),
    );
    expect(
      container.querySelector('img[src="/images/blobs/multi-2.svg"]'),
    ).toBeNull();
  });
});
