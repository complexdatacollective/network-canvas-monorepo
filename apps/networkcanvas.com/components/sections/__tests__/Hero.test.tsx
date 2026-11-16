import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { NewsItem } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

import { Hero } from '../Hero';

const newsItems: NewsItem[] = [
  {
    id: 'fixture-news',
    title: 'Fixture-only hero news',
    href: 'https://example.com/news',
  },
];

afterEach(cleanup);

describe('Hero', () => {
  it('links the primary action to Get Started', () => {
    renderWithIntl(<Hero newsItems={newsItems} />);

    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      '/en-US/get-started',
    );
    expect(
      screen.queryByRole('link', { name: 'Download Now' }),
    ).not.toBeInTheDocument();
  });

  it('shows the headline, body copy and the news it is given', () => {
    renderWithIntl(<Hero newsItems={newsItems} />);

    expect(
      screen.getByRole('heading', {
        name: 'Simplifying complex network data collection.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Network Canvas provides/)).toBeInTheDocument();
    expect(screen.getAllByText('Fixture-only hero news')).toHaveLength(3);
    expect(
      screen.queryByText('Network Canvas wins INSNA Award'),
    ).not.toBeInTheDocument();
  });

  it('marks each animated hero item for its pre-hydration entrance state', () => {
    renderWithIntl(<Hero newsItems={newsItems} />);

    const items = [
      screen.getByRole('heading', {
        name: 'Simplifying complex network data collection.',
      }),
      screen.getByText(/Network Canvas provides/),
      screen.getAllByRole('link', {
        name: '[Read more] Fixture-only hero news',
      })[0],
      screen.getByRole('link', { name: 'Get Started' }),
    ].map((element) => element?.closest('.entrance-motion-item'));

    for (const item of items) expect(item).not.toBeNull();
    // Heading, media row, news and call to action each enter on their own.
    expect(new Set(items).size).toBe(4);
  });

  it('renders Spanish hero copy', () => {
    renderWithIntl(<Hero newsItems={newsItems} />, 'es');

    expect(
      screen.getByRole('heading', {
        name: 'Simplificando la recopilación de datos de redes complejas.',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Últimas noticias:')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Comenzar' })).toHaveAttribute(
      'href',
      '/es/get-started',
    );
  });
});
