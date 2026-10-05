import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SiteLink } from '~/components/ui/SiteLink';

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a {...props} href={`/en-US${href}`}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe('SiteLink', () => {
  it('keeps the locale on a path within the site', () => {
    render(<SiteLink href="/updates">Updates</SiteLink>);

    const link = screen.getByRole('link', { name: 'Updates' });
    expect(link).toHaveAttribute('href', '/en-US/updates');
    expect(link).not.toHaveAttribute('target');
  });

  it('keeps the locale on a full address back to the site', () => {
    for (const href of [
      'https://networkcanvas.com/summer-2026-update',
      'https://networkcanvas.com/es/summer-2026-update',
    ]) {
      render(<SiteLink href={href}>Announcement</SiteLink>);

      const link = screen.getByRole('link', { name: 'Announcement' });
      expect(link).toHaveAttribute('href', '/en-US/summer-2026-update');
      expect(link).not.toHaveAttribute('target');
      cleanup();
    }
  });

  it('opens another website in a new tab', () => {
    render(
      <SiteLink href="https://community.networkcanvas.com/">
        Community
      </SiteLink>,
    );

    const link = screen.getByRole('link', { name: 'Community' });
    expect(link).toHaveAttribute(
      'href',
      'https://community.networkcanvas.com/',
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('opens a protocol-relative address as another site', () => {
    for (const href of [
      '//community.networkcanvas.com/',
      '/\\community.networkcanvas.com/',
    ]) {
      render(<SiteLink href={href}>Community</SiteLink>);

      const link = screen.getByRole('link', { name: 'Community' });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      cleanup();
    }
  });
});
