import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Header } from '../Header';

vi.mock('~/components/layout/ProjectsMenu', () => ({
  ProjectsMenu: () => <div data-testid="desktop-projects-menu" />,
}));

describe('Header', () => {
  it('keeps the mobile projects menu without linking to a removed section', () => {
    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));

    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Projects' }),
    ).not.toBeInTheDocument();
  });
});
