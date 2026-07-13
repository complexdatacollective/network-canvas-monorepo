import { cleanup, screen, within } from '@testing-library/react';
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

  it('uses the large desktop headline scale and cyber-grape body copy', () => {
    renderWithIntl(<Hero newsItems={newsItems} />);

    expect(
      screen.getByRole('heading', {
        name: 'Simplifying complex network data collection.',
      }),
    ).toHaveClass(
      'tablet-portrait:text-[4rem]',
      'tablet-landscape:text-[4.5rem]',
      'desktop:text-[5rem]',
    );
    expect(screen.getByText(/Network Canvas provides/)).toHaveClass(
      'text-cyber-grape',
    );
    expect(screen.getAllByText('Fixture-only hero news')).toHaveLength(3);
    expect(
      screen.queryByText('Network Canvas wins INSNA Award'),
    ).not.toBeInTheDocument();
  });

  it('distributes tablet and desktop content across the available height', () => {
    const { container } = renderWithIntl(<Hero newsItems={newsItems} />);
    const view = within(container);
    const root = view.getByTestId('hero-root');
    const heading = view.getByRole('heading', {
      name: 'Simplifying complex network data collection.',
    });
    const heroContainer = view.getByTestId('hero-layout');
    const mediaRow = view.getByTestId('hero-media-row');
    const mediaSizer = view.getByTestId('hero-media-sizer');
    const newsWrapper = view.getByTestId('hero-news-wrapper');
    const ctaWrapper = view.getByTestId('hero-cta-wrapper');

    expect(root).toHaveClass('tablet-portrait:flex', 'tablet-portrait:flex-1');
    expect(heroContainer).toHaveClass(
      'tablet-portrait:grid',
      'tablet-portrait:flex-1',
      'tablet-portrait:grid-cols-1',
      'tablet-portrait:grid-rows-[minmax(auto,20svh)_auto_auto_auto]',
      'tablet-portrait:gap-y-10',
      'tablet-portrait:content-center',
    );
    expect(heading).toHaveClass(
      'tablet-portrait:row-start-1',
      'tablet-portrait:self-center',
    );
    expect(mediaRow).toHaveClass(
      'tablet-portrait:row-start-2',
      'tablet-portrait:grid-cols-[1.1fr_0.9fr]',
      'tablet-portrait:mt-0',
    );
    expect(mediaSizer).toHaveClass(
      'w-full',
      'tablet-portrait:max-w-[min(100%,48svh)]',
      'tablet-portrait:justify-self-center',
    );
    expect(newsWrapper).toHaveClass(
      'tablet-portrait:col-start-1',
      'tablet-portrait:row-start-3',
      'tablet-portrait:mt-0',
    );
    expect(ctaWrapper).toHaveClass(
      'tablet-portrait:col-start-1',
      'tablet-portrait:row-start-4',
      'tablet-portrait:mt-0',
    );
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
