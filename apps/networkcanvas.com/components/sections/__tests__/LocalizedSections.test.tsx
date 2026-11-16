import { cleanup, screen, within } from '@testing-library/react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  externalLinks,
  institutions,
  principles,
  scientificAdvisors,
} from '~/lib/content';
import type { Publication, TeamMember } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

import { CoreTeam } from '../CoreTeam';
import { DesignPrinciples } from '../DesignPrinciples';
import { Institutions } from '../Institutions';
import { Publications } from '../Publications';
import { VideoSection } from '../VideoSection';
import { WhatNext } from '../WhatNext';

vi.mock('~/components/ui/Reveal', () => ({
  Reveal: ({
    children,
    delay: _delay,
    direction,
    distance: _distance,
    duration: _duration,
    easing: _easing,
    scrollLinked,
    scrollStagger: _scrollStagger,
    ...props
  }: ComponentPropsWithoutRef<'div'> & {
    children: ReactNode;
    delay?: number;
    direction?: string;
    distance?: number;
    duration?: number;
    easing?: readonly number[];
    scrollLinked?: boolean;
    scrollStagger?: number;
  }) => (
    <div
      data-scroll-direction={direction}
      data-scroll-linked={scrollLinked ? 'true' : undefined}
      {...props}
    >
      {children}
    </div>
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
    authors: 'Example Researcher, Second Researcher',
    href: 'https://example.com/publication',
    year: '2024',
  },
  {
    id: 'earlier-publication',
    title: 'Earlier fixture publication',
    source: 'Example Journal',
    authors: 'Example Researcher, Third Researcher',
    href: 'https://example.com/earlier-publication',
    year: '2023',
  },
];

describe('localized home sections', () => {
  it('renders Spanish design, team, and advisor headings', () => {
    renderWithIntl(
      <>
        <DesignPrinciples />
        <CoreTeam members={members} />
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
      screen.getByRole('heading', { name: 'Flexibilidad ontológica' }),
    ).toBeInTheDocument();

    const team = screen.getByRole('list', { name: 'Equipo principal' });
    expect(within(team).getByRole('listitem')).toHaveTextContent(
      'Example ResearcherExample University',
    );
    const advisors = screen
      .getByRole('heading', { name: 'Asesores científicos' })
      .parentElement?.querySelector('ul');
    if (!advisors) throw new Error('Expected the advisors list');
    expect(
      within(advisors)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(scientificAdvisors);
  });

  it('links each Spanish design principle title to its documentation', () => {
    renderWithIntl(<DesignPrinciples />, 'es');

    const section = screen.getByRole('region', {
      name: 'Principios de diseño',
    });
    const titles = [
      'Flexibilidad ontológica',
      'Presencial y con asistencia de una persona entrevistadora',
      'Énfasis en el diseño',
      'Flujo de trabajo integral',
      'Desarrollo de código abierto impulsado por la comunidad',
    ];
    expect(principles).toHaveLength(titles.length);

    const headings = within(section).getAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(titles);
    for (const [index, principle] of principles.entries()) {
      expect(
        within(headings[index]!).getByRole('link', { name: titles[index] }),
      ).toHaveAttribute('href', principle.href);
    }
    // The titles are the section's only links: the scene beside the cards is
    // decoration.
    expect(within(section).getAllByRole('link')).toHaveLength(titles.length);
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
    const videoEmbed = screen.getByTitle('Ver: ¿Qué es Network Canvas?');
    expect(videoEmbed).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/XzfE6j-LnII?si=sg8osuFqwG3ZlDK1',
    );
    expect(videoEmbed).not.toHaveAttribute('sandbox');
    expect(videoEmbed.parentElement).toHaveAttribute(
      'data-scroll-direction',
      'zoom',
    );
    expect(screen.getByRole('link', { name: 'anterior' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Visitar el sitio de documentación' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Unirse a la lista' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Mantente en contacto' }),
    ).toBeInTheDocument();
    for (const [name, href] of [
      ['Visitar el sitio de documentación', externalLinks.documentation],
      ['Visitar el sitio de la comunidad', externalLinks.community],
      ['Explorar opciones de colaboración', externalLinks.collaboration],
    ] as const) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
    }
    expect(
      institutions.map(({ name }) => screen.getByRole('img', { name })),
    ).toHaveLength(institutions.length);

    const publicationHeading = screen.getByRole('heading', {
      name: 'Publicaciones recientes que utilizan Network Canvas',
      level: 2,
    });
    expect(publicationHeading).toHaveAttribute(
      'id',
      'recent-publications-heading',
    );
    expect(
      screen
        .getByRole('heading', { name: 'Localized fixture publication' })
        .closest('a'),
    ).toHaveAttribute('href', 'https://example.com/publication');
    const publicationSection = publicationHeading.closest('section');
    if (!publicationSection) throw new Error('Expected a publications section');
    expect(
      within(publicationSection).getByText('2', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Ver todas las 2 publicaciones, con 3 personas autoras',
      }),
    ).toHaveAttribute('href', '/publications');
    expect(screen.getByText('Persona autora')).toBeInTheDocument();
  });
});
