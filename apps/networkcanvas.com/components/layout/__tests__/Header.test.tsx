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

    fireEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));

    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Projects' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Get Started' })).toHaveLength(
      2,
    );
  });
});
