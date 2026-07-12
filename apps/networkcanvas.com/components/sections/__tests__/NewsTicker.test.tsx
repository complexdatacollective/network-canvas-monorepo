import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { NewsItem } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

import { NewsTicker } from '../NewsTicker';

afterEach(cleanup);

const newsItems: NewsItem[] = [
  {
    id: 'fixture-news',
    title: 'Fixture-only research news',
    href: 'https://example.com/news',
  },
];

describe('NewsTicker', () => {
  it('switches to the compact marquee at tablet portrait width', () => {
    const { container } = renderWithIntl(<NewsTicker newsItems={newsItems} />);
    const ticker = container.firstElementChild;
    const desktopTicker = ticker?.children[0];
    const mobileTicker = ticker?.children[1];

    expect(desktopTicker).toHaveClass('tablet-portrait:flex', 'hidden');
    expect(mobileTicker).toHaveClass('tablet-portrait:hidden', 'flex');
    expect(screen.getAllByText('Fixture-only research news')).toHaveLength(3);
    expect(
      screen.queryByText('Network Canvas wins INSNA Award'),
    ).not.toBeInTheDocument();
  });

  it('renders the ticker labels in Spanish', () => {
    renderWithIntl(<NewsTicker newsItems={newsItems} />, 'es');

    expect(screen.getAllByText('Últimas noticias:')).toHaveLength(2);
    expect(screen.getAllByText('[Leer la nota completa]')).toHaveLength(3);
  });
});
