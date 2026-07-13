import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SiteNavigation from '../SiteNavigation';

const baseProps = {
  brand: <span>Network Canvas</span>,
  brandHref: '/',
  brandLabel: 'Network Canvas home',
  closeMenuLabel: 'Close menu',
  openMenuLabel: 'Open menu',
};

describe('SiteNavigation', () => {
  it('marks the active page', () => {
    render(
      <SiteNavigation
        {...baseProps}
        activeItemId="documentation"
        items={[
          { id: 'community', label: 'Community', href: '#community' },
          {
            id: 'documentation',
            label: 'Documentation',
            href: '#documentation',
          },
        ]}
      />,
    );

    expect(
      screen.getAllByRole('link', { name: 'Documentation' })[0],
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getAllByRole('link', { name: 'Community' })[0],
    ).not.toHaveAttribute('aria-current');
  });

  it('renders app-owned items for desktop and mobile contexts', () => {
    const renderItem = vi.fn(({ view }: { view: 'desktop' | 'mobile' }) => (
      <span>Injected {view} item</span>
    ));

    render(
      <SiteNavigation
        {...baseProps}
        items={[{ id: 'language', render: renderItem }]}
      />,
    );

    expect(screen.getByText('Injected desktop item')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByText('Injected mobile item')).toBeInTheDocument();
    expect(renderItem).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'mobile', active: false }),
    );
  });

  it('closes the mobile menu after following a standard link', () => {
    render(
      <SiteNavigation
        {...baseProps}
        items={[{ id: 'community', label: 'Community', href: '#community' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobileLink = screen.getAllByRole('link', {
      name: 'Community',
    })[1];
    if (!mobileLink) throw new Error('Expected a mobile Community link.');
    fireEvent.click(mobileLink);

    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
