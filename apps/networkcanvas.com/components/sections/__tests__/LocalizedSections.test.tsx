import { cleanup, screen } from '@testing-library/react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Publication, TeamMember } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

import { CoreTeam } from '../CoreTeam';
import { DesignPrinciples } from '../DesignPrinciples';
import { Institutions } from '../Institutions';
import { Publications } from '../Publications';
import { ScientificAdvisors } from '../ScientificAdvisors';
import { VideoSection } from '../VideoSection';
import { WhatNext } from '../WhatNext';

vi.mock('~/components/ui/Reveal', () => ({
  Reveal: ({
    children,
    delay: _delay,
    ...props
  }: ComponentPropsWithoutRef<'div'> & {
    children: ReactNode;
    delay?: number;
  }) => <div {...props}>{children}</div>,
}));

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const members: TeamMember[] = [
  {
    id: 'researcher',
    name: 'Example Researcher',
    institution: 'Example University',
    photo: '/images/team/example.png',
  },
];

const publications: Publication[] = [
  {
    id: 'publication',
    title: 'Localized fixture publication',
    source: 'Example Journal',
    authors: 'Example Researcher',
    href: 'https://example.com/publication',
  },
];

describe('localized home sections', () => {
  it('renders Spanish design, team, and advisor headings', () => {
    renderWithIntl(
      <>
        <DesignPrinciples />
        <CoreTeam members={members} />
        <ScientificAdvisors />
      </>,
      'es',
    );

    expect(
      screen.getByRole('heading', { name: 'Principios de diseño' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Equipo principal' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Asesores científicos' }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('heading', { name: 'Asesores científicos' })
        .closest('[data-homepage-weave-target]'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Flexibilidad ontológica' }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('heading', { name: 'Principios de diseño' })
        .closest('[data-homepage-weave-target]'),
    ).toHaveAttribute('data-homepage-weave-hold-until-exit');
    expect(
      screen.getByRole('group', {
        name: 'Example Researcher, Example University',
      }),
    ).toHaveAttribute('data-homepage-weave-interactive-target');
    expect(
      screen.getByRole('group', {
        name: 'Example Researcher, Example University',
      }),
    ).toHaveAttribute('tabindex', '0');
  });

  it('renders Spanish rich text and calls to action', () => {
    renderWithIntl(
      <>
        <VideoSection />
        <Publications publications={publications} />
        <Institutions />
        <WhatNext />
      </>,
      'es',
    );

    expect(
      screen.getByRole('link', { name: 'canal de YouTube' }),
    ).toHaveAttribute('href', expect.stringContaining('youtube.com'));
    expect(
      screen.getByRole('link', { name: 'artículo de documentación' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'anterior' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Visitar el sitio de documentación' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Unirse a la lista' }),
    ).toBeInTheDocument();

    const publicationCard = screen
      .getByRole('heading', { name: 'Localized fixture publication' })
      .closest('a');
    expect(publicationCard).toHaveClass(
      'bg-surface-3',
      'text-surface-3-contrast',
    );
    expect(publicationCard?.parentElement?.parentElement).toHaveClass(
      'tablet-portrait:grid-cols-2',
      'grid-cols-1',
      'w-full',
    );
    expect(publicationCard?.closest('.max-w-none')).toBeInTheDocument();
    expect(
      screen
        .getByRole('heading', { name: 'Instituciones' })
        .closest('[data-homepage-weave-target]'),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('heading', { name: '¿Qué sigue?' })
        .closest('[data-homepage-weave-target]'),
    ).toBeInTheDocument();
  });
});
