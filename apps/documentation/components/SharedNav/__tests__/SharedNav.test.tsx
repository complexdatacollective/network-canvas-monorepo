import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SiteNavigationLinkRenderProps } from '@codaco/fresco-ui/navigation/SiteNavigation';

import SharedNav from '../SharedNav';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}));

vi.mock('@codaco/fresco-ui/navigation/SiteNavigation', () => ({
  default: ({
    renderLink,
  }: {
    renderLink: (props: SiteNavigationLinkRenderProps) => ReactNode;
  }) =>
    renderLink({
      href: 'https://networkcanvas.com/download',
      children: 'Get Started',
      className: '',
    }),
}));

vi.mock('~/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  } & Omit<ComponentProps<'a'>, 'href'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('shared documentation navigation', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('points website destinations at the configured deployment', () => {
    vi.stubEnv('NEXT_PUBLIC_NETWORK_CANVAS_URL', 'http://localhost:3001');

    render(<SharedNav />);

    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      'http://localhost:3001/get-started',
    );
  });
});
