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
  usePageBackgroundTargetRef: () => null,
  PageBackgroundProvider: ({ children }: { children: ReactNode }) => (
    <>
      <div data-testid="page-background" />
      {children}
    </>
  ),
}));

vi.mock('~/components/ui/Reveal', () => ({
  Reveal: ({ children }: { children: ReactNode }) => children,
}));

describe('HomePage hero background composition', () => {
  it('places one background before the localized page content', async () => {
    const page = await HomePage({
      params: Promise.resolve({ locale: 'en-US' }),
    });
    const { container } = renderWithIntl(page);
    const main = container.querySelector('main');
    const background = screen.getByTestId('page-background');
    const foreground = background.nextElementSibling;

    expect(screen.getAllByTestId('page-background')).toHaveLength(1);
    expect(main).toHaveClass('homepage-body', 'relative', 'isolate');
    expect(main).not.toHaveClass('grid');
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
