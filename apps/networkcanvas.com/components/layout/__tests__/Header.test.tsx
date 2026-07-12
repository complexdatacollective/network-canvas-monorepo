import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Header } from '../Header';

vi.mock('~/components/layout/ProjectsMenu', () => ({
  ProjectsMenu: () => <div data-testid="desktop-projects-menu" />,
}));

afterEach(cleanup);

describe('Header', () => {
  it('uses Get Started as the primary action', () => {
    render(<Header />);

    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      '/get-started',
    );
    expect(
      screen.queryByRole('link', { name: 'Download' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the mobile projects menu without linking to a removed section', () => {
    render(<Header />);

    const openMenu = screen.getByRole('button', { name: 'Open menu' });

    expect(openMenu).toHaveAttribute('aria-expanded', 'false');
    expect(openMenu).toHaveClass('aspect-square', 'p-0!');
    expect(openMenu.querySelector('.lucide-menu')).toHaveAttribute(
      'aria-hidden',
      'true',
    );

    fireEvent.click(openMenu);

    const closeMenu = screen.getByRole('button', { name: 'Close menu' });

    expect(closeMenu).toHaveAttribute('aria-expanded', 'true');
    expect(closeMenu.querySelector('.lucide-x')).toHaveAttribute(
      'aria-hidden',
      'true',
    );

    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Projects' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Get Started' })).toHaveLength(
      2,
    );

    fireEvent.click(closeMenu);

    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
