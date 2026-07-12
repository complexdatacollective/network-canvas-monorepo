import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Tools } from '../Tools';

vi.mock('~/components/ui/DeviceMockup', () => ({
  DeviceMockup: ({ variant }: { variant?: string }) => (
    <span>{variant} preview</span>
  ),
}));

vi.mock('~/components/ui/Reveal', () => ({
  Reveal: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <section className={className}>{children}</section>,
}));

describe('Tools', () => {
  it('links each app panel to its live application', () => {
    const { container } = render(<Tools />);
    const panels = container.querySelectorAll('section.backdrop-blur-md');
    const apps = [
      {
        name: 'Architect',
        variant: 'architect',
        href: 'https://architect.networkcanvas.com/',
      },
      {
        name: 'Interviewer',
        variant: 'interviewer',
        href: 'https://interviewer.networkcanvas.com/',
      },
      {
        name: 'Fresco',
        variant: 'fresco',
        href: 'https://fresco-sandbox.networkcanvas.com/',
      },
    ];

    expect(panels).toHaveLength(3);

    for (const app of apps) {
      const heading = screen.getByRole('heading', { name: app.name });
      const panel = heading.closest('section');
      const previewLink = screen.getByRole('link', {
        name: `${app.variant} preview`,
      });
      const actionLink = screen.getByRole('link', {
        name: `Open ${app.name}`,
      });

      expect(panel).toHaveClass('bg-white/55', 'backdrop-blur-md');
      expect(previewLink).toHaveAttribute('href', app.href);
      expect(previewLink).toHaveAttribute('target', '_blank');
      expect(previewLink).toHaveClass('focusable');
      expect(actionLink).toHaveAttribute('href', app.href);
      expect(actionLink).toHaveAttribute('target', '_blank');
    }

    expect(screen.getByRole('heading', { name: 'Fresco' })).toHaveClass(
      'text-slate-blue',
    );
    expect(screen.getByRole('link', { name: 'Open Fresco' })).toHaveClass(
      'bg-slate-blue',
    );
  });
});
