import { cleanup, screen } from '@testing-library/react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '~/test/renderWithIntl';

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
    ...props
  }: ComponentPropsWithoutRef<'section'> & {
    children: ReactNode;
    className?: string;
  }) => (
    <section className={className} {...props}>
      {children}
    </section>
  ),
}));

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe('Tools', () => {
  it('links each app panel to its live application', () => {
    const { container } = renderWithIntl(<Tools />);
    const panels = container.querySelectorAll('section.backdrop-blur-md');
    const apps = [
      {
        name: 'Architect',
        actionName: 'Open Architect',
        variant: 'architect',
        href: 'https://architect.networkcanvas.com/',
      },
      {
        name: 'Interviewer',
        actionName: 'Open Interviewer',
        variant: 'interviewer',
        href: 'https://interviewer.networkcanvas.com/',
      },
      {
        name: 'Fresco',
        actionName: 'Try the Fresco Sandbox',
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
        name: app.actionName,
      });

      expect(panel).toHaveClass('bg-surface/55', 'backdrop-blur-md');
      expect(panel).toHaveAttribute('data-homepage-weave-moving-target');
      expect(previewLink).toHaveAttribute('href', app.href);
      expect(previewLink).toHaveAttribute('target', '_blank');
      expect(previewLink).toHaveClass('focusable');
      expect(actionLink).toHaveAttribute('href', app.href);
      expect(actionLink).toHaveAttribute('target', '_blank');
    }

    expect(screen.getByRole('heading', { name: 'Fresco' })).toHaveClass(
      'text-slate-blue',
    );
    expect(
      screen.getByRole('link', { name: 'Try the Fresco Sandbox' }),
    ).toHaveClass('bg-slate-blue');
  });

  it('renders translated tool copy in Spanish', () => {
    renderWithIntl(<Tools />, 'es');

    expect(
      screen.getByRole('heading', {
        name: 'Una selección de herramientas para facilitar su investigación',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir Architect' }),
    ).toHaveAttribute('href', 'https://architect.networkcanvas.com/');
    expect(
      screen.getByText(/especialistas en la materia se concentren/),
    ).toBeInTheDocument();
  });
});
