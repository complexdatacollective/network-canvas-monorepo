import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NewsItem } from '~/lib/siteContent';

import { HomepageEntrance } from '../HomepageEntrance';

const { backgroundRender, heroRender } = vi.hoisted(() => ({
  backgroundRender: vi.fn(),
  heroRender: vi.fn(),
}));

vi.mock('~/components/ui/HomepagePageBackground', () => ({
  HomepagePageBackground: ({ reveal }: { reveal?: boolean }) => {
    backgroundRender({ reveal });
    return null;
  },
}));

vi.mock('../HeroIntro', () => ({
  HeroIntro: ({
    newsItems,
    onEntranceStart,
  }: {
    newsItems: readonly NewsItem[];
    onEntranceStart: () => void;
  }) => {
    heroRender({ newsItems, onEntranceStart });
    return <button onClick={onEntranceStart}>Start entrance</button>;
  },
}));

const newsItems: NewsItem[] = [
  {
    id: 'fixture-news',
    title: 'Fixture-only intro news',
    href: 'https://example.com/news',
  },
];

function latestReveal() {
  return backgroundRender.mock.calls.at(-1)?.[0]?.reveal;
}

describe('HomepageEntrance', () => {
  beforeEach(() => {
    backgroundRender.mockClear();
    heroRender.mockClear();
  });

  it('releases the page background when the hero entrance starts', () => {
    const content: ReactNode = <div>Homepage content</div>;
    render(
      <HomepageEntrance newsItems={newsItems}>{content}</HomepageEntrance>,
    );

    expect(latestReveal()).toBe(false);
    expect(screen.getByText('Homepage content')).toBeInTheDocument();
    expect(document.querySelectorAll('.relative.z-10')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Start entrance' }));

    expect(latestReveal()).toBe(true);
  });
});
