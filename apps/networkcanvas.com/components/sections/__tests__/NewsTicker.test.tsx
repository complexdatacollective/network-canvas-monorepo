import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NewsItem } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

import { NewsTicker } from '../NewsTicker';

const motionPreference = vi.hoisted(() => ({ reduced: false }));

vi.mock('motion/react', () => ({
  useReducedMotion: () => motionPreference.reduced,
}));

beforeEach(() => {
  motionPreference.reduced = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const newsItems: [NewsItem] = [
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
    expect(screen.getAllByRole('link', { name: '[Full story]' })).toHaveLength(
      2,
    );
    const duplicate = container.querySelector('[aria-hidden="true"] a');
    expect(duplicate).toHaveAttribute('tabindex', '-1');
    expect(container.querySelector('.animate-marquee')).toHaveClass(
      'hover:[animation-play-state:paused]',
      'focus-within:[animation-play-state:paused]',
      'motion-reduce:animate-none',
    );
    expect(
      screen.queryByText('Network Canvas wins INSNA Award'),
    ).not.toBeInTheDocument();
  });

  it('rotates stories without animation when reduced motion is preferred', () => {
    vi.useFakeTimers();
    motionPreference.reduced = true;
    const rotatingNewsItems: NewsItem[] = [
      newsItems[0],
      {
        id: 'second-fixture-news',
        title: 'Second fixture research story',
        href: 'https://example.com/second-news',
      },
    ];

    const { container } = renderWithIntl(
      <NewsTicker newsItems={rotatingNewsItems} />,
    );
    const ticker = container.firstElementChild;
    if (!ticker) throw new Error('Expected the news ticker to render');

    expect(container.querySelector('.animate-marquee')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      'Fixture-only research news',
    );

    fireEvent.mouseEnter(ticker);
    act(() => vi.advanceTimersByTime(8000));
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      'Fixture-only research news',
    );

    fireEvent.mouseLeave(ticker);
    act(() => vi.advanceTimersByTime(8000));
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      'Second fixture research story',
    );
  });

  it('renders the ticker labels in Spanish', () => {
    renderWithIntl(<NewsTicker newsItems={newsItems} />, 'es');

    expect(screen.getAllByText('Últimas noticias:')).toHaveLength(2);
    expect(screen.getAllByText('[Leer la nota completa]')).toHaveLength(3);
  });
});
