import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Hero } from '../Hero';

afterEach(cleanup);

describe('Hero', () => {
  it('links the primary action to Get Started', () => {
    render(<Hero />);

    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      '/get-started',
    );
    expect(
      screen.queryByRole('link', { name: 'Download Now' }),
    ).not.toBeInTheDocument();
  });

  it('uses the large desktop headline scale and cyber-grape body copy', () => {
    render(<Hero />);

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
  });

  it('distributes tablet and desktop content across the available height', () => {
    const { container } = render(<Hero />);
    const root = container.firstElementChild;
    const view = within(container);
    const heading = view.getByRole('heading', {
      name: 'Simplifying complex network data collection.',
    });
    const heroContainer = heading.parentElement;
    const mediaRow = view.getByText(/Network Canvas provides/).parentElement;
    const mediaSizer =
      container.querySelector('video, img')?.parentElement?.parentElement;
    const [newsBadge] = view.getAllByText('Latest News:');
    const newsWrapper = newsBadge?.parentElement?.parentElement?.parentElement;
    const ctaWrapper = view.getByRole('link', {
      name: 'Get Started',
    }).parentElement;

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
});
