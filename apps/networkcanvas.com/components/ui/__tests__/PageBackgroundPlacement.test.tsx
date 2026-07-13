import { screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import HomePage from '~/app/[locale]/page';
import { renderWithIntl } from '~/test/renderWithIntl';

vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }));

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({ children, ...props }: ComponentProps<'a'>) => (
    <a {...props}>{children}</a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@codaco/art', () => ({
  PageBackground: () => <div data-testid="page-background" />,
}));

vi.mock('~/components/ui/Reveal', () => ({
  Reveal: ({ children }: { children: ReactNode }) => children,
}));

describe('HomePage background composition', () => {
  it('places one background behind the complete localized page content', async () => {
    const page = await HomePage({
      params: Promise.resolve({ locale: 'en-US' }),
    });
    const { container } = renderWithIntl(page);
    const main = container.querySelector('main');
    const background = screen.getByTestId('page-background');
    const foreground = background.nextElementSibling;

    expect(screen.getAllByTestId('page-background')).toHaveLength(1);
    expect(main).toHaveClass('relative', 'isolate');
    expect(main).not.toHaveClass('homepage-body');
    expect(background.parentElement).toBe(main);
    expect(foreground).toHaveClass('relative', 'z-10');
    expect(foreground).toContainElement(
      screen.getByRole('heading', { level: 1 }),
    );
    expect(
      container.querySelector('img[src="/images/blobs/multi-2.svg"]'),
    ).toBeNull();
  });
});
